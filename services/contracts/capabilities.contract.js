// Capabilities & Governance Canonical Contract
// v2 — Governance-focused (employee identity projection moved to employees.contract.js)
//
// This contract provides:
//   - capability-only field maps (for governance checks)
//   - guard functions
//   - governance query helpers
//   - source configuration
//
// Full employee identity projection (including governance + identity fields)
// is now in employees.contract.js

import { governanceFields } from './employees.contract.js';

// ──────────────────────────────────────────────
// 1. Capability-Only Contract (lightweight)
// ──────────────────────────────────────────────

export const CapabilityContract = {
  employeeId: 'employee_id',
  fullName: 'full_name',
  employeeCode: 'employee_code',
  roleCode: 'role_code',
  roleName: 'role_name',
  canManageSystem: 'can_manage_system',
  canCreateOrders: 'can_create_orders',
  canOpenVisit: 'can_open_visit',
  canApproveOrders: 'can_approve_orders',
  canManageInventory: 'can_manage_inventory',
  canManageTreasury: 'can_manage_treasury',
  canViewAllReports: 'can_view_all_reports',
};

const CAP_KEYS = Object.keys(CapabilityContract);
const CAP_COLS = Object.values(CapabilityContract);

export function capabilitySelectFields() {
  return CAP_COLS.join(',');
}

export function normalizeCapability(e) {
  if (!e) return null;
  const out = { ...e };
  for (const key of CAP_KEYS) {
    const col = CapabilityContract[key];
    let val = e[col];
    if (val === undefined || val === null) {
      val = e[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeCapabilities(arr) {
  return (arr || []).map(normalizeCapability);
}

export function guardCapabilityRecord(e) {
  if (!e) return { valid: false, reason: 'null' };
  const id = e.employee_id || e.employeeId;
  if (!id) return { valid: false, reason: 'missing_employee_id' };
  return { valid: true };
}

// ──────────────────────────────────────────────
// 2. Quick capability checks from canonical record
// ──────────────────────────────────────────────

export function hasCap(record, cap) {
  return record?.[cap] === true;
}

export function isAdminFromRecord(record) {
  return hasCap(record, 'can_manage_system') || hasCap(record, 'can_view_all_reports');
}

// ──────────────────────────────────────────────
// 3. Source Configuration
// ──────────────────────────────────────────────

export const CAPABILITY_SOURCE = {
  view: 'runtime_employee_capabilities',
  fallbackTable: 'employees',
  selectFields: governanceFields(),
};

// Minimal select for capability-only queries (used by guards, scope builders)
export function capabilityListSelect() {
  return 'employee_id,role_code,role_name,can_manage_system,can_create_orders,can_open_visit,can_approve_orders,can_manage_inventory,can_manage_treasury,can_view_all_reports';
}
