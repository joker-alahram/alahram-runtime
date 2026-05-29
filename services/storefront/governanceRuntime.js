import { getSession, getRuntimeToken } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { emit, EVENTS } from '../runtime/eventBus.js';
import { startSpan, recordMetric } from '../runtime/runtimeTelemetry.js';
import { declareAuthority, DOMAINS } from '../runtime/storageGovernance.js';

declareAuthority(DOMAINS.ACTOR, 'governanceRuntime');

const API = readConfig().baseUrl;

function _headers() {
  return { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
}

/* ═══════════════════════════════════════════════════════
   1. RUNTIME IDENTITY
   ═══════════════════════════════════════════════════════ */

let _identity = null;
let _hierarchyIds = [];   // cached descendant employee IDs (self + team)

export function clearIdentity() {
  _identity = null;
  _hierarchyIds = [];
}

export async function hydrateIdentity() {
  const s = getSession();
  if (s?.status !== 'authenticated' || !s?.actor?.id) {
    _identity = null; _hierarchyIds = [];
    console.log('[runtime] hydrateIdentity: not authenticated or no actor id → null');
    return null;
  }

  const runtimeToken = getRuntimeToken();
  const actorType = s?.actor?.type || null;
  const identity = {
    runtimeIdentityId: s?.identity?.runtimeId || null,
    normalizedPhone: s?.identity?.normalizedPhone || '',
    employeeId: actorType === 'employee' ? s.actor.id : null,
    customerId: actorType === 'customer' ? s.actor.id : null,
    actorType,
    fullName: s?.actor?.fullName || '',
    phone: s?.actor?.phone || '',
    capabilities: {},
    isAdmin: false,
    isSalesManager: false,
    isSalesSupervisor: false,
    isSalesRep: false,
  };

  if (actorType === 'employee' && runtimeToken) {
    try {
      const r = await fetch(`${API}/rpc/runtime_employee_record`, {
        method: 'POST', headers: _headers(),
        body: JSON.stringify({ p_runtime_token: runtimeToken }),
      });
      if (r.ok) {
        const rec = await r.json();
        identity.capabilities = rec?.capabilities || {};
        identity.isAdmin = !!rec?.capabilities?.can_manage_system;
        identity.isSalesManager = rec?.role_code === 'sales_manager';
        identity.isSalesSupervisor = rec?.role_code === 'sales_supervisor' || rec?.role_code === 'sales_lead';
        identity.isSalesRep = rec?.role_code === 'sales_rep';
        identity.roleCode = rec?.role_code || s?.role?.roleCode || '';
        if (!identity.isAdmin && ['ADMIN', 'SUPER_ADMIN', 'CHAIRMAN'].includes(identity.roleCode)) identity.isAdmin = true;
        console.log('[runtime] hydrateIdentity: employee', { id: s.actor.id, roleCode: identity.roleCode, capabilities: Object.keys(identity.capabilities).length, isAdmin: identity.isAdmin });
      } else {
        console.log('[runtime] hydrateIdentity: current_employee_record failed', r.status, '— falling back to session role');
        identity.roleCode = s?.role?.roleCode || '';
        if (['ADMIN', 'SUPER_ADMIN', 'CHAIRMAN'].includes(identity.roleCode)) identity.isAdmin = true;
      }
    } catch (e) {
      console.log('[runtime] hydrateIdentity: current_employee_record exception', e.message, '— falling back to session role');
      identity.roleCode = s?.role?.roleCode || '';
      if (['ADMIN', 'SUPER_ADMIN', 'CHAIRMAN'].includes(identity.roleCode)) identity.isAdmin = true;
    }
  }

  if (actorType === 'customer') {
    console.log('[runtime] hydrateIdentity: customer', { id: s.actor.id, fullName: s.actor.fullName });
  }

  _identity = identity;
  _hierarchyIds = await _fetchHierarchyIds();
  console.log('[runtime] hydrateIdentity: complete', { actorType, fullName: identity.fullName, isAdmin: identity.isAdmin, hierarchyCount: _hierarchyIds.length });
  emit(EVENTS.PROFILE_RESOLVED, { actorType, fullName: identity.fullName, isAdmin: identity.isAdmin, capabilities: Object.keys(identity.capabilities).length });
  return identity;
}

export function getIdentity() {
  return _identity;
}

export function getHierarchyIds() {
  return _hierarchyIds;
}

function _has(cap) {
  return _identity?.capabilities?.[cap] === true;
}

/* ═══════════════════════════════════════════════════════
   1b. HIERARCHY RESOLUTION
   ═══════════════════════════════════════════════════════ */

async function _fetchHierarchyIds() {
  const id = _identity?.employeeId;
  if (!id) return [];
  // Admins / can_view_all_reports: no hierarchy filter needed (null = all)
  if (_has('can_view_all_reports') || _identity?.isAdmin) return [];
  try {
    const r = await fetch(`${API}/rpc/get_employee_descendants`, {
      method: 'POST', headers: _headers(),
      body: JSON.stringify({ p_employee_id: id, p_max_depth: 10 }),
    });
    if (r.ok) {
      const rows = await r.json();
      return rows.map(r => r.employee_id);
    }
  } catch { /* fallback: just self */ }
  return [id];
}

export async function fetchEmployeeDescendants(employeeId) {
  try {
    const r = await fetch(`${API}/rpc/get_employee_descendants`, {
      method: 'POST', headers: _headers(),
      body: JSON.stringify({ p_employee_id: employeeId, p_max_depth: 10 }),
    });
    if (r.ok) {
      const rows = await r.json();
      return rows.map(r => r.employee_id);
    }
  } catch { /* fallback */ }
  return [employeeId];
}

/* ═══════════════════════════════════════════════════════
   2. ACCESS CONTROL — throw on denial
   ═══════════════════════════════════════════════════════ */

export function requireIdentity() {
  if (!_identity) throw new Error('يجب تسجيل الدخول أولاً');
}

export function requireCapability(cap) {
  requireIdentity();
  if (!_has(cap)) throw new Error('لا تملك صلاحية كافية');
}

/* ═══════════════════════════════════════════════════════
   3. CANONICAL GUARD FUNCTIONS
   All return { allowed: boolean, reason: string | null }
   ═══════════════════════════════════════════════════════ */

// ── Orders / Invoices ────────────────────────────

export function canViewOrder(order) {
  if (!_identity) return { allowed: false, reason: 'يجب تسجيل الدخول أولاً' };
  if (_has('can_view_all_reports') || _identity.isAdmin) return { allowed: true, reason: null };
  if (_identity.actorType === 'employee') {
    if (!order.created_by_employee_id) return { allowed: false, reason: 'لا تملك صلاحية عرض هذه الفاتورة' };
    if (order.created_by_employee_id === _identity.employeeId) return { allowed: true, reason: null };
    if (_hierarchyIds.includes(order.created_by_employee_id)) return { allowed: true, reason: null };
    return { allowed: false, reason: 'لا تملك صلاحية عرض هذه الفاتورة' };
  }
  if (_identity.actorType === 'customer') {
    if (order.customer_id === _identity.customerId) return { allowed: true, reason: null };
    return { allowed: false, reason: 'لا تملك صلاحية عرض هذه الفاتورة' };
  }
  return { allowed: false, reason: 'لا تملك صلاحية عرض هذه الفاتورة' };
}

export function canCreateOrder() {
  if (!_identity) return { allowed: false, reason: 'يجب تسجيل الدخول أولاً' };
  if (_identity.actorType === 'customer') return { allowed: true, reason: null };
  if (_has('can_manage_system') || _has('can_view_all_reports') || _identity.isAdmin) return { allowed: true, reason: null };
  if (_has('can_create_orders')) return { allowed: true, reason: null };
  return { allowed: false, reason: 'لا تملك صلاحية إنشاء فاتورة' };
}

// ── Visits ────────────────────────────────────────

export async function canOpenVisit() {
  if (!_identity) return { allowed: false, reason: 'يجب تسجيل الدخول أولاً' };
  if (_identity.isAdmin || _has('can_manage_system') || _has('can_view_all_reports')) return { allowed: true, reason: null };
  if (_identity.actorType === 'employee') {
    try {
      const r = await fetch(`${API}/customer_assignments?employee_id=eq.${_identity.employeeId}&select=customer_id&limit=1`, { headers: _headers() });
      if (r.ok) {
        const arr = await r.json();
        if (arr.length) return { allowed: true, reason: null };
      }
    } catch { /* fall through */ }
  }
  return { allowed: false, reason: 'لا تملك صلاحية فتح زيارة' };
}

export function canManageVisit(visit) {
  if (!_identity) return { allowed: false, reason: 'يجب تسجيل الدخول أولاً' };
  if (_identity.isAdmin) return { allowed: true, reason: null };
  if (_identity.actorType === 'employee') {
    if (visit.employee_id === _identity.employeeId) return { allowed: true, reason: null };
    if (_hierarchyIds.includes(visit.employee_id)) return { allowed: true, reason: null };
    return { allowed: false, reason: 'لا تملك صلاحية على هذه الزيارة' };
  }
  return { allowed: false, reason: 'لا تملك صلاحية على هذه الزيارة' };
}

// ── Customers ─────────────────────────────────────

export async function canViewCustomer(customerId) {
  if (!_identity) return { allowed: false, reason: 'يجب تسجيل الدخول أولاً' };
  if (_has('can_view_all_reports') || _identity.isAdmin) return { allowed: true, reason: null };
  if (_identity.actorType === 'customer') {
    if (customerId === _identity.customerId) return { allowed: true, reason: null };
    return { allowed: false, reason: 'لا تملك صلاحية الوصول لهذا العميل' };
  }
  if (_identity.actorType === 'employee') {
    // Check direct assignment first
    try {
      const r = await fetch(`${API}/customer_assignments?employee_id=eq.${_identity.employeeId}&customer_id=eq.${customerId}&select=customer_id&limit=1`, { headers: _headers() });
      if (r.ok) {
        const arr = await r.json();
        if (arr.length) return { allowed: true, reason: null };
      }
    } catch { /* fall through */ }
    // Check if any descendant has this customer
    for (const eid of _hierarchyIds) {
      if (eid === _identity.employeeId) continue;
      try {
        const r = await fetch(`${API}/customer_assignments?employee_id=eq.${eid}&customer_id=eq.${customerId}&select=customer_id&limit=1`, { headers: _headers() });
        if (r.ok) {
          const arr = await r.json();
          if (arr.length) return { allowed: true, reason: null };
        }
      } catch { /* continue */ }
    }
    return { allowed: false, reason: 'هذا العميل ليس ضمن نطاقك' };
  }
  return { allowed: false, reason: 'لا تملك صلاحية الوصول لهذا العميل' };
}

// ── Employees / Representatives ──────────────────

export function canViewEmployee(employeeId) {
  if (!_identity) return { allowed: false, reason: 'يجب تسجيل الدخول أولاً' };
  if (_has('can_view_all_reports') || _identity.isAdmin) return { allowed: true, reason: null };
  if (_identity.actorType === 'employee') {
    if (employeeId === _identity.employeeId) return { allowed: true, reason: null };
    if (_hierarchyIds.includes(employeeId)) return { allowed: true, reason: null };
    return { allowed: false, reason: 'لا تملك صلاحية الوصول لهذا المندوب' };
  }
  return { allowed: false, reason: 'لا تملك صلاحية الوصول للمندوبين' };
}

export async function canApproveOrder() {
  if (!_identity) return { allowed: false, reason: 'يجب تسجيل الدخول أولاً' };
  if (_identity.isAdmin || _has('can_manage_system') || _has('can_view_all_reports')) return { allowed: true, reason: null };
  if (!_identity.roleCode) return { allowed: false, reason: 'لا تملك صلاحية اعتماد الطلبات' };
  try {
    const r = await fetch(`${API}/workflow_transition_roles?role_code=eq.${_identity.roleCode}&select=transition_id&limit=1`, { headers: _headers() });
    if (r.ok) {
      const arr = await r.json();
      if (arr.length) return { allowed: true, reason: null };
    }
  } catch { /* fall through */ }
  return { allowed: false, reason: 'لا تملك صلاحية اعتماد الطلبات' };
}

export function canManageInventory() {
  if (!_identity) return { allowed: false, reason: 'يجب تسجيل الدخول أولاً' };
  if (_has('can_manage_system') || _has('can_view_all_reports') || _identity.isAdmin) return { allowed: true, reason: null };
  if (_has('can_manage_inventory')) return { allowed: true, reason: null };
  return { allowed: false, reason: 'لا تملك صلاحية إدارة المخزون' };
}

// Governance-root workflow authority — centralizes detection used by transition filtering
export function isWorkflowRoot() {
  if (!_identity) return false;
  return _has('can_manage_system') || _has('can_view_all_reports') || _identity.isAdmin;
}

/* ═══════════════════════════════════════════════════════
   4. SCOPE QUERY BUILDERS
   Returns params object to append to API queries
   ═══════════════════════════════════════════════════════ */

export function scopeOrderParams() {
  if (!_identity) return {};
  if (_has('can_view_all_reports') || _identity.isAdmin) return {};
  if (_identity.actorType === 'employee') {
    const ids = getHierarchyIds();
    if (!ids || !ids.length) return { created_by_employee_id: `eq.${_identity.employeeId}` };
    return { created_by_employee_id: `in.(${ids.join(',')})` };
  }
  if (_identity.actorType === 'customer') {
    return { customer_id: `eq.${_identity.customerId}` };
  }
  return {};
}

export async function scopeCustomerIds() {
  if (!_identity) return [];
  if (_identity.actorType === 'customer') return [_identity.customerId];
  if (_has('can_view_all_reports') || _identity.isAdmin) return null;

  const eids = _hierarchyIds.length ? _hierarchyIds : [_identity.employeeId];
  try {
    // Fetch all customer_assignments for the hierarchy
    const r = await fetch(`${API}/customer_assignments?employee_id=in.(${eids.join(',')})&select=customer_id`, { headers: _headers() });
    if (r.ok) {
      const arr = await r.json();
      const ids = [...new Set(arr.map(a => a.customer_id))];
      return ids;
    }
  } catch { /* fall through */ }
  return [];
}

/* ═══════════════════════════════════════════════════════
   4b. HIERARCHY QUERY HELPERS
   ═══════════════════════════════════════════════════════ */

export function scopeEmployeeIds() {
  if (!_identity) return [];
  if (_has('can_view_all_reports') || _identity.isAdmin) return null; // null = all
  return _hierarchyIds.length ? _hierarchyIds : [_identity.employeeId];
}

/* ═══════════════════════════════════════════════════════
   5. FORBIDDEN UX
   ═══════════════════════════════════════════════════════ */

export function renderForbidden(container, reason, backLabel, backHash) {
  container.innerHTML = `<div class="v2-page" style="text-align:center;padding:4rem 1.5rem">
    <div style="font-size:3rem;margin-bottom:1rem">🚫</div>
    <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:.5rem;color:#dc2626">${reason}</h2>
    <p style="font-size:.875rem;color:var(--v2-text2);margin-bottom:1.5rem">إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع مدير النظام</p>
    <a href="${backHash || '#home'}" class="v2-btn v2-btn-p" style="border-radius:10px;padding:.625rem 1.5rem">${backLabel || 'العودة للرئيسية'}</a>
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   6. SCOPE FILTER BUILDERS (URL query string fragments)
   Returns e.g. "created_by_employee_id=in.(a,b)" or ""
   Caller prepends & when needed.
   ═══════════════════════════════════════════════════════ */

export function buildOrderScopeFilter() {
  if (!_identity) return '';
  if (_has('can_view_all_reports') || _identity.isAdmin) return '';
  if (_identity.actorType === 'employee') {
    const ids = getHierarchyIds();
    if (!ids || !ids.length) return `created_by_employee_id=eq.${_identity.employeeId}`;
    return `created_by_employee_id=in.(${ids.join(',')})`;
  }
  if (_identity.actorType === 'customer') return `customer_id=eq.${_identity.customerId}`;
  return '';
}

export function buildVisitScopeFilter() {
  if (!_identity) return '';
  if (_has('can_view_all_reports') || _identity.isAdmin) return '';
  if (_identity.actorType === 'employee') {
    const ids = getHierarchyIds();
    if (!ids || !ids.length) return `employee_id=eq.${_identity.employeeId}`;
    return `employee_id=in.(${ids.join(',')})`;
  }
  return '';
}

/* ═══════════════════════════════════════════════════════
   7. AGGREGATION HELPERS (scope-aware analytics)
   Operate on pre-scoped data arrays.
   ═══════════════════════════════════════════════════════ */

export function aggregateOrdersByEmployee(orders) {
  const byEmp = {};
  for (const o of orders) {
    const eid = o.created_by_employee_id;
    if (!eid) continue;
    if (!byEmp[eid]) byEmp[eid] = { total: 0, count: 0, lastDate: null };
    byEmp[eid].total += Number(o.total_amount || 0);
    byEmp[eid].count++;
    if (!byEmp[eid].lastDate || o.created_at > byEmp[eid].lastDate) byEmp[eid].lastDate = o.created_at;
  }
  return byEmp;
}

export function aggregateVisitsByEmployee(visits) {
  const byEmp = {};
  for (const v of visits) {
    const eid = v.employee_id;
    if (!eid) continue;
    if (!byEmp[eid]) byEmp[eid] = { visits: 0, active: 0, completed: 0 };
    byEmp[eid].visits++;
    const vs = v.visit_status || v.status || '';
    if (vs === 'active' || vs === 'open') byEmp[eid].active++;
    else if (vs === 'completed') byEmp[eid].completed++;
  }
  return byEmp;
}

export function buildMonthlyData(orders) {
  const monthlyMap = {};
  for (const o of orders) {
    const m = (o.created_at || '').slice(0, 7);
    if (!m) continue;
    if (!monthlyMap[m]) monthlyMap[m] = 0;
    monthlyMap[m] += Number(o.total_amount || 0);
  }
  const months = Object.keys(monthlyMap).sort();
  const maxMonth = Math.max(...Object.values(monthlyMap), 1);
  return { monthlyMap, months, maxMonth };
}

export function rankEmployeesBySales(byEmp) {
  return Object.entries(byEmp).sort((a, b) => b[1].total - a[1].total);
}
