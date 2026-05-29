// Employees Canonical Contract — v3 Operational Identity Projection
// Canonical source: runtime_employee_capabilities (view)
//
// After DB enhancement, the view will include ALL identity fields directly.
// Until then, the projection service supplements missing fields from employees table.
//
// Three contexts:
//   1. EMPLOYEE PROJECTION — full operational identity (governance + identity fields)
//   2. EMPLOYEE LIST — minimal for lists
//   3. CAPABILITY — governance-specific (shared with capabilities.contract.js)

// ──────────────────────────────────────────────
// 1. Full Operational Identity Projection
// ──────────────────────────────────────────────

export const EmployeeContract = {
  // Governance fields (from view)
  id: 'employee_id',
  fullName: 'full_name',
  code: 'employee_code',
  roleCode: 'role_code',
  roleName: 'role_name',
  canManageSystem: 'can_manage_system',
  canCreateOrders: 'can_create_orders',
  canOpenVisit: 'can_open_visit',
  canApproveOrders: 'can_approve_orders',
  canManageInventory: 'can_manage_inventory',
  canManageTreasury: 'can_manage_treasury',
  canViewAllReports: 'can_view_all_reports',
  // Operational identity fields (missing from view — to be added via DB enhancement)
  phone: 'phone',
  regionName: 'region_name',
  isActive: 'is_active',
  createdAt: 'created_at',
  authUserId: 'auth_user_id',
};

const CANONICAL_KEYS = Object.keys(EmployeeContract);
const VIEW_COLUMNS = Object.values(EmployeeContract);

export function employeeSelectFields() {
  return VIEW_COLUMNS.join(',');
}

export function normalizeEmployee(e) {
  if (!e) return null;
  const out = { ...e };
  for (const key of CANONICAL_KEYS) {
    const col = EmployeeContract[key];
    let val = e[col];
    if (val === undefined || val === null) {
      val = e[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeEmployees(arr) {
  return (arr || []).map(normalizeEmployee);
}

export function guardEmployee(e) {
  if (!e) return { valid: false, reason: 'null' };
  const id = e.employee_id || e.id;
  if (!id) return { valid: false, reason: 'missing_id' };
  return { valid: true };
}

// ──────────────────────────────────────────────
// 2. Context-Specific Normalizers
// ──────────────────────────────────────────────

export function normalizeOperationalIdentity(e) {
  if (!e) return null;
  const n = normalizeEmployee(e);
  if (!n) return null;
  n._isActive = n.isActive !== false;
  n._hasPhone = !!n.phone;
  n._region = n.regionName || n.region_name || '';
  n._tenureMonths = n.createdAt ? Math.floor((Date.now() - new Date(n.createdAt).getTime()) / (30 * 86400000)) : 0;
  return n;
}

export function normalizeEmployeeProjection(e) {
  if (!e) return null;
  const n = normalizeOperationalIdentity(e);
  if (!n) return null;
  n._capCount = 0;
  for (const key of Object.keys(n)) {
    if (key.startsWith('can_') && n[key] === true) n._capCount++;
  }
  return n;
}

export function normalizeEmployeeProjections(arr) {
  return (arr || []).map(normalizeEmployeeProjection);
}

// ──────────────────────────────────────────────
// 3. Select Builders
// ──────────────────────────────────────────────

// Full projection — all governance + identity fields
export function employeeProjectionFields() {
  return VIEW_COLUMNS.join(',');
}

// Governance-only fields (what the view currently supports)
export function governanceFields() {
  return 'employee_id,employee_code,full_name,role_code,role_name,can_manage_system,can_create_orders,can_open_visit,can_approve_orders,can_manage_inventory,can_manage_treasury,can_view_all_reports';
}

// Operational identity fields (missing from view, need fallback)
export function operationalIdentityFields() {
  return 'phone,region_name,is_active,created_at,auth_user_id';
}

// Minimal list select (governance + basic identity)
export function employeeListSelect() {
  return 'employee_id,employee_code,full_name,role_code,role_name,is_active,region_name';
}

// Search select (name + phone + region)
export function employeeSearchFields() {
  return 'employee_id,full_name,phone,region_name,is_active';
}

// ──────────────────────────────────────────────
// 4. Source Configuration
// ──────────────────────────────────────────────

export const EMPLOYEE_SOURCE = {
  view: 'runtime_employee_capabilities',
  fallbackTable: 'employees',
  fallbackSelect: 'id,employee_code,full_name,phone,region_name,is_active,created_at',
  // After DB enhancement, projectionFields = governanceFields + operationalIdentityFields
  // Until then, projection requires dual query via the projection service
  projectionFields: 'employee_id,employee_code,full_name,role_code,role_name,can_manage_system,can_create_orders,can_open_visit,can_approve_orders,can_manage_inventory,can_manage_treasury,can_view_all_reports,phone,region_name,is_active,created_at,auth_user_id',
};
