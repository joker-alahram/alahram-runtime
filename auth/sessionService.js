import { readConfig } from '../config.js';
import { normalizePhone } from '../services/runtime/identityService.js';
import * as localAuth from '../services/runtime/localAuthService.js';
import { emit, EVENTS } from '../services/runtime/eventBus.js';
import { startSpan, recordMetric } from '../services/runtime/runtimeTelemetry.js';
import { declareAuthority, DOMAINS } from '../services/runtime/storageGovernance.js';

const API = readConfig().baseUrl;
const STORAGE_KEY = 'v2_session';

let _session = {
  status: 'anonymous',
  actor: null,
  role: null,
  identity: null,
  hydratedAt: null,
};
let _runtimeToken = null;

const _listeners = new Set();
let _generation = 0;

declareAuthority(DOMAINS.SESSION, 'sessionService');

function _notify(source) {
  console.log(`[runtime] _notify from [${source||'?'}]`, { status: _session.status, actorType: _session.actor?.type, hasActor: !!_session.actor });
  _listeners.forEach(fn => { try { fn(_session); } catch(e) { console.error('[runtime] subscriber threw:', e); } });
}

function _headers(token) {
  const { apiKey } = readConfig();
  const h = { apikey: apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function _buildSession(localData) {
  const user = localData.user;
  const activeActor = localData.active_actor;
  const record = activeActor?.record || {};
  const isEmp = activeActor?.type === 'employee';
  return {
    status: 'authenticated',
    actor: _parseActor(activeActor?.type || '', {
      id: record.id || '',
      employeeCode: record.employee_code || '',
      fullName: record.full_name || user?.full_name || '',
      phone: record.phone || user?.phone || '',
    }),
    role: isEmp
      ? { roleCode: record.role_code || '', roleName: record.role_name || '' }
      : { roleCode: 'customer', roleName: 'عميل' },
    identity: { normalizedPhone: user?.normalized_phone || '', runtimeId: user?.id },
    hydratedAt: new Date().toISOString(),
  };
}

function _parseActor(type, actorRecord) {
  return {
    type,
    id: actorRecord.id || '',
    employeeCode: actorRecord.employeeCode || '',
    fullName: actorRecord.fullName || '',
    phone: actorRecord.phone || '',
  };
}

export function getSession() { return _session; }

export function getRuntimeToken() { return _runtimeToken; }

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export async function login(phone, password) {
  const gen = ++_generation;
  const data = await localAuth.login(phone, password);
  if (_generation !== gen) return _session;

  _runtimeToken = data.session.token;
  _session = _buildSession(data);
  console.log('[runtime] login: session built', { status: _session.status, actorType: _session.actor?.type, fullName: _session.actor?.fullName, roleCode: _session.role?.roleCode });
  _persist();
  _notify();
  emit(EVENTS.SESSION_RESTORED, { actorType: _session.actor?.type, roleCode: _session.role?.roleCode, fullName: _session.actor?.fullName });
  return _session;
}

export async function logout() {
  const gen = ++_generation;
  if (_runtimeToken) {
    try { await localAuth.logout(_runtimeToken); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  }
  if (_generation !== gen) return;
  _runtimeToken = null;
  _session = { status: 'anonymous', actor: null, role: null, identity: null, hydratedAt: null };
  _clearPersisted();
  try {
    sessionStorage.removeItem('v2_runtime_active_visit');
    sessionStorage.removeItem('v2_active_visit');
    sessionStorage.removeItem('v2_offline_queue');
    sessionStorage.removeItem('v2_visits');
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  _notify();
  emit(EVENTS.SESSION_EXPIRED, { reason: 'logout' });
}

export async function restoreSession() {
  const span = startSpan('session_restore');
  const gen = ++_generation;
  const saved = _loadPersisted();
  if (!saved) {
    _session.status = 'anonymous';
    _notify();
    span.end({ status: 'anonymous', reason: 'no_saved_session' });
    return _session;
  }

  const storedToken = saved.runtimeToken;
  if (!storedToken) {
    _session.status = 'anonymous';
    _clearPersisted();
    _notify();
    span.end({ status: 'anonymous', reason: 'no_stored_token' });
    return _session;
  }

  try {
    const data = await localAuth.restoreSession(storedToken);
    if (_generation !== gen) return _session;

    if (!data) {
      _session = { status: 'expired', actor: null, role: null, identity: null, hydratedAt: null };
      _clearPersisted();
      _notify();
      span.end({ status: 'expired', reason: 'verify_failed' });
      emit(EVENTS.SESSION_EXPIRED, { reason: 'verify_failed' });
      return _session;
    }

    _runtimeToken = storedToken;
    _session = _buildSession(data);
    _persist();
    _notify();
    span.end({ status: 'authenticated', actorType: _session.actor?.type });
    recordMetric('session_restore_ms', span.duration || 0);
    emit(EVENTS.SESSION_RESTORED, { actorType: _session.actor?.type, roleCode: _session.role?.roleCode, fullName: _session.actor?.fullName });
    return _session;
  } catch {
    if (_generation !== gen) return _session;
    _session = { status: 'expired', actor: null, role: null, identity: null, hydratedAt: null };
    _clearPersisted();
    _notify();
    span.end({ status: 'expired', reason: 'exception' });
    emit(EVENTS.SESSION_EXPIRED, { reason: 'exception' });
    return _session;
  }
}

export async function hasCapability(capability) {
  if (_session.status !== 'authenticated' || !_runtimeToken) return false;
  try {
    const res = await fetch(`${API}/rpc/runtime_has_capability`, {
      method: 'POST',
      headers: { apikey: readConfig().apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_runtime_token: _runtimeToken, p_capability: capability }),
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text === 'true' || text === '[true]';
  } catch { return false; }
}

export async function signUpAsCustomer(data) {
  const gen = ++_generation;
  const { phone, password, fullName, governorate, region, address, activityType, latitude, longitude, accuracy } = data;

  const result = await localAuth.register({
    phone, password, fullName, governorate, region,
    address, activityType, latitude, longitude, accuracy,
  });
  if (_generation !== gen) return _session;

  _runtimeToken = result.session.token;
  const normalizedPhone = normalizePhone(phone);

  _session = {
    status: 'authenticated',
    actor: { type: 'customer', id: result.customer?.id || '', fullName, phone: normalizedPhone },
    role: { roleCode: 'customer', roleName: 'عميل' },
    identity: { normalizedPhone, runtimeId: result.user?.id },
    hydratedAt: new Date().toISOString(),
  };

  _persist();
  _notify();
  return _session;
}

function _persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      actor: _session.actor,
      role: _session.role,
      identity: _session.identity,
      hydratedAt: _session.hydratedAt,
      runtimeToken: _runtimeToken,
    }));
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

function _loadPersisted() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}

function _clearPersisted() { try { localStorage.removeItem(STORAGE_KEY); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; } }
