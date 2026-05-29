// Inventory Movement Canonical Contract
// Source of truth: inventory_movements table schema
//
// Layer architecture:
//   DB (schema) → Contract (this file) → Service (inventoryApi.js) → UI (pages)
//   UI NEVER constructs DB payloads directly — always through Service.

// ──────────────────────────────────────────────
// 1. Canonical Field Mapping
// ──────────────────────────────────────────────
// Maps canonical DB column names to contract keys.
// Preserves exact DB column names — no aliasing at the contract level.
// Aliasing happens ONLY in the service layer when needed.

export const InventoryMovementContract = {
  // PK
  id: 'id',
  // FK references
  warehouseId: 'warehouse_id',
  productId: 'product_id',
  productUnitId: 'product_unit_id',
  // Movement data
  movementType: 'movement_type',
  quantity: 'quantity',
  direction: 'direction',
  quantityBaseUnit: 'quantity_base_unit',
  balanceAfter: 'balance_after',
  note: 'note',
  referenceId: 'reference_id',
  reservationReference: 'reservation_reference',
  // Actor tracking
  actorType: 'actor_type',
  actorId: 'actor_id',
  createdByEmployeeId: 'created_by_employee_id',
  // Timestamps
  createdAt: 'created_at',
};

export const MOVEMENT_COLUMNS = Object.values(InventoryMovementContract);

// ──────────────────────────────────────────────
// 2. Enums
// ──────────────────────────────────────────────

export const MOVEMENT_TYPES = {
  opening: 'افتتاحي',
  reservation: 'حجز',
  sale: 'مبيعات',
  release: 'إلغاء حجز',
  adjustment: 'تسوية',
  transfer_in: 'وارد تحويل',
  transfer_out: 'صادر تحويل',
};

export const DIRECTIONS = {
  in: 'داخل',
  out: 'خارج',
};

export const ACTOR_TYPES = {
  system: 'system',
  employee: 'employee',
  customer: 'customer',
};

// ──────────────────────────────────────────────
// 3. Payload Builders
// ──────────────────────────────────────────────
// These are the ONLY way to construct movement payloads.
// UI code calls these functions — never constructs raw DB objects.

export function buildAdjustmentPayload({ productId, delta, balanceAfter, reason, employeeId }) {
  if (!productId) throw new Error('product_id مطلوب لتسوية المخزون');
  if (delta === 0) return null;
  const payload = {
    product_id: productId,
    quantity: Math.abs(delta),
    direction: delta > 0 ? 'in' : 'out',
    movement_type: 'adjustment',
    balance_after: balanceAfter,
    note: reason || null,
    actor_type: ACTOR_TYPES.employee,
    actor_id: employeeId || null,
    created_by_employee_id: employeeId || null,
  };
  return payload;
}

// ──────────────────────────────────────────────
// 4. Validation
// ──────────────────────────────────────────────

export function validateMovementPayload(payload) {
  const missing = [];
  if (!payload.product_id) missing.push('product_id');
  if (!payload.quantity) missing.push('quantity');
  if (!payload.direction) missing.push('direction');
  if (!payload.movement_type) missing.push('movement_type');
  if (missing.length) {
    throw new Error(`حقل مطلوب ناقص: ${missing.join(', ')}`);
  }
  if (!['in', 'out'].includes(payload.direction)) {
    throw new Error('direction يجب أن يكون in أو out');
  }
  return true;
}
