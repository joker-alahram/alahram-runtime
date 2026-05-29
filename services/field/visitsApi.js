import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { getIdentity, getHierarchyIds } from '../storefront/governanceRuntime.js';
import { canOpenVisitForCustomer } from '../runtime/workflowAuthority.js';

const API = readConfig().baseUrl;
const H = () => {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  return h;
};
const EMP = () => getIdentity()?.employeeId || getSession()?.actor?.id || '';

function _roleCode() {
  return String(getIdentity()?.roleCode || getSession()?.role?.roleCode || '').toLowerCase();
}

function _isAdmin() {
  const role = _roleCode();
  return Boolean(getIdentity()?.isAdmin || ['admin', 'super_admin', 'chairman', 'executive_manager', 'executive_supervisor'].includes(role));
}

function _scopeEmployeeIds() {
  const eid = EMP();
  if (_isAdmin()) return null;
  const ids = getHierarchyIds?.() || [];
  return [...new Set([...(Array.isArray(ids) ? ids : []), eid].filter(Boolean).map(String))];
}

function _visitAccessAllowed(visit) {
  if (!visit) return false;
  if (_isAdmin()) return true;
  const scope = _scopeEmployeeIds() || [];
  return scope.includes(String(visit.employee_id || ''));
}

function _todayBounds() {
  const n = new Date();
  const s = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const e = new Date(+s + 86400000);
  return { start: s.toISOString(), end: e.toISOString() };
}

export async function getTodayVisits() {
  const { start, end } = _todayBounds();
  const scope = _scopeEmployeeIds();
  const visFilter = !scope ? '' : `employee_id=in.(${scope.join(',')})&`;
  const r = await fetch(
    `${API}/runtime_visits_with_maps?${visFilter}created_at=gte.${start}&created_at=lt.${end}&order=created_at.desc`,
    { headers: H() },
  );
  if (!r.ok) throw new Error('فشل تحميل الزيارات');
  return r.json();
}

export async function getVisitDetail(visitId) {
  try {
    const r = await fetch(`${API}/rpc/get_visit_detail`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ p_visit_id: visitId }),
    });
    if (r.ok) {
      const data = await r.json();
      const visit = Array.isArray(data) ? data[0] : data;
      if (visit && !_visitAccessAllowed(visit)) throw new Error('لا تملك صلاحية الوصول لهذه الزيارة');
      return visit;
    }
  } catch { /* RPC not available, fallback */ }
  const v = await fetch(`${API}/visits?id=eq.${visitId}&select=*`, { headers: H() });
  if (!v.ok) throw new Error('فشل تحميل تفاصيل الزيارة');
  const arr = await v.json();
  if (!arr.length) throw new Error('الزيارة غير موجودة');
  if (!_visitAccessAllowed(arr[0])) throw new Error('لا تملك صلاحية الوصول لهذه الزيارة');
  return arr[0];
}

export async function checkIn(customerId, lat, lng, note) {
  const g = await canOpenVisitForCustomer(customerId, getIdentity() || { employeeId: EMP(), roleCode: _roleCode() });
  if (!g.allowed) throw new Error(g.reason || 'لا تملك صلاحية فتح هذه الزيارة');

  try {
    const r = await fetch(`${API}/rpc/check_in_visit`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        p_customer_id: customerId, p_employee_id: EMP(),
        p_latitude: lat, p_longitude: lng, p_note: note || null,
      }),
    });
    if (r.ok) return r.json();
  } catch { /* RPC not available, fallback */ }

  const r = await fetch(`${API}/visits`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({
      customer_id: customerId,
      employee_id: EMP(),
      visit_status: 'open',
      check_in_time: new Date().toISOString(),
      note: note || null,
    }),
  });
  if (!r.ok) throw new Error('فشل بدء الزيارة');
  return r.json();
}

export async function checkOut(visitId, outcome, note, lat, lng) {
  const visit = await getVisitDetail(visitId);
  if (!visit) throw new Error('الزيارة غير موجودة');
  if (!_visitAccessAllowed(visit)) throw new Error('لا تملك صلاحية إنهاء هذه الزيارة');

  try {
    const r = await fetch(`${API}/rpc/check_out_visit`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        p_visit_id: visitId, p_employee_id: EMP(),
        p_outcome: outcome, p_note: note || null,
        p_latitude: lat ?? null, p_longitude: lng ?? null,
      }),
    });
    if (r.ok) return r.json();
  } catch { /* RPC not available, fallback */ }

  const r = await fetch(`${API}/visits?id=eq.${visitId}`, {
    method: 'PATCH', headers: H(),
    body: JSON.stringify({
      visit_status: outcome === 'completed' ? 'completed' : 'cancelled',
      check_out_time: new Date().toISOString(),
      visit_outcome: outcome,
      note: note || null,
    }),
  });
  if (!r.ok) throw new Error('فشل إنهاء الزيارة');
  return { success: true };
}

export async function logLocation(lat, lng, accuracy, visitId) {
  try {
    const visit = visitId ? await getVisitDetail(visitId).catch(() => null) : null;
    if (visitId && visit && !_visitAccessAllowed(visit)) return;
    await fetch(`${API}/rpc/log_rep_location`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        p_employee_id: EMP(), p_latitude: lat, p_longitude: lng,
        p_accuracy: accuracy ?? null, p_visit_id: visitId ?? null,
      }),
    });
  } catch { /* RPC not available, silently ignore */ }
}

export async function getMyCustomers() {
  const scope = _scopeEmployeeIds();
  if (_isAdmin() || !scope) {
    const r = await fetch(`${API}/runtime_customer_visibility?select=id,customer_name,phone,address&is_active=eq.true&order=customer_name.asc&limit=200`, { headers: H() });
    if (!r.ok) return [];
    return r.json();
  }

  const assigns = await fetch(
    `${API}/customer_assignments?employee_id=in.(${scope.join(',')})&select=customer_id`,
    { headers: H() },
  ).then(r => r.ok ? r.json() : []);
  const customerIds = [...new Set((Array.isArray(assigns) ? assigns : []).map(r => String(r.customer_id)).filter(Boolean))];
  if (!customerIds.length) return [];

  const r = await fetch(
    `${API}/runtime_customer_visibility?id=in.(${customerIds.join(',')})&select=id,customer_name,phone,address&is_active=eq.true&order=customer_name.asc&limit=200`,
    { headers: H() },
  );
  if (!r.ok) return [];
  return r.json();
}

export async function addVisitNote(visitId, note) {
  const visit = await getVisitDetail(visitId);
  if (!visit) throw new Error('الزيارة غير موجودة');
  if (!_visitAccessAllowed(visit)) throw new Error('لا تملك صلاحية إضافة الملاحظة');

  try {
    const r = await fetch(`${API}/rpc/add_visit_note`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ p_visit_id: visitId, p_note: note, p_employee_id: EMP() }),
    });
    if (r.ok) return r.json();
  } catch { /* RPC not available, fallback */ }
  const r = await fetch(`${API}/visit_notes`, {
    method: 'POST', headers: H(),
    body: JSON.stringify({ visit_id: visitId, note, created_by_employee_id: EMP() }),
  });
  if (!r.ok) throw new Error('فشل إضافة الملاحظة');
  return r.json();
}

export async function getVisitTransitions() {
  const r = await fetch(`${API}/workflow_transitions?domain=eq.visit&select=*`, {
    headers: H(),
  });
  if (!r.ok) return [];
  return r.json();
}
