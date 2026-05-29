// Product Management Service
// Canonical service for #ops/products
//
// Uses runtime_product_management view (when available) with
// fallback to raw products + product_units + product_prices queries.
//
// Governance: all mutations require can_manage_inventory capability.

import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { hasCapability } from '../../auth/sessionService.js';
import { getIdentity } from '../storefront/governanceRuntime.js';
import {
  productListFields,
  productDetailFields,
  productSearchFields,
  buildProductPayload,
  buildProductPricePayload,
  buildProductUnitPayload,
  PRODUCT_GOVERNANCE,
} from '../contracts/products.contract.js';

const API = readConfig().baseUrl;
const VIEW = PRODUCT_GOVERNANCE.view;

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

async function _fetch(url) {
  const r = await fetch(url, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

// ──────────────────────────────────────────────
// 1. Product List
// ──────────────────────────────────────────────

export async function getManagedProductList({ search, category, isActive, limit = 30, offset = 0 } = {}) {
  const params = new URLSearchParams({
    select: productListFields(),
    order: 'product_name.asc',
    limit: String(limit),
    offset: String(offset),
  });
  if (search) params.append('product_name', `ilike.*${search}*`);
  if (category) params.append('category', `eq.${category}`);
  if (isActive === true) params.append('is_active', 'eq.true');
  else if (isActive === false) params.append('is_active', 'eq.false');
  const r = await fetch(`${API}/${VIEW}?${params}`, { headers: _headers() });
  if (!r.ok) {
    // Fallback to raw products
    const fallbackParams = new URLSearchParams({
      select: PRODUCT_GOVERNANCE.fallbackSelect,
      order: 'product_name.asc',
      limit: String(limit),
      offset: String(offset),
    });
    if (search) fallbackParams.append('product_name', `ilike.*${search}*`);
    if (category) fallbackParams.append('category', `eq.${category}`);
    if (isActive === true) fallbackParams.append('is_active', 'eq.true');
    else if (isActive === false) fallbackParams.append('is_active', 'eq.false');
    const fr = await fetch(`${API}/products?${fallbackParams}`, { headers: _headers() });
    if (!fr.ok) throw new Error('فشل تحميل المنتجات');
    const count = parseInt(fr.headers.get('content-range')?.split('/')[1] || '0', 10);
    return { data: await fr.json(), count };
  }
  const count = parseInt(r.headers.get('content-range')?.split('/')[1] || '0', 10);
  return { data: await r.json(), count };
}

// ──────────────────────────────────────────────
// 2. Product Detail
// ──────────────────────────────────────────────

export async function getManagedProductDetail(productId) {
  // Query view with view-safe fields (no company_id — view doesn't have it)
  const rows = await _fetch(`${API}/${VIEW}?product_id=eq.${productId}&select=${productDetailFields()}`);
  if (rows.length) {
    // Fetch company_id separately from raw products table
    const productRow = await _fetch(`${API}/products?id=eq.${productId}&select=company_id`);
    if (productRow.length) {
      rows[0].company_id = productRow[0].company_id;
    }
    return rows[0];
  }

  // Fallback: reconstruct from raw tables
  const [product, units, prices] = await Promise.all([
    _fetch(`${API}/products?id=eq.${productId}&select=*`),
    _fetch(`${API}/product_units?product_id=eq.${productId}&is_active=eq.true&order=display_order.asc`),
    _fetch(`${API}/product_prices?product_id=eq.${productId}&is_active=eq.true&order=priority.desc`),
  ]);
  if (!product.length) throw new Error('المنتج غير موجود');
  // Resolve brand name from companies table
  let brandName = product[0].company_name_snapshot || '';
  if (product[0].company_id) {
    const brandRow = await _fetch(`${API}/companies?id=eq.${product[0].company_id}&select=company_name`);
    if (brandRow.length) brandName = brandRow[0].company_name;
  }
  return {
    product_id: product[0].id,
    product_code: product[0].product_code,
    barcode: product[0].barcode,
    product_name: product[0].product_name,
    category: product[0].category,
    product_image_url: product[0].product_image_url,
    company_id: product[0].company_id,
    company_name: brandName,
    is_active: product[0].is_active,
    sales_blocked: product[0].sales_blocked,
    track_inventory: product[0].track_inventory,
    created_at: product[0].created_at,
    units: units,
    active_prices: prices,
  };
}

// ──────────────────────────────────────────────
// 3. Product Search
// ──────────────────────────────────────────────

export async function searchManagedProducts(query, limit = 10) {
  if (!query || query.length < 2) return [];
  const params = new URLSearchParams({
    select: productSearchFields(),
    or: `(product_name.ilike.*${query}*,product_code.ilike.*${query}*,barcode.ilike.*${query}*)`,
    limit: String(limit),
  });
  return _fetch(`${API}/${VIEW}?${params}`);
}

// ──────────────────────────────────────────────
// 4. Categories
// ──────────────────────────────────────────────

export async function getManagedCategories() {
  const params = new URLSearchParams({
    select: 'category',
    is_active: 'eq.true',
    category: 'not.is.null',
    order: 'category.asc',
  });
  const rows = await _fetch(`${API}/products?${params}`);
  return [...new Set(rows.map(r => r.category).filter(Boolean))];
}

// ═══════════════════════════════════════════════════════
// 5. CANONICAL MUTATIONS
// ═══════════════════════════════════════════════════════
// All mutations go through canonical payload builders from the contract.
// UI code never constructs raw DB payloads.

async function _requireGovernance() {
  // SUPER_ADMIN bypass: check identity/session first before RPC (which requires Supabase JWT)
  const identity = getIdentity();
  if (identity?.isAdmin || String(getSession()?.role?.roleCode || '').toUpperCase() === 'SUPER_ADMIN') return;
  const ok = await hasCapability(PRODUCT_GOVERNANCE.requiredCapability);
  if (!ok) throw new Error('لا تملك صلاحية إدارة المنتجات');
}

let _brandsCache = null;
async function _getBrands() {
  if (!_brandsCache) {
    const rows = await _fetch(`${API}/companies?select=id,company_name&is_active=eq.true`);
    _brandsCache = rows.map(r => ({ id: r.id, name: r.company_name }));
  }
  return _brandsCache;
}

// Exported so UI can build dropdown options
export async function getManagedBrands() {
  return _getBrands();
}

export async function createProduct(vals) {
  await _requireGovernance();
  const brands = await _getBrands();
  const payload = buildProductPayload(vals, brands);
  const r = await fetch(`${API}/products`, {
    method: 'POST',
    headers: { ..._headers(), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('فشل إنشاء المنتج');
  _brandsCache = null;
  return r.json();
}

export async function updateProduct(productId, vals) {
  await _requireGovernance();
  const brands = await _getBrands();
  const payload = buildProductPayload(vals, brands);
  const r = await fetch(`${API}/products?id=eq.${productId}`, {
    method: 'PATCH',
    headers: _headers(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('فشل تحديث المنتج');
  _brandsCache = null;
  return true;
}

export async function deleteProduct(productId) {
  await _requireGovernance();
  const r = await fetch(`${API}/products?id=eq.${productId}`, {
    method: 'DELETE',
    headers: _headers(),
  });
  if (!r.ok) throw new Error('فشل حذف المنتج');
  return true;
}

export async function createProductUnit(productId, vals) {
  await _requireGovernance();
  const payload = buildProductUnitPayload(vals);
  const r = await fetch(`${API}/product_units`, {
    method: 'POST',
    headers: { ..._headers(), Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, product_id: productId }),
  });
  if (!r.ok) throw new Error('فشل إنشاء الوحدة');
  return r.json();
}

export async function updateProductUnit(unitId, vals) {
  await _requireGovernance();
  const payload = buildProductUnitPayload(vals);
  const r = await fetch(`${API}/product_units?id=eq.${unitId}`, {
    method: 'PATCH',
    headers: _headers(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('فشل تحديث الوحدة');
  return true;
}

export async function deleteProductUnit(unitId) {
  await _requireGovernance();
  const r = await fetch(`${API}/product_units?id=eq.${unitId}`, {
    method: 'DELETE',
    headers: _headers(),
  });
  if (!r.ok) throw new Error('فشل حذف الوحدة');
  return true;
}

export async function upsertProductPrice(priceData) {
  await _requireGovernance();
  const { price_id, product_id, ...rest } = priceData;
  const vals = buildProductPricePayload({ product_id, ...rest });
  if (price_id) {
    const r = await fetch(`${API}/product_prices?id=eq.${price_id}`, {
      method: 'PATCH',
      headers: _headers(),
      body: JSON.stringify(vals),
    });
    if (!r.ok) throw new Error('فشل تحديث السعر');
    return true;
  }
  const r = await fetch(`${API}/product_prices`, {
    method: 'POST',
    headers: { ..._headers(), Prefer: 'return=representation' },
    body: JSON.stringify(vals),
  });
  if (!r.ok) throw new Error('فشل إنشاء السعر');
  return r.json();
}
