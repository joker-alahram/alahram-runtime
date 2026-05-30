// Orders Canonical Contract
// v2 — Operational Order Visibility
// Canonical source: runtime_order_visibility (view)
//
// Four order visibility contexts:
//   1. ORDER VISIBILITY — runtime_order_visibility view (full projection)
//   2. WORKFLOW ORDER — order tracking through status lifecycle
//   3. OPERATIONAL ASSIGNMENT — who is assigned to what
//   4. ORDER ITEM — snapshot line items

import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';

// ──────────────────────────────────────────────
// 1. Full Order Visibility (runtime_order_visibility view)
// ──────────────────────────────────────────────

export const OrderContract = {
  id: 'id',
  number: 'order_number',
  customerId: 'customer_id',
  branchId: 'branch_id',
  orderSource: 'order_source',
  paymentMethodId: 'payment_method_id',
  status: 'order_status',
  subtotal: 'subtotal_amount',
  discount: 'discount_amount',
  total: 'total_amount',
  note: 'note',
  createdByEmployeeId: 'created_by_employee_id',
  createdAt: 'created_at',
  visitId: 'visit_id',
  createdByType: 'created_by_type',
  createdById: 'created_by_id',
  createdByName: 'created_by_name_snapshot',
  ownerType: 'owner_type',
  ownerId: 'owner_id',
  ownerName: 'owner_name_snapshot',
  workflowStatus: 'workflow_status',
  paymentStatus: 'payment_status',
  warehouseId: 'warehouse_id',
  reservedAt: 'reserved_at',
  approvedAt: 'approved_at',
  approvalStatus: 'approval_status',
  executionStatus: 'order_execution_status',
  executionStartedAt: 'runtime_execution_started_at',
  executionCompletedAt: 'runtime_execution_completed_at',
  executionLatitude: 'execution_latitude',
  executionLongitude: 'execution_longitude',
  executionMapsUrl: 'execution_maps_url',
  executionSource: 'execution_source',
  executionAccuracy: 'execution_accuracy_meters',
  executionCapturedAt: 'execution_captured_at',
  revision: 'revision',
  updatedAt: 'updated_at',
  updatedBy: 'updated_by',
  createdByFullName: 'created_by_name',
  createdByCode: 'created_by_code',
  managerName: 'manager_name',
  roleCode: 'role_code',
  roleName: 'role_name',
};

const CANONICAL_KEYS = Object.keys(OrderContract);
const VIEW_COLUMNS = Object.values(OrderContract);

export function orderSelectFields() {
  return VIEW_COLUMNS.join(',');
}

export function normalizeOrder(o) {
  if (!o) return null;
  const out = { ...o };
  for (const key of CANONICAL_KEYS) {
    const col = OrderContract[key];
    let val = o[col];
    if (val === undefined || val === null) {
      val = o[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeOrders(arr) {
  return (arr || []).map(normalizeOrder);
}

export function guardOrder(o) {
  if (!o) return { valid: false, reason: 'null' };
  const id = o.id;
  if (!id) return { valid: false, reason: 'missing_id' };
  return { valid: true };
}

// ──────────────────────────────────────────────
// 2. Visibility-Specific Normalizers
// ──────────────────────────────────────────────

// For list views (dashboard, reps table, customer page)
export function normalizeVisibleOrder(o) {
  if (!o) return null;
  const n = normalizeOrder(o);
  if (!n) return null;
  n._canView = !!(n.createdByFullName || n.managerName || n.roleCode);
  n._statusLabel = n.status || n.workflowStatus || '';
  n._isCancelled = n.status === 'cancelled' || n.workflowStatus === 'cancelled';
  n._isDelivered = n.status === 'delivered' || n.workflowStatus === 'delivered';
  return n;
}

export function normalizeVisibleOrders(arr) {
  return (arr || []).map(normalizeVisibleOrder);
}

// For workflow tracking
export function normalizeWorkflowOrder(o) {
  if (!o) return null;
  const n = normalizeOrder(o);
  if (!n) return null;
  n._currentStep = n.workflowStatus || n.status || 'pending';
  n._needsApproval = n.workflowStatus === 'pending_approval' || n.approvalStatus === 'pending';
  n._isExecutable = n.workflowStatus === 'approved' || n.workflowStatus === 'preparing';
  return n;
}

// For operational assignment views
export function normalizeOperationalAssignment(o) {
  if (!o) return null;
  const n = normalizeOrder(o);
  if (!n) return null;
  n._assignedTo = n.ownerName || n.createdByFullName || n.createdByName || '';
  n._assignedType = n.ownerType || n.createdByType || '';
  n._isOwned = false; // caller sets this based on identity
  return n;
}

// ──────────────────────────────────────────────
// 3. Select Builders (context-specific)
// ──────────────────────────────────────────────

// Minimal select for list views
export function orderListSelect() {
  return 'id,order_number,customer_id,total_amount,order_status,workflow_status,created_at,created_by_employee_id,created_by_name,created_by_name_snapshot,created_by_phone_snapshot,owner_name_snapshot,role_code,created_by_code,customer_name_snapshot,customer_phone_snapshot,customer_address_snapshot';
}

// For counting/statistics
export function orderStatsSelect() {
  return 'id,order_status,workflow_status,total_amount';
}

// For workflow tracking views
export function workflowSelectFields() {
  return 'id,order_number,order_status,workflow_status,approval_status,approved_at,created_at,created_by_employee_id,created_by_name,created_by_name_snapshot,owner_name_snapshot,manager_name,role_code';
}

// For order detail pages
export function orderDetailSelect() {
  return 'id,order_number,customer_id,customer_name_snapshot,customer_phone_snapshot,customer_address_snapshot,created_by_name_snapshot,created_by_phone_snapshot,total_amount,discount_amount,subtotal_amount,order_status,workflow_status,approval_status,payment_status,created_at,note,created_by_employee_id,created_by_name,created_by_code,owner_type,owner_id,owner_name_snapshot,manager_name,role_code,role_name,execution_latitude,execution_longitude,execution_maps_url,execution_source,order_execution_status,payment_method_id,branch_id,warehouse_id,order_source,visit_id';
}

// For operational assignment views
export function operationalAssignmentFields() {
  return 'id,order_number,owner_type,owner_id,owner_name_snapshot,created_by_type,created_by_id,created_by_name_snapshot,created_by_employee_id,created_at';
}

// ──────────────────────────────────────────────
// 4. Workflow Authority Resolution
// ──────────────────────────────────────────────
//
// Four authority levels:
//   WORKFLOW ROOT  — can_manage_system or isAdmin → ALL transitions
//   OPERATIONAL    — can_approve_orders           → workflow transitions
//   MANAGER        — can_manage_inventory         → operational transitions
//   NONE           — no workflow authority        → no transitions
//
// Design principle:
//   Governance-root authority MUST be resolved separately from
//   capability-based restrictions. Super admins must NOT collapse
//   into sales-manager authority level.

// Pure function: determines if capabilities grant governance-root workflow authority
export function isGovernanceWorkflowRoot(capabilities) {
  if (!capabilities) return false;
  return capabilities.can_manage_system === true
    || capabilities.can_view_all_reports === true;
}

// Pure function: filters transitions based on governance-root authority or capability map
//   transitions   — array of { origin_status, target_status, required_capability, label }
//   originStatus  — current order status to filter by
//   capMap        — Map<string, boolean> of user's capabilities (canApproveOrders → true/false)
//   isRoot        — boolean, true if user has governance-root authority
// Returns: array of { target, label } for allowed transitions
export function filterWorkflowTransitions(transitions, originStatus, capMap, isRoot) {
  if (!transitions || !Array.isArray(transitions)) return [];
  return transitions
    .filter(t => {
      if (t.origin_status !== originStatus) return false;
      if (isRoot) return true;
      return t.required_capability
        ? capMap?.get(t.required_capability) === true
        : true;
    })
    .map(t => ({ target: t.target_status, label: t.label }));
}

// ──────────────────────────────────────────────
// 5. Workflow Helpers
// ──────────────────────────────────────────────

export const STATUS_LABELS = {
  submitted: 'مقدم',
  pending: 'قيد الانتظار',
  reviewing: 'قيد المراجعة',
  approved: 'معتمد',
  preparing: 'قيد التجهيز',
  dispatched: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  returned: 'مرتجع',
};

export const STATUS_META = {
  submitted: { color: '#6b7280', icon: '📝' },
  pending: { color: '#f59e0b', icon: '⏳' },
  reviewing: { color: '#3b82f6', icon: '🔍' },
  approved: { color: '#10b981', icon: '✅' },
  preparing: { color: '#8b5cf6', icon: '📦' },
  dispatched: { color: '#06b6d4', icon: '🚚' },
  delivered: { color: '#059669', icon: '✅' },
  cancelled: { color: '#ef4444', icon: '❌' },
};

export function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function getStatusMeta(status) {
  return STATUS_META[status] || { color: '#6b7280', icon: '📋' };
}

export function isOrderActive(status) {
  const s = status || '';
  return !['cancelled', 'delivered', 'returned'].includes(s);
}

export function isOrderBlocked(status) {
  const s = status || '';
  return ['cancelled', 'returned'].includes(s);
}

// ──────────────────────────────────────────────
// 6. Order Items (separate table)
// ──────────────────────────────────────────────

export const OrderItemContract = {
  id: 'id',
  orderId: 'order_id',
  productId: 'product_id',
  productUnitId: 'product_unit_id',
  productName: 'product_name_snapshot',
  companyName: 'company_name_snapshot',
  unitName: 'unit_name_snapshot',
  unitCode: 'unit_code_snapshot',
  quantity: 'quantity',
  basePrice: 'base_price',
  discountPercent: 'discount_percent',
  finalPrice: 'final_price',
  totalAmount: 'total_amount',
  tierPrice: 'tier_price',
  lineSubtotal: 'line_subtotal',
  discountAmount: 'discount_amount',
  lineTotal: 'line_total',
  pricingSource: 'pricing_source',
  tierId: 'tier_id',
  tierName: 'tier_name_snapshot',
  isDailyDeal: 'is_daily_deal',
  isFlashOffer: 'is_flash_offer',
  offerId: 'offer_id',
};

export function orderItemSelectFields() {
  return Object.values(OrderItemContract).join(',');
}

export function normalizeOrderItem(i) {
  if (!i) return null;
  const out = { ...i };
  for (const key of Object.keys(OrderItemContract)) {
    const col = OrderItemContract[key];
    let val = i[col];
    if (val === undefined || val === null) {
      val = i[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeOrderItems(arr) {
  return (arr || []).map(normalizeOrderItem);
}

// ──────────────────────────────────────────────
// 7. Source Configuration
// ──────────────────────────────────────────────

export const ORDER_SOURCE = {
  view: 'runtime_order_visibility',
  fallbackTable: 'orders',
  fallbackSelect: 'id,order_number,customer_id,total_amount,order_status,workflow_status,created_at,created_by_employee_id,created_by_name_snapshot,note',
};
