import { logError } from '../../utils/logger.js';
import { getSession } from '../../auth/sessionService.js';
import { getIdentity, getHierarchyIds } from './governanceRuntime.js';
import { canOpenVisitForCustomer } from '../runtime/workflowAuthority.js';
import { readConfig } from '../../config.js';
import { emit, EVENTS } from '../runtime/eventBus.js';
import { orchestratedFetch } from '../runtime/requestOrchestrator.js';

const STORAGE_KEY = 'v2_visits';
const ACTIVE_KEY = 'v2_active_visit';
const API = readConfig().baseUrl;

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

function _employeeId() {
  return getIdentity()?.employeeId || getSession()?.actor?.id || null;
}

function _roleCode() {
  return String(getIdentity()?.roleCode || getSession()?.role?.roleCode || '').toLowerCase();
}

function _isAdmin() {
  const role = _roleCode();
  return Boolean(getIdentity()?.isAdmin || ['admin', 'super_admin', 'chairman', 'executive_manager', 'executive_supervisor'].includes(role));
}

function _scopeIds() {
  const ids = getHierarchyIds?.() || [];
  const eid = _employeeId();
  return [...new Set([...(Array.isArray(ids) ? ids : []), eid].filter(Boolean).map(String))];
}

function _canAccessVisit(visit) {
  if (!visit) return { allowed: false, reason: 'الزيارة غير موجودة' };
  if (_isAdmin()) return { allowed: true, reason: null };

  const scope = _scopeIds();
  const visitEmp = String(visit.employee_id || '');
  if (!visitEmp) return { allowed: false, reason: 'لا تملك صلاحية الوصول لهذه الزيارة' };

  if (scope.includes(visitEmp)) return { allowed: true, reason: null };
  return { allowed: false, reason: 'لا تملك صلاحية الوصول لهذه الزيارة' };
}

function _filterOwned(visits) {
  const scope = _scopeIds();
  if (_isAdmin()) return visits;
  return visits.filter(v => scope.includes(String(v.employee_id || '')));
}

// ─── DB-backed Active Visit Sync ──────────────
async function _fetchActiveVisitFromDb() {
  const eid = _employeeId();
  if (!eid) return null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const r = await orchestratedFetch(`${API}/visits?select=id,customer_id,employee_id,visit_status,check_in_time&employee_id=eq.${eid}&check_in_time=gte.${today}&check_in_time=lt.${tomorrow}&visit_status=eq.open&limit=1`, { headers: _headers(), dedup: true, tag: 'visits' });
    if (!r.ok) {
      console.warn('[visits] _fetchActiveVisitFromDb failed', r.status, r.statusText);
      return null;
    }
    const arr = await r.json();
    if (!arr.length) return null;
    const db = arr[0];
    return {
      id: db.id,
      customer_id: db.customer_id,

      employee_id: db.employee_id,
      status: db.visit_status === 'open' ? 'active' : db.visit_status,
      opened_at: db.check_in_time || new Date().toISOString(),
      _source: 'db',
    };
  } catch (e) { console.warn('[visits] _fetchActiveVisitFromDb exception', e.message); return null; }
}

export async function syncActiveVisit() {
  // 1. Check sessionStorage first
  const local = getActiveVisit();
  if (local) return local;

  // 2. Fallback: check DB for open visit
  const dbVisit = await _fetchActiveVisitFromDb();
  if (dbVisit) {
    _setActive(dbVisit);
    return dbVisit;
  }
  return null;
}

// ─── GPS ───────────────────────────────────────

function _gpsReading() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude);
        const lng = Number(pos.coords.longitude);
        const accuracy = Number(pos.coords.accuracy);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) { resolve(null); return; }
        resolve({ lat, lng, accuracy, ts: Date.now() });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

export async function captureGps() {
  if (!navigator.geolocation) return null;

  const samples = [];
  for (let i = 0; i < 3; i++) {
    const r = await _gpsReading();
    if (r) samples.push(r);
    if (samples.length >= 2 && samples.some(s => s.accuracy <= 10)) break;
    if (i < 2) await new Promise(r => setTimeout(r, 500));
  }

  if (!samples.length) {
    const fallback = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude);
          const lng = Number(pos.coords.longitude);
          const accuracy = Number(pos.coords.accuracy);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) { resolve(null); return; }
          resolve({ lat, lng, accuracy, ts: Date.now() });
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    });
    if (!fallback) return null;
    samples.push(fallback);
  }

  samples.sort((a, b) => a.accuracy - b.accuracy);
  const best = samples[0];

  return {
    lat: best.lat,
    lng: best.lng,
    accuracy: best.accuracy,
    mapsUrl: `https://maps.google.com/?q=${best.lat},${best.lng}`,
    accLabel: best.accuracy <= 10 ? 'ممتازة' : best.accuracy <= 15 ? 'دقيقة' : best.accuracy <= 30 ? 'جيدة' : best.accuracy <= 50 ? 'ضعيفة' : 'مرفوضة',
  };
}

// ─── Canonical Visit Status ──────────────────

export const VISIT_STATUS = {
  active:    { label: 'زيارة نشطة',       icon: '🔍', badge: 'v2-status-open' },
  completed: { label: 'تم إنهاء الزيارة',  icon: '✅', badge: 'v2-status-done' },
  cancelled: { label: 'ملغية',        icon: '❌', badge: 'v2-status-cancelled' },
};

export function visitStatusLabel(status) {
  return VISIT_STATUS[status]?.label || status || 'حالة غير معروفة';
}

export function visitStatusIcon(status) {
  return VISIT_STATUS[status]?.icon || '❌';
}

// ─── Active Visit (singleton) ──────────────────

export function getActiveVisit() {
  try {
    const v = sessionStorage.getItem(ACTIVE_KEY);
    const visit = v ? JSON.parse(v) : null;
    if (visit && String(visit.employee_id || '') !== String(_employeeId() || '')) return null;
    return visit;
  } catch { return null; }
}

function _setActive(visit) {
  try { sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(visit)); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function clearActiveVisit() {
  try { sessionStorage.removeItem(ACTIVE_KEY); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export async function hasActiveVisit() {
  const v = await syncActiveVisit();
  return !!v;
}

// ─── All Visits (employee-scoped) ──────────────

function _allRaw() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function _save(all) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

function _genId() {
  return 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// ─── Start Visit ───────────────────────────────

export async function startVisit(customerId, customerName, customerPhone, customerAddress, notes) {
  const eid = _employeeId();
  if (!eid) throw new Error('يجب تسجيل الدخول أولاً');
  if (await hasActiveVisit()) throw new Error('لا يوجد لديك زيارة نشطة بالفعل');

  const g = await canOpenVisitForCustomer(customerId, getIdentity() || { employeeId: eid, roleCode: _roleCode() });
  if (!g.allowed) throw new Error(g.reason || 'لا تملك صلاحية إنشاء هذه الزيارة');

  const gps = await captureGps();
  const s = getSession();
  const now = new Date().toISOString();
  function _gpsLevel(a) {
    if (!a && a !== 0) return 'none';
    if (a <= 10) return 'excellent';
    if (a <= 15) return 'accurate';
    if (a <= 30) return 'good';
    if (a <= 50) return 'weak';
    return 'rejected';
  }
  const visit = {
    id: _genId(),
    customer_id: customerId,
    customer_name: customerName || '',
    customer_phone: customerPhone || '',
    customer_address: customerAddress || '',
    status: 'active',
    opened_at: now,
    closed_at: null,
    completed_at: null,
    duration_ms: null,
    gps_start: gps,
    gps_end: null,
    gps_accuracy: _gpsLevel(gps?.accuracy),
    notes: notes || '',
    employee_name: s?.actor?.fullName || '',
    employee_id: eid,
    timeline: [{ type: 'visit_opened', timestamp: now, data: { gps: gps || null, notes: notes || '' } }],
    collections: [],
    order_ids: [],
    total_orders: 0,
    total_collections: 0,
    total_collected_amount: 0,
  };
  const all = _allRaw();
  all.push(visit);
  _save(all);
  _setActive(visit);
  emit(EVENTS.VISIT_STARTED, { visitId: visit.id, customerId, customerName, employeeId: eid });
  return visit;
}

// ─── Complete Visit ────────────────────────────

export async function completeVisit() {
  const active = await syncActiveVisit();
  if (!active) throw new Error('لا توجد زيارة نشطة');
  const access = _canAccessVisit(active);
  if (!access.allowed) throw new Error(access.reason);
  const gps = await captureGps();
  const now = new Date().toISOString();

  // If visit originated from DB (field domain), complete via field API
  if (active._source === 'db') {
    try {
      const r = await orchestratedFetch(`${API}/visits?id=eq.${active.id}`, {
        method: 'PATCH', headers: _headers(), dedup: false,
        body: JSON.stringify({
          visit_status: 'completed',
          check_out_time: now,
          visit_outcome: 'completed',
        }),
      });
      if (!r.ok) throw new Error('فشل تحديث الزيارة');
    } catch (e) {
      throw new Error('فشل تحديث الزيارة: ' + (e.message || ''));
    }
    clearActiveVisit();
    emit(EVENTS.VISIT_COMPLETED, { visitId: active.id, customerId: active.customer_id, employeeId: active.employee_id });
    return { ...active, status: 'completed', closed_at: now, completed_at: now };
  }

  // Local visit completion (storefront)
  const opened = new Date(active.opened_at).getTime();
  const closed = new Date(now).getTime();
  const duration_ms = closed - opened;
  const all = _allRaw();
  const idx = all.findIndex(v => v.id === active.id);
  if (idx < 0) throw new Error('الزيارة غير موجودة');
  function _gpsLevel(a) {
    if (!a && a !== 0) return 'none';
    if (a <= 10) return 'excellent';
    if (a <= 15) return 'accurate';
    if (a <= 30) return 'good';
    if (a <= 50) return 'weak';
    return 'rejected';
  }
  all[idx] = {
    ...all[idx],
    status: 'completed',
    closed_at: now,
    completed_at: now,
    duration_ms,
    gps_end: gps,
    gps_accuracy: _gpsLevel(gps?.accuracy),
    timeline: [...all[idx].timeline, { type: 'visit_closed', timestamp: now, data: { duration_ms, gps: gps || null } }],
  };
  _save(all);
  clearActiveVisit();
  emit(EVENTS.VISIT_COMPLETED, { visitId: active.id, customerId: active.customer_id, employeeId: active.employee_id });
  return all[idx];
}

// ─── Cancel Visit ──────────────────────────────

export async function cancelVisit() {
  const active = await syncActiveVisit();
  if (!active) return null;
  const access = _canAccessVisit(active);
  if (!access.allowed) throw new Error(access.reason);
  const now = new Date().toISOString();

  // DB-originated visit: cancel via field API
  if (active._source === 'db') {
    try {
      await orchestratedFetch(`${API}/visits?id=eq.${active.id}`, {
        method: 'PATCH', headers: _headers(), dedup: false,
        body: JSON.stringify({ visit_status: 'cancelled', check_out_time: now }),
      });
    } catch { /* swallow */ }
    clearActiveVisit();
    emit(EVENTS.VISIT_CANCELLED, { visitId: active.id, customerId: active.customer_id, employeeId: active.employee_id });
    return { ...active, status: 'cancelled', closed_at: now };
  }

  // Local visit cancel
  const all = _allRaw();
  const idx = all.findIndex(v => v.id === active.id);
  if (idx >= 0) {
    all[idx].status = 'cancelled';
    all[idx].closed_at = now;
    all[idx].timeline.push({ type: 'visit_cancelled', timestamp: now, data: {} });
    _save(all);
  }
  clearActiveVisit();
  return idx >= 0 ? all[idx] : null;
}

// ─── Find by ID (with ownership) ───────────────

function _findOwnedVisit(visitId) {
  const all = _allRaw();
  const idx = all.findIndex(v => v.id === visitId);
  if (idx < 0) throw new Error('الزيارة غير موجودة');
  const access = _canAccessVisit(all[idx]);
  if (!access.allowed) throw new Error(access.reason);
  return { all, idx, visit: all[idx] };
}

// ─── Add Timeline Event ────────────────────────

export function addTimelineEvent(visitId, type, data) {
  const { all, idx } = _findOwnedVisit(visitId);
  const ts = new Date().toISOString();
  all[idx].timeline.push({ type, timestamp: ts, data: data || {} });
  all[idx].updated_at = ts;
  _save(all);
  if (getActiveVisit()?.id === visitId) _setActive(all[idx]);
  return all[idx];
}

// ─── Add Collection ────────────────────────────

export async function addCollection(visitId, amount, method, notes) {
  const { all, idx } = _findOwnedVisit(visitId);
  const gps = await captureGps();
  const col = {
    id: 'col_' + Date.now().toString(36),
    amount: Number(amount),
    method: method || 'cash',
    notes: notes || '',
    timestamp: new Date().toISOString(),
    gps: gps || null,
  };
  all[idx].collections.push(col);
  all[idx].total_collections = all[idx].collections.length;
  all[idx].total_collected_amount = all[idx].collections.reduce((s, c) => s + c.amount, 0);
  all[idx].timeline.push({ type: 'collection', timestamp: col.timestamp, data: col });
  all[idx].updated_at = col.timestamp;
  _save(all);
  if (getActiveVisit()?.id === visitId) _setActive(all[idx]);
  return all[idx];
}

// ─── Link Order ────────────────────────────────

export function linkOrderToVisit(visitId, orderId, orderNumber) {
  const { all, idx } = _findOwnedVisit(visitId);
  if (!all[idx].order_ids.includes(orderId)) {
    all[idx].order_ids.push(orderId);
    all[idx].total_orders = all[idx].order_ids.length;
    all[idx].timeline.push({
      type: 'order_created',
      timestamp: new Date().toISOString(),
      data: { order_id: orderId, order_number: orderNumber || '' },
    });
  }
  all[idx].updated_at = new Date().toISOString();
  _save(all);
  if (getActiveVisit()?.id === visitId) _setActive(all[idx]);
  return all[idx];
}

// ─── Add Note ──────────────────────────────────

export function addVisitNote(visitId, text) {
  return addTimelineEvent(visitId, 'note_added', { text });
}

// ─── Read (employee-scoped) ────────────────────

export function getVisits() {
  const all = _filterOwned(_allRaw());
  return all.sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));
}

export function getVisit(id) {
  const v = _allRaw().find(v => v.id === id) || null;
  if (!v) return null;
  const access = _canAccessVisit(v);
  if (!access.allowed) return null;
  return v;
}

export function getActiveVisitOrders() {
  const active = getActiveVisit();
  if (!active) return [];
  return active.order_ids || [];
}

// ─── Duration Format ──────────────────────────

export function formatDuration(ms) {
  if (!ms && ms !== 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}س ${m}د`;
  if (m > 0) return `${m}د ${s}ث`;
  return `${s}ث`;
}

export function formatDurationLive(startIso) {
  if (!startIso) return '—';
  const ms = Date.now() - new Date(startIso).getTime();
  return formatDuration(ms);
}

