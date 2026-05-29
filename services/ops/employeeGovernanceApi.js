import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  return h;
}

async function _rpc(name, params) {
  const r = await fetch(`${API}/rpc/${name}`, { method: 'POST', headers: _h(), body: JSON.stringify(params || {}) });
  if (!r.ok) { const t = await r.text(); throw new Error(t || `RPC ${name} failed`); }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) return r.json();
  return null;
}

export async function getEmployeeProfile(employeeId) {
  return _rpc('get_employee_basic_profile', { p_employee_id: employeeId });
}

export async function getEffectiveCapabilities(employeeId) {
  return _rpc('get_employee_effective_capabilities', { p_employee_id: employeeId });
}

export async function getAllCapabilities() {
  return _rpc('get_all_capabilities_grouped', {});
}

export async function setDirectCapability(employeeId, capabilityCode, granted, grantedById) {
  const result = await _rpc('set_employee_direct_capability', { p_employee_id: employeeId, p_capability_code: capabilityCode, p_granted: granted, p_granted_by_id: grantedById || null });
  if (result && !result.success) throw new Error(result.error || 'Failed to set capability');
  return result;
}

export async function changePassword(employeeId, newPassword) {
  const result = await _rpc('change_employee_password', { p_employee_id: employeeId, p_new_password: newPassword });
  if (result && !result.success) throw new Error(result.error || 'Failed to change password');
  return result;
}

export async function setAccountStatus(employeeId, action) {
  const result = await _rpc('set_employee_account_status', { p_employee_id: employeeId, p_action: action });
  if (result && !result.success) throw new Error(result.error || 'Failed to set account status');
  return result;
}

export async function getAuditTrail(employeeId) {
  return _rpc('get_employee_audit_trail', { p_employee_id: employeeId });
}

export async function logGovernanceAction(entityId, actionType, entityType, oldData, newData, actorName) {
  const s = getSession();
  return _rpc('log_employee_governance_action', {
    p_employee_id: entityId,
    p_action_type: actionType,
    p_entity_type: entityType,
    p_old_data: oldData || null,
    p_new_data: newData || null,
    p_actor_type: 'employee',
    p_actor_id: s?.actor?.id || null,
    p_actor_name: actorName || s?.actor?.fullName || null,
    p_source_module: 'governance',
  });
}

export async function updateEmployeeProfile(employeeId, fields) {
  const s = getSession();
  const h = _h();
  h['Content-Type'] = 'application/json';
  h['Prefer'] = 'return=representation';
  const r = await fetch(`${API}/employees?id=eq.${employeeId}`, {
    method: 'PATCH', headers: h, body: JSON.stringify(fields),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t || 'Failed to update employee'); }
  const rows = await r.json();
  return rows?.[0] || null;
}

export async function getRoles() {
  const r = await fetch(`${API}/roles?select=id,role_code,role_name,is_active&order=role_name.asc`, { headers: _h() });
  if (!r.ok) return [];
  return r.json();
}

export async function getEmployeeRoles(employeeId) {
  const r = await fetch(`${API}/employee_roles?select=*,role:roles(role_code,role_name)&employee_id=eq.${employeeId}`, { headers: _h() });
  if (!r.ok) return [];
  return r.json();
}

export async function assignRole(employeeId, roleId) {
  const r = await fetch(`${API}/employee_roles`, {
    method: 'POST', headers: { ..._h(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee_id: employeeId, role_id: roleId, is_active: true }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t || 'Failed to assign role'); }
  return r.json();
}

export async function removeRole(roleAssignmentId) {
  const r = await fetch(`${API}/employee_roles?id=eq.${roleAssignmentId}`, {
    method: 'DELETE', headers: _h(),
  });
  if (!r.ok) throw new Error('Failed to remove role');
}

export async function getBranches() {
  const r = await fetch(`${API}/branches?select=id,branch_name&is_active=eq.true&order=branch_name.asc`, { headers: _h() });
  if (!r.ok) return [];
  return r.json();
}

export async function getEmployeeHierarchy(employeeId) {
  const r = await fetch(`${API}/employee_hierarchy?select=*,manager:manager_employee_id(full_name)&employee_id=eq.${employeeId}&is_active=eq.true`, { headers: _h() });
  if (!r.ok) return [];
  return r.json();
}

export async function getAuthUserStatus(authUserId) {
  if (!authUserId) return null;
  return _rpc('get_auth_user_status', { p_auth_user_id: authUserId });
}

// ─── MANAGER HIERARCHY ───

export async function searchEmployees(searchTerm) {
  const term = searchTerm?.trim() || '';
  const url = term
    ? `${API}/employees?select=id,full_name,employee_code&is_active=eq.true&or=(full_name.ilike.*${encodeURIComponent(term)}*,employee_code.ilike.*${encodeURIComponent(term)}*)&order=full_name.asc&limit=20`
    : `${API}/employees?select=id,full_name,employee_code&is_active=eq.true&order=full_name.asc&limit=20`;
  const r = await fetch(url, { headers: _h() });
  if (!r.ok) return [];
  return r.json();
}

export async function setManager(employeeId, managerEmployeeId) {
  const rows = await (await fetch(`${API}/employee_hierarchy?select=id&employee_id=eq.${employeeId}&is_active=eq.true`, { headers: _h() })).json();
  const existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (existing) {
    const r = await fetch(`${API}/employee_hierarchy?id=eq.${existing.id}`, {
      method: 'PATCH', headers: _h(), body: JSON.stringify({ manager_employee_id: managerEmployeeId }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(t || 'Failed to update manager'); }
  } else {
    const r = await fetch(`${API}/employee_hierarchy`, {
      method: 'POST', headers: { ..._h(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: employeeId, manager_employee_id: managerEmployeeId, is_active: true }),
    });
    if (!r.ok) { const t = await r.text(); throw new Error(t || 'Failed to set manager'); }
  }
}

export async function removeManager(employeeId) {
  const r = await fetch(`${API}/employee_hierarchy?employee_id=eq.${employeeId}&is_active=eq.true`, {
    method: 'PATCH', headers: _h(), body: JSON.stringify({ is_active: false }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t || 'Failed to remove manager'); }
}

// ─── OWNERSHIP SCOPES ───

export async function getEmployeeScopes(employeeId) {
  const r = await fetch(`${API}/employee_scopes?select=*&employee_id=eq.${employeeId}&is_active=eq.true&limit=1`, { headers: _h() });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function setEmployeeScope(employeeId, scopeType, roleId, branchId) {
  // Deactivate all existing rows, then insert new one
  await fetch(`${API}/employee_scopes?employee_id=eq.${employeeId}&is_active=eq.true`, {
    method: 'PATCH', headers: _h(), body: JSON.stringify({ is_active: false }),
  });
  const r = await fetch(`${API}/employee_scopes`, {
    method: 'POST', headers: { ..._h(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employee_id: employeeId,
      scope_type: scopeType,
      role_id: roleId || null,
      branch_id: branchId || null,
      is_active: true,
    }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t || 'Failed to set scope'); }
}
