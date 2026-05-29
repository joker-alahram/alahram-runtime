import { getSession, getRuntimeToken } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { getIdentity, getHierarchyIds } from '../storefront/governanceRuntime.js';

const API = readConfig().baseUrl;

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'chairman', 'executive_manager', 'executive_supervisor']);
const SUPERVISOR_ROLES = new Set(['sales_supervisor', 'sales_lead']);
const DIRECTOR_ROLES = new Set(['sales_director', 'sales_manager', 'sales_lead']);
const REP_ROLES = new Set(['sales_rep']);
const WAREHOUSE_ROLES = new Set(['warehouse_manager', 'inventory_manager']);

const _transitionCache = new Map();

function _headers() {
  return { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
}

function _norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

function _uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function _toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function _roleCandidates(user) {
  return _uniq([
    user?.role_code,
    user?.roleCode,
    user?.role?.roleCode,
    user?.role?.role_code,
    getIdentity()?.roleCode,
    getIdentity()?.role?.roleCode,
    getSession()?.role?.roleCode,
  ].map(_norm));
}

function _capabilities(user) {
  return user?.capabilities || user?.permissions || getIdentity()?.capabilities || {};
}

function _employeeId(user) {
  return user?.employeeId || user?.employee_id || getIdentity()?.employeeId || getSession()?.actor?.id || null;
}

function _currentUser(user = {}) {
  const identity = getIdentity() || {};
  const roleCandidates = _roleCandidates(user);
  const roleCode = roleCandidates[0] || '';
  const employeeId = _employeeId(user);
  const capabilities = _capabilities(user);
  const hierarchyIds = _uniq(
    _toArray(user?.hierarchyIds).length ? user.hierarchyIds : (getHierarchyIds?.() || [])
  );

  const isAdmin = Boolean(
    user?.isAdmin
    || identity?.isAdmin
    || ADMIN_ROLES.has(roleCode)
    || capabilities.can_manage_system === true
    || capabilities.can_view_all_reports === true
  );

  return {
    ...user,
    employeeId,
    roleCode,
    roleCandidates,
    capabilities,
    hierarchyIds,
    isAdmin,
  };
}

async function _fetchJson(path, fallback = []) {
  try {
    const r = await fetch(`${API}/${path}`, { headers: _headers() });
    if (!r.ok) return fallback;
    return await r.json();
  } catch {
    return fallback;
  }
}

async function _ensureEmployeeContext(user = {}) {
  const cur = _currentUser(user);
  if (cur.capabilities && Object.keys(cur.capabilities).length) return cur;
  if (!cur.employeeId) return cur;

  const runtimeToken = getRuntimeToken();
  if (!runtimeToken) return cur;

  try {
    const r = await fetch(`${API}/rpc/runtime_employee_record`, {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify({ p_runtime_token: runtimeToken }),
    });
    if (!r.ok) return cur;
    const data = await r.json();
    const rec = Array.isArray(data) ? data[0] : data;
    if (!rec) return cur;
    return {
      ...cur,
      roleCode: _norm(rec.role_code || cur.roleCode),
      roleCandidates: _uniq([_norm(rec.role_code), ...cur.roleCandidates]),
      capabilities: rec.capabilities || cur.capabilities || {},
      isAdmin: Boolean(cur.isAdmin || ADMIN_ROLES.has(_norm(rec.role_code)) || rec?.capabilities?.can_manage_system || rec?.capabilities?.can_view_all_reports),
    };
  } catch {
    return cur;
  }
}

async function _loadTransitions(domain, originStatus) {
  const key = `${_norm(domain)}|${_norm(originStatus)}`;
  if (_transitionCache.has(key)) return _transitionCache.get(key);
  const rows = await _fetchJson(
    `workflow_transitions?domain=eq.${encodeURIComponent(domain)}&origin_status=eq.${encodeURIComponent(originStatus)}&is_active=eq.true&select=*&order=sort_order.asc`,
    [],
  );
  const transitions = Array.isArray(rows) ? rows : [];
  _transitionCache.set(key, transitions);
  return transitions;
}

async function _loadTransitionRoles(transitionIds) {
  const ids = _uniq(transitionIds);
  if (!ids.length) return [];
  const rows = await _fetchJson(
    `workflow_transition_roles?transition_id=in.(${ids.join(',')})&select=*`,
    [],
  );
  return Array.isArray(rows) ? rows : [];
}

function _allowedRolesForTransition(transition, roleRows) {
  const rows = _toArray(roleRows).filter(Boolean);
  const fromJoin = rows
    .filter(r => String(r.transition_id ?? r.workflow_transition_id ?? r.workflow_transition?.id ?? '') === String(transition.id))
    .map(r => _norm(r.role_code || r.role || r.required_role || r.role_name));
  return _uniq(fromJoin);
}

function _inHierarchy(order, user) {
  const creator = order?.created_by_employee_id || order?.created_by_id || order?.owner_id || null;
  if (!creator) return false;
  const ids = _uniq([...(user?.hierarchyIds || []), user?.employeeId].map(v => String(v)));
  return ids.includes(String(creator));
}

function _isOwned(order, user) {
  const creator = order?.created_by_employee_id || order?.created_by_id || order?.owner_id || null;
  const eid = user?.employeeId;
  return Boolean(creator && eid && String(creator) === String(eid));
}

function _orderScopeAllows(transition, user) {
  const order = user?.order || user?.entity || null;
  if (!order) return { allowed: true, reason: null };
  const origin = _norm(transition.origin_status || transition.originStatus || user?.originStatus || order.order_status || order.workflow_status || '');
  const target = _norm(transition.target_status || transition.targetStatus || user?.targetStatus || '');
  const role = _norm(user?.roleCode);
  const isOwned = _isOwned(order, user);
  const inHierarchy = _inHierarchy(order, user);

  if (user?.isAdmin) return { allowed: true, reason: null };

  if (REP_ROLES.has(role)) {
    const repAllowed = isOwned && origin === 'pending' && ['delete', 'cancelled', 'restore', 'edit', 'update', 'pending'].includes(target);
    return repAllowed ? { allowed: true, reason: null } : { allowed: false, reason: 'rep_scope_denied' };
  }

  if (SUPERVISOR_ROLES.has(role)) {
    const reviewAllowed = inHierarchy && ['submitted', 'pending'].includes(origin) && target === 'reviewing';
    const restoreAllowed = inHierarchy && origin === 'reviewing' && target === 'pending';
    const deleteAllowed = inHierarchy && origin === 'reviewing' && ['delete', 'cancelled'].includes(target);
    return (reviewAllowed || restoreAllowed || deleteAllowed)
      ? { allowed: true, reason: null }
      : { allowed: false, reason: 'supervisor_scope_denied' };
  }

  if (DIRECTOR_ROLES.has(role)) {
    const approveAllowed = inHierarchy && target === 'approved';
    const deleteAllowed = inHierarchy && ['approved', 'reviewing', 'pending'].includes(origin) && ['delete', 'cancelled'].includes(target);
    const restoreAllowed = inHierarchy && target === 'restore';
    return (approveAllowed || deleteAllowed || restoreAllowed)
      ? { allowed: true, reason: null }
      : { allowed: false, reason: 'director_scope_denied' };
  }

  if (WAREHOUSE_ROLES.has(role)) {
    const queueAllowed = (origin === 'approved' && target === 'preparing') || (origin === 'preparing' && target === 'dispatched');
    return queueAllowed ? { allowed: true, reason: null } : { allowed: false, reason: 'warehouse_scope_denied' };
  }

  return { allowed: true, reason: null };
}

export function hasWorkflowAuthority({ transition, user, domain, originStatus, targetStatus }) {
  const ctx = _currentUser(user);
  const role = _norm(ctx.roleCode);
  if (ctx.isAdmin) return { allowed: true, reason: null };

  const requiredCapability = _norm(transition?.required_capability || transition?.requiredCapability);
  if (requiredCapability && ctx.capabilities?.[requiredCapability] !== true) {
    return { allowed: false, reason: 'capability_required' };
  }

  if (_norm(domain) === 'order' && (targetStatus === 'delete' || targetStatus === 'restore')) {
    return _orderScopeAllows({ origin_status: originStatus, target_status: targetStatus }, ctx);
  }

  if (_norm(domain) === 'order') {
    return _orderScopeAllows(transition || { origin_status: originStatus, target_status: targetStatus }, ctx);
  }

  return { allowed: true, reason: null };
}

export async function canExecuteTransition({ domain, originStatus, targetStatus, user }) {
  const ctx = await _ensureEmployeeContext(user);
  const transitions = await _loadTransitions(domain, originStatus);
  const normalizedTarget = _norm(targetStatus);
  const normalizedOrigin = _norm(originStatus);
  const matched = transitions.find(t => _norm(t.target_status) === normalizedTarget);
  const pseudo = matched || { id: null, domain, origin_status: normalizedOrigin, target_status: normalizedTarget, required_capability: null, required_role: null, label: normalizedTarget };

  if (!matched && !['delete', 'restore'].includes(normalizedTarget)) {
    return { allowed: false, reason: 'transition_not_found', transition: null };
  }

  const transitionRoles = await _loadTransitionRoles(transitions.map(t => t.id));
  const authority = hasWorkflowAuthority({
    transition: pseudo,
    user: ctx,
    domain,
    originStatus: normalizedOrigin,
    targetStatus: normalizedTarget,
  });

  if (!authority.allowed) {
    return { allowed: false, reason: authority.reason, transition: pseudo };
  }

  if (!ctx.isAdmin) {
    const allowedRoles = matched ? _allowedRolesForTransition(matched, transitionRoles) : [];
    if (allowedRoles.length) {
      const roleOk = allowedRoles.includes(ctx.roleCode) || allowedRoles.includes('*');
      if (!roleOk) {
        return { allowed: false, reason: 'role_required', transition: pseudo };
      }
    }

    const requiredCapability = _norm(matched?.required_capability);
    if (requiredCapability && ctx.capabilities?.[requiredCapability] !== true) {
      return { allowed: false, reason: 'capability_required', transition: pseudo };
    }
  }

  return { allowed: true, reason: null, transition: pseudo };
}

export async function getAllowedTransitions({ domain, currentStatus, user }) {
  const ctx = await _ensureEmployeeContext(user);
  const transitions = await _loadTransitions(domain, currentStatus);
  if (!transitions.length) return [];
  const transitionRoles = await _loadTransitionRoles(transitions.map(t => t.id));

  const allowed = [];
  for (const t of transitions) {
    const authority = hasWorkflowAuthority({
      transition: t,
      user: ctx,
      domain,
      originStatus: currentStatus,
      targetStatus: t.target_status,
    });
    if (!authority.allowed) continue;

    if (!ctx.isAdmin) {
      const allowedRoles = _allowedRolesForTransition(t, transitionRoles);
      if (allowedRoles.length && !allowedRoles.includes(ctx.roleCode) && !allowedRoles.includes('*')) continue;

      const requiredCapability = _norm(t.required_capability);
      if (requiredCapability && ctx.capabilities?.[requiredCapability] !== true) continue;
    }

    allowed.push({
      id: t.id,
      domain: t.domain,
      origin_status: t.origin_status,
      target_status: t.target_status,
      label: t.label || t.target_status,
      required_capability: t.required_capability || null,
      required_role: t.required_role || null,
      requires_approval: t.requires_approval || false,
      sort_order: t.sort_order ?? 0,
      is_active: t.is_active !== false,
      transition: t,
    });
  }

  return allowed;
}

export async function canOpenVisitForCustomer(customerId, user) {
  const ctx = await _ensureEmployeeContext(user);
  if (ctx.isAdmin) return { allowed: true, reason: null };

  const role = ctx.roleCode;
  const hierarchyIds = _uniq([...(ctx.hierarchyIds || []), ctx.employeeId].map(v => String(v)));
  const assignments = await _fetchJson(
    `customer_assignments?customer_id=eq.${encodeURIComponent(customerId)}&select=employee_id`,
    [],
  );
  const assignedEmployeeIds = _uniq((Array.isArray(assignments) ? assignments : []).map(r => String(r.employee_id)));
  const isOwn = assignedEmployeeIds.includes(String(ctx.employeeId));
  const isTeam = assignedEmployeeIds.some(id => hierarchyIds.includes(id));

  const visibleRows = await _fetchJson(
    `runtime_customer_visibility?id=eq.${encodeURIComponent(customerId)}&select=id,created_by_employee_id,managed_by_employee_id,owner_name,manager_name,role_code,role_name,is_active`,
    [],
  );
  if (!Array.isArray(visibleRows) || !visibleRows.length) {
    return { allowed: false, reason: 'customer_not_visible' };
  }

  if (REP_ROLES.has(role)) {
    return isOwn ? { allowed: true, reason: null } : { allowed: false, reason: 'rep_scope_denied' };
  }
  if (SUPERVISOR_ROLES.has(role)) {
    return isTeam ? { allowed: true, reason: null } : { allowed: false, reason: 'supervisor_scope_denied' };
  }
  if (DIRECTOR_ROLES.has(role)) {
    return isTeam || isOwn ? { allowed: true, reason: null } : { allowed: false, reason: 'director_scope_denied' };
  }
  return { allowed: false, reason: 'visit_scope_denied' };
}

export async function canManageVisitByCustomer(customerId, user) {
  return canOpenVisitForCustomer(customerId, user);
}
