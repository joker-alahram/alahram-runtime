import { logError } from '../../utils/logger.js';
import { resolveProfile } from './runtimeProfile.js';
import { getSession } from '../../auth/sessionService.js';

let _state = {
  profile: null,
  activeVisit: null,
  selectedCustomer: null,
  workspaceMode: 'hidden',
  lastContext: null,
};

const _listeners = new Set();

function _notify() { _listeners.forEach(fn => fn(_state)); }

export function getRuntimeState() { return _state; }

export function subscribe(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }

export function initRuntime() {
  const profile = resolveProfile();
  _state = { ..._state, profile };
  _notify();
  return profile;
}

export function setActiveVisit(visit) {
  const mode = visit && _isEmployee() ? 'minimized' : 'hidden';
  _state = { ..._state, activeVisit: visit, workspaceMode: mode };
  try {
    if (visit) sessionStorage.setItem('v2_runtime_active_visit', JSON.stringify(visit));
    else sessionStorage.removeItem('v2_runtime_active_visit');
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  _notify();
}

export function clearActiveVisit() {
  _state = { ..._state, activeVisit: null, workspaceMode: 'hidden' };
  try { sessionStorage.removeItem('v2_runtime_active_visit'); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  _notify();
}

export function setWorkspaceMode(mode) {
  _state = { ..._state, workspaceMode: mode };
  _notify();
}

export function setSelectedCustomer(customer) {
  _state = { ..._state, selectedCustomer: customer };
  _notify();
}

export function restoreLastContext() {
  if (_state.activeVisit) return _state.activeVisit;
  try {
    const saved = sessionStorage.getItem('v2_runtime_active_visit');
    if (saved) {
      const visit = JSON.parse(saved);
      if (visit && visit.status === 'active') {
        const mode = _isEmployee() ? 'minimized' : 'hidden';
        _state = { ..._state, activeVisit: visit, workspaceMode: mode };
        _notify();
        return visit;
      }
    }
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  return null;
}

export function canShowWorkspace() {
  return _isEmployee();
}

function _isEmployee() {
  const s = getSession();
  return s?.status === 'authenticated' && s?.actor?.type === 'employee';
}

