// Customers Canonical Contract
// v2 — Customer Visibility Canonicalization
// Canonical source: runtime_customer_visibility (view)
//
// Four customer visibility contexts:
//   1. CUSTOMER VISIBILITY — runtime_customer_visibility view (full projection)
//   2. CUSTOMER OWNERSHIP — managed_by_employee_id context
//   3. REPRESENTATIVE ASSIGNMENT — customer_assignments table
//   4. OPERATIONAL CUSTOMER — combined view for daily ops

import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';

// ──────────────────────────────────────────────
// 1. Full Customer Visibility (runtime_customer_visibility view)
// ──────────────────────────────────────────────

export const CustomerContract = {
  id: 'id',
  code: 'customer_code',
  name: 'customer_name',
  phone: 'phone',
  address: 'address',
  latitude: 'latitude',
  longitude: 'longitude',
  branchId: 'branch_id',
  createdByEmployeeId: 'created_by_employee_id',
  managedByEmployeeId: 'managed_by_employee_id',
  customerType: 'customer_type',
  isActive: 'is_active',
  createdAt: 'created_at',
  mapsUrl: 'google_maps_url',
  password: 'password',
  ownerName: 'owner_name',
  ownerCode: 'owner_code',
  managerName: 'manager_name',
  roleCode: 'role_code',
  roleName: 'role_name',
};

const CANONICAL_KEYS = Object.keys(CustomerContract);
const VIEW_COLUMNS = Object.values(CustomerContract);

export function customerSelectFields() {
  return VIEW_COLUMNS.join(',');
}

export function normalizeCustomer(c) {
  if (!c) return null;
  const out = { ...c };
  for (const key of CANONICAL_KEYS) {
    const col = CustomerContract[key];
    let val = c[col];
    if (val === undefined || val === null) {
      val = c[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeCustomers(arr) {
  return (arr || []).map(normalizeCustomer);
}

export function guardCustomer(c) {
  if (!c) return { valid: false, reason: 'null' };
  const id = c.id;
  if (!id) return { valid: false, reason: 'missing_id' };
  return { valid: true };
}

// ──────────────────────────────────────────────
// 2. Visibility-Specific Normalizers
// ──────────────────────────────────────────────

export function normalizeVisibleCustomer(c) {
  if (!c) return null;
  const n = normalizeCustomer(c);
  if (!n) return null;
  n._isActive = n.isActive !== false;
  n._hasOwner = !!(n.ownerName || n.managedByEmployeeId);
  n._assignedRep = n.ownerName || '';
  n._hasManager = !!n.managerName;
  return n;
}

export function normalizeVisibleCustomers(arr) {
  return (arr || []).map(normalizeVisibleCustomer);
}

export function normalizeCustomerOwnership(c) {
  if (!c) return null;
  const n = normalizeCustomer(c);
  if (!n) return null;
  n._owner = n.ownerName || '';
  n._ownerCode = n.ownerCode || '';
  n._managedBy = n.managedByEmployeeId || '';
  n._isMine = false;
  return n;
}

export function normalizeOperationalCustomer(c) {
  if (!c) return null;
  const n = normalizeCustomer(c);
  if (!n) return null;
  n._segment = '';
  n._totalSpent = 0;
  n._invoiceCount = 0;
  n._lastOrderDate = null;
  n._visitCount = 0;
  n._lastVisitDate = null;
  return n;
}

// ──────────────────────────────────────────────
// 3. Select Builders (context-specific)
// ──────────────────────────────────────────────

// List view select (minimal columns)
export function customerListSelect() {
  return 'id,customer_code,customer_name,phone,address,customer_type,is_active,created_at,owner_name,owner_code,managed_by_employee_id';
}

// Detail view select (all columns)
export function customerDetailSelect() {
  return customerSelectFields();
}

// Ownership-focused select
export function customerOwnershipFields() {
  return 'id,customer_name,customer_code,phone,address,is_active,created_at,managed_by_employee_id,created_by_employee_id,owner_name,owner_code,manager_name,role_code';
}

// Representative assignment select (customer_assignments table)
export function representativeAssignmentFields() {
  return 'employee_id,customer_id,assignment_role,is_primary,is_active,assigned_at';
}

// ──────────────────────────────────────────────
// 4. Ownership Helpers
// ──────────────────────────────────────────────

export function isCustomerOwnedBy(customer, employeeId) {
  if (!customer || !employeeId) return false;
  return customer.managed_by_employee_id === employeeId
    || customer.created_by_employee_id === employeeId
    || customer.managedByEmployeeId === employeeId
    || customer.createdByEmployeeId === employeeId;
}

export function getCustomerOwner(customer) {
  if (!customer) return null;
  return {
    name: customer.ownerName || customer.owner_name || '',
    code: customer.ownerCode || customer.owner_code || '',
    employeeId: customer.managedByEmployeeId || customer.managed_by_employee_id || '',
    roleCode: customer.roleCode || customer.role_code || '',
  };
}

export function getCustomerManager(customer) {
  if (!customer) return null;
  return {
    name: customer.managerName || customer.manager_name || '',
  };
}

export const SEGMENT_THRESHOLDS = [
  { label: 'VIP', min: 50000, cls: 'v2-occ-seg-vip' },
  { label: 'ذهبي', min: 20000, cls: 'v2-occ-seg-gold' },
  { label: 'فضي', min: 5000, cls: 'v2-occ-seg-silver' },
  { label: 'عادي', min: 1, cls: 'v2-occ-seg-regular' },
  { label: 'جديد', min: 0, cls: 'v2-occ-seg-new' },
];

export function computeSegment(totalSales) {
  for (const seg of SEGMENT_THRESHOLDS) {
    if (totalSales >= seg.min) return seg;
  }
  return SEGMENT_THRESHOLDS[SEGMENT_THRESHOLDS.length - 1];
}

// ──────────────────────────────────────────────
// 5. Source Configuration
// ──────────────────────────────────────────────

export const CUSTOMER_SOURCE = {
  view: 'runtime_customer_visibility',
  fallbackTable: 'customers',
  fallbackSelect: 'id,customer_code,customer_name,phone,address,latitude,longitude,branch_id,created_by_employee_id,managed_by_employee_id,customer_type,is_active,created_at,google_maps_url,password',
};

// customer_assignments is a separate table — not in the view
export const CustomerAssignmentContract = {
  employeeId: 'employee_id',
  customerId: 'customer_id',
  role: 'assignment_role',
  isPrimary: 'is_primary',
  isActive: 'is_active',
  assignedAt: 'assigned_at',
};

export function assignmentSelectFields() {
  return Object.values(CustomerAssignmentContract).join(',');
}
