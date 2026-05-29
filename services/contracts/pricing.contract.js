// Pricing Canonical Contract
// v2 — Runtime Pricing Contracts
//
// Three pricing contexts exist in the system:
//   1. RUNTIME PRICE  → runtime_product_prices (view, display-only, product-centric)
//   2. ORDER PRICE    → order_items table (snapshot at order creation)
//   3. CART PRICE     → resolve_product_price RPC (live, customer-specific tier)
//
// Canonical price calculation happens in the DB via resolve_product_price RPC.
// The frontend must DISPLAY canonical prices, not DERIVE pricing truth.

// ──────────────────────────────────────────────
// 1. Runtime Product Price (runtime_product_prices view)
// ──────────────────────────────────────────────

export const RuntimePriceContract = {
  productId: 'product_id',
  productUnitId: 'product_unit_id',
  productName: 'product_name',
  unitName: 'unit_name',
  basePrice: 'base_price',
  tierName: 'tier_name',
  tierCode: 'tier_code',
  discountPercent: 'discount_percent',
  finalPrice: 'final_price',
  isActive: 'is_active',
};

const RUNTIME_KEYS = Object.keys(RuntimePriceContract);
const RUNTIME_COLS = Object.values(RuntimePriceContract);

export function runtimePriceSelectFields() {
  return RUNTIME_COLS.join(',');
}

export function normalizeRuntimePrice(p) {
  if (!p) return null;
  const out = { ...p };
  for (const key of RUNTIME_KEYS) {
    const col = RuntimePriceContract[key];
    let val = p[col];
    if (val === undefined || val === null) {
      val = p[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeRuntimePrices(arr) {
  return (arr || []).map(normalizeRuntimePrice);
}

export function guardRuntimePrice(p) {
  if (!p) return { valid: false, reason: 'null' };
  const pid = p.product_id || p.productId;
  if (!pid) return { valid: false, reason: 'missing_product_id' };
  return { valid: true };
}

// ──────────────────────────────────────────────
// 2. Order Item Price (order_items table)
// ──────────────────────────────────────────────

export const OrderPriceContract = {
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
  offerName: 'offer_name_snapshot',
};

const ORDER_KEYS = Object.keys(OrderPriceContract);
const ORDER_COLS = Object.values(OrderPriceContract);

export function orderItemSelectFields() {
  return ORDER_COLS.join(',');
}

export function normalizeOrderPrice(item) {
  if (!item) return null;
  const out = { ...item };
  for (const key of ORDER_KEYS) {
    const col = OrderPriceContract[key];
    let val = item[col];
    if (val === undefined || val === null) {
      val = item[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeOrderPrices(arr) {
  return (arr || []).map(normalizeOrderPrice);
}

export function computeLineTotal(item) {
  const qty = Number(item.quantity || item.qty || 0);
  const fp = Number(item.finalPrice || item.final_price || 0);
  return qty * fp;
}

export function computeOrderSubtotal(items) {
  return items.reduce((s, i) => s + computeLineTotal(i), 0);
}

// ──────────────────────────────────────────────
// 3. Cart Price (resolve_product_price RPC result)
// ──────────────────────────────────────────────

export const CartPriceContract = {
  found: 'found',
  basePrice: 'base_price',
  finalPrice: 'final_price',
  discountPercent: 'discount_percent',
  pricingSource: 'pricing_source',
  tierName: 'tier_name',
  tierCode: 'tier_code',
};

export function normalizeCartPrice(price) {
  if (!price || !price.found) return null;
  const out = { ...price };
  out.basePrice = price.base_price ?? price.basePrice ?? 0;
  out.finalPrice = price.final_price ?? price.finalPrice ?? 0;
  out.discountPercent = price.discount_percent ?? price.discountPercent ?? 0;
  out.pricingSource = price.pricing_source ?? price.pricingSource ?? null;
  out.tierName = price.tier_name ?? price.tierName ?? null;
  out.tierCode = price.tier_code ?? price.tierCode ?? null;
  out.hasDiscount = out.basePrice !== out.finalPrice;
  return out;
}

export function computeCartTotals(items) {
  let subtotal = 0;
  let discountTotal = 0;
  let grand = 0;
  for (const item of items) {
    const p = item.price || {};
    const bp = Number(p.basePrice || p.base_price || 0);
    const fp = Number(p.finalPrice || p.final_price || 0);
    const qty = Number(item.qty || item.quantity || 1);
    subtotal += bp * qty;
    discountTotal += (bp - fp) * qty;
    grand += fp * qty;
  }
  return { subtotal, discountTotal, grand };
}

// ──────────────────────────────────────────────
// 4. Pricing Tiers (pricing_tiers table)
// ──────────────────────────────────────────────

export const TierContract = {
  id: 'id',
  code: 'tier_code',
  name: 'tier_name',
  priority: 'priority',
  minOrderAmount: 'minimum_order_amount',
  minMonthlyTarget: 'minimum_monthly_target',
  isActive: 'is_active',
  color: 'tier_color',
  notes: 'notes',
};

export function tierSelectFields() {
  return Object.values(TierContract).join(',');
}

export function normalizeTier(t) {
  if (!t) return null;
  const out = { ...t };
  for (const key of Object.keys(TierContract)) {
    const col = TierContract[key];
    let val = t[col];
    if (val === undefined || val === null) {
      val = t[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeTiers(arr) {
  return (arr || []).map(normalizeTier);
}

// ──────────────────────────────────────────────
// 5. Source Configuration
// ──────────────────────────────────────────────

export const PRICING_SOURCE = {
  view: 'runtime_product_prices',
  fallbackTable: 'product_prices',
  fallbackSelect: 'id,product_id,product_unit_id,tier_id,base_price,is_active,starts_at,ends_at,availability_status,sales_blocked,participates_in_tier,minimum_quantity,maximum_quantity',
};

export const ORDER_ITEM_SOURCE = {
  table: 'order_items',
  select: orderItemSelectFields(),
};
