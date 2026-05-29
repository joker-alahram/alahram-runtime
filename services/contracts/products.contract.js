// Product Management Canonical Contract
// v3 — Brand-first domain classification
//
// Entity classification:
//   Runtime Organization: app_company table  (شركة الأهرام — النظام نفسه)
//   Brand (العلامة التجارية): companies table  (ستاركي، كازانوفا، باليت)
//   Supplier (المورد): suppliers table
//   Manufacturer (الشركة المنتجة): داخل companies حالياً (لوريال، جونسون)
//
// Source-of-truth layers:
//   DB tables:     products, product_units, product_prices
//   Brand table:   companies  (اسم الجدول تاريخي — المحتوى brands)
//   Runtime view:  runtime_product_management (joins + JSON aggregates)
//   Contract:      this file (maps all layers to canonical keys)
//
// Principles:
//   1. Every field must exist in at least one source layer
//   2. UI never accesses DB columns directly — always through contract keys
//   3. No field aliasing at UI layer — mapping is centralized here
//   4. brandId (UUID FK) is canonical; company_name_snapshot is legacy text
//
// Governance: can_manage_inventory capability

// ═══════════════════════════════════════════════════════
// 1. CANONICAL DB SCHEMA (source of truth)
// ═══════════════════════════════════════════════════════
//
// products table columns:
//   id, product_code, product_name, company_id (→ brands.companies.id),
//   category, product_image_url, barcode, is_active, created_at,
//   company_name_snapshot (LEGACY — prefer brand FK),
//   base_unit_id, track_inventory, sales_blocked
//
// product_units table columns:
//   id, product_id, unit_code, unit_name, units_per_parent,
//   is_base_unit, is_sellable, is_active, created_at,
//   base_unit_quantity, display_order
//
// product_prices table columns:
//   id, product_id, product_unit_id, base_price, is_active,
//   updated_by_employee_id, updated_at, starts_at, ends_at,
//   priority, sales_blocked, availability_status, availability_note,
//   pricing_source_type, tier_id, minimum_quantity, maximum_quantity,
//   participates_in_tier, execution_priority, pricing_metadata
//
// runtime_product_management view columns (view-only):
//   product_id, company_name (brand name, via companies join),
//   company_logo_url (brand logo, via companies join),
//   units (JSON), active_prices (JSON)
// ═══════════════════════════════════════════════════════

// ──────────────────────────────────────────────
// 1A. Canonical Projections (3 layers)
// ──────────────────────────────────────────────
//
// Layer 1: runtime_product_management VIEW columns (16 columns — NO company_id)
//   product_id, product_code, barcode, product_name, category, product_image_url,
//   company_name_snapshot, base_unit_id, company_name, company_logo_url,
//   is_active, sales_blocked, track_inventory, units, active_prices, created_at
//
// Layer 2: products TABLE columns (13 columns — HAS company_id)
//   id, product_code, product_name, company_id, category, product_image_url,
//   barcode, is_active, created_at, company_name_snapshot, base_unit_id,
//   track_inventory, sales_blocked
//
// Layer 3: companies TABLE (brands — for join only)
//   id, company_code, company_name, company_logo_url

// Canonical column mapping (both view-compatible and table-only)
const P = {
  id: 'product_id',             // view alias; raw products.id
  code: 'product_code',
  barcode: 'barcode',
  name: 'product_name',
  category: 'category',
  imageUrl: 'product_image_url',
  brandId: 'company_id',        // TABLE-ONLY — products.company_id FK
  companyNameSnapshot: 'company_name_snapshot', // LEGACY text field
  baseUnitId: 'base_unit_id',
  isActive: 'is_active',
  salesBlocked: 'sales_blocked',
  trackInventory: 'track_inventory',
  createdAt: 'created_at',
};

// View-only columns (NOT in raw products table)
const P_VIEW = {
  brandName: 'company_name',       // view-only, joined from companies
  brandLogoUrl: 'company_logo_url', // view-only, joined from companies
  units: 'units',                  // JSON aggregate
  activePrices: 'active_prices',   // JSON aggregate
};

// VIEW-SAFE columns only (16 columns — NO company_id, NO id)
// These exist in runtime_product_management
const VIEW_COLUMNS = [
  'product_id', 'product_code', 'barcode', 'product_name', 'category',
  'product_image_url', 'company_name_snapshot', 'base_unit_id',
  'company_name', 'company_logo_url',
  'is_active', 'sales_blocked', 'track_inventory',
  'units', 'active_prices', 'created_at',
];

// Products table columns (for mutations)
const TABLE_COLUMNS = [
  'id', 'product_code', 'product_name', 'company_id', 'category',
  'product_image_url', 'barcode', 'is_active', 'created_at',
  'company_name_snapshot', 'base_unit_id', 'track_inventory', 'sales_blocked',
];

export const ProductContract = { ...P, ...P_VIEW };

export function productListFields() {
  return 'product_id,product_code,product_name,category,product_image_url,company_name,is_active,sales_blocked';
}

export function productSearchFields() {
  return 'product_id,product_code,product_name,barcode,product_image_url,company_name,is_active';
}

export function productDetailFields() {
  return VIEW_COLUMNS.join(',');
}

export function productManagementFields() {
  return VIEW_COLUMNS.join(',');
}

// ──────────────────────────────────────────────
// 1B. Normalization
// ──────────────────────────────────────────────

export function normalizeManagedProduct(p) {
  if (!p) return null;
  const out = { ...p };
  for (const key of Object.keys(ProductContract)) {
    const col = ProductContract[key];
    let val = p[col];
    if (val === undefined || val === null) {
      val = p[key] ?? null;
    }
    out[key] = val;
  }
  out._units = typeof out.units === 'string' ? safeJsonParse(out.units, []) : (out.units || []);
  out._activePrices = typeof out.activePrices === 'string' ? safeJsonParse(out.activePrices, []) : (out.activePrices || []);
  out._unitCount = out._units.length;
  out._priceCount = out._activePrices.length;
  out._hasBasePrice = out._activePrices.some(pr => pr.base_price != null);
  out._isEditable = !out.salesBlocked && out.isActive;
  return out;
}

export function normalizeManagedProducts(arr) {
  return (arr || []).map(normalizeManagedProduct);
}

export function guardProduct(p) {
  if (!p) return { valid: false, reason: 'null' };
  const id = p.product_id || p.id;
  if (!id) return { valid: false, reason: 'missing_product_id' };
  return { valid: true };
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ═══════════════════════════════════════════════════════
// 2. CANONICAL PRODUCT UNIT CONTRACT
// ═══════════════════════════════════════════════════════
// Source: product_units table

export const ProductUnitContract = {
  id: 'unit_id',             // view alias; raw product_units.id
  code: 'unit_code',
  name: 'unit_name',
  parentQuantity: 'units_per_parent',
  isBaseUnit: 'is_base_unit',
  isSellable: 'is_sellable',
  isActive: 'is_active',
  baseUnitQuantity: 'base_unit_quantity',
  displayOrder: 'display_order',
};

export function normalizeProductUnit(u) {
  if (!u) return null;
  const out = { ...u };
  for (const key of Object.keys(ProductUnitContract)) {
    const col = ProductUnitContract[key];
    let val = u[col];
    if (val === undefined || val === null) {
      val = u[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeProductUnits(arr) {
  return (arr || []).map(normalizeProductUnit);
}

// ═══════════════════════════════════════════════════════
// 3. CANONICAL PRODUCT PRICE CONTRACT
// ═══════════════════════════════════════════════════════
// Source: product_prices table
// Note: PK is `id` in table; view aliases as `price_id`

export const ProductPriceContract = {
  id: 'price_id',            // view alias; raw product_prices.id
  productUnitId: 'product_unit_id',
  basePrice: 'base_price',
  isActive: 'is_active',
  availabilityStatus: 'availability_status',
  pricingSourceType: 'pricing_source_type',
  updatedAt: 'updated_at',
  updatedByEmployeeId: 'updated_by_employee_id',
  priority: 'priority',
  minimumQuantity: 'minimum_quantity',
  maximumQuantity: 'maximum_quantity',
};

export function normalizeProductPrice(pr) {
  if (!pr) return null;
  const out = { ...pr };
  for (const key of Object.keys(ProductPriceContract)) {
    const col = ProductPriceContract[key];
    let val = pr[col];
    if (val === undefined || val === null) {
      val = pr[key] ?? null;
    }
    out[key] = val;
  }
  return out;
}

export function normalizeProductPrices(arr) {
  return (arr || []).map(normalizeProductPrice);
}

// ═══════════════════════════════════════════════════════
// 4. CANONICAL PAYLOAD BUILDERS
// ═══════════════════════════════════════════════════════
// These are the ONLY way to construct mutation payloads.
// UI code calls these — never constructs raw DB objects.

// Product builder: UI sends brand_id (UUID FK) + brand_name (for legacy snapshot).
// The brand name is the display name from the companies table,
// stored in company_name_snapshot for backward compatibility.
export function buildProductPayload(vals, brandMap) {
  if (!vals) return {};
  const payload = {};
  if (vals.product_name !== undefined) payload.product_name = vals.product_name || null;
  if (vals.product_code !== undefined) payload.product_code = vals.product_code || null;
  if (vals.category !== undefined) payload.category = vals.category || null;
  if (vals.barcode !== undefined) payload.barcode = vals.barcode || null;
  if (vals.product_image_url !== undefined) payload.product_image_url = vals.product_image_url || null;
  if (vals.track_inventory !== undefined) payload.track_inventory = vals.track_inventory === 'true';
  if (vals.sales_blocked !== undefined) payload.sales_blocked = vals.sales_blocked === 'true';
  if (vals.is_active !== undefined) payload.is_active = vals.is_active === 'true';
  // Brand FK: brand_id is a UUID from the companies table
  // brandMap is { id, name }[] used to resolve name for legacy snapshot
  if (vals.brand_id !== undefined) {
    payload.company_id = vals.brand_id || null;
    if (vals.brand_id && brandMap) {
      const match = brandMap.find(b => b.id === vals.brand_id);
      if (match) payload.company_name_snapshot = match.name;
      else payload.company_name_snapshot = null;
    } else {
      payload.company_name_snapshot = null;
    }
  }
  // Legacy: if UI still sends company_name_snapshot directly, respect it
  if (vals.company_name_snapshot !== undefined && payload.company_id === undefined) {
    payload.company_name_snapshot = vals.company_name_snapshot || null;
  }
  return payload;
}

export function buildProductPricePayload(vals) {
  if (!vals) return {};
  const payload = {};
  if (vals.product_id !== undefined) payload.product_id = vals.product_id;
  if (vals.product_unit_id !== undefined) payload.product_unit_id = vals.product_unit_id || null;
  if (vals.base_price !== undefined) payload.base_price = vals.base_price !== '' ? Number(vals.base_price) : null;
  if (vals.is_active !== undefined) payload.is_active = vals.is_active === 'true';
  if (vals.availability_status !== undefined) payload.availability_status = vals.availability_status || 'available';
  if (vals.pricing_source_type !== undefined) payload.pricing_source_type = vals.pricing_source_type || 'manual';
  if (vals.priority !== undefined) payload.priority = vals.priority !== '' ? Number(vals.priority) : null;
  if (vals.minimum_quantity !== undefined) payload.minimum_quantity = vals.minimum_quantity !== '' ? Number(vals.minimum_quantity) : null;
  if (vals.maximum_quantity !== undefined) payload.maximum_quantity = vals.maximum_quantity !== '' ? Number(vals.maximum_quantity) : null;
  return payload;
}

export function buildProductUnitPayload(vals) {
  if (!vals) return {};
  const payload = {};
  if (vals.unit_name !== undefined) payload.unit_name = vals.unit_name || null;
  if (vals.unit_code !== undefined) payload.unit_code = vals.unit_code || null;
  if (vals.is_base_unit !== undefined) payload.is_base_unit = vals.is_base_unit === 'true';
  if (vals.is_sellable !== undefined) payload.is_sellable = vals.is_sellable === 'true';
  if (vals.is_active !== undefined) payload.is_active = vals.is_active === 'true';
  if (vals.base_unit_quantity !== undefined) payload.base_unit_quantity = vals.base_unit_quantity !== '' ? Number(vals.base_unit_quantity) : null;
  if (vals.display_order !== undefined) payload.display_order = vals.display_order !== '' ? Number(vals.display_order) : null;
  return payload;
}

// ──────────────────────────────────────────────
// 5. Governance
// ──────────────────────────────────────────────

export const PRODUCT_GOVERNANCE = {
  requiredCapability: 'can_manage_inventory',
  view: 'runtime_product_management',
  fallbackTable: 'products',
  fallbackSelect: 'id,product_code,product_name,company_name_snapshot,is_active,category,product_image_url,barcode',
};

export function canManageProducts(identity) {
  if (!identity) return false;
  return identity.capabilities?.can_manage_inventory === true
    || identity.isAdmin === true;
}

export const PRODUCT_SOURCE = {
  view: 'runtime_product_management',
  fallbackTable: 'products',
  fallbackSelect: 'id,product_code,product_name,category,product_image_url,company_name_snapshot,barcode,is_active',
};
