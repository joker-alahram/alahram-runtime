import { getSession, subscribe } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { runtimePriceSelectFields } from '../contracts/pricing.contract.js';

const API = readConfig().baseUrl;

const _priceCache = { data: null, ttl: 0, key: '' };
const PRICE_CACHE_TTL = 60000;

function _getCached(key) {
  if (_priceCache.key === key && _priceCache.data && Date.now() < _priceCache.ttl) {
    return _priceCache.data;
  }
  return null;
}

function _setCache(key, data) {
  _priceCache.key = key;
  _priceCache.data = data;
  _priceCache.ttl = Date.now() + PRICE_CACHE_TTL;
}

subscribe((ses) => {
  if (ses?.status) clearPriceCache();
});

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'count=exact' };

  return h;
}

let _customerTierCache = null;

async function _fetchCustomerTierCode() {
  const s = getSession();
  if (s?.actor?.type !== 'customer' || !s?.actor?.id) return null;
  if (_customerTierCache) return _customerTierCache;
  try {
    const r = await fetch(`${API}/customer_tier_assignments?customer_id=eq.${s.actor.id}&is_active=eq.true&select=tier_id&limit=1`, { headers: _headers() });
    if (r.ok) {
      const rows = await r.json();
      if (rows.length) {
        const tr = await fetch(`${API}/pricing_tiers?id=eq.${rows[0].tier_id}&select=tier_code`, { headers: _headers() });
        if (tr.ok) {
          const tiers = await tr.json();
          if (tiers.length) { _customerTierCache = tiers[0].tier_code; return _customerTierCache; }
        }
      }
    }
  } catch { /* ignore */ }
  _customerTierCache = null;
  return null;
}

function _pickTierPrice(arr, tierCode) {
  if (!arr.length) return null;
  if (tierCode) {
    const match = arr.find(p => p.tier_code === tierCode);
    if (match) return match;
  }
  return arr.find(p => !p.tier_code) || arr[0];
}

async function _fallbackPrice(productId, unitId) {
  try {
    const pr = await fetch(`${API}/runtime_product_prices?product_id=eq.${productId}&product_unit_id=eq.${unitId}&select=${runtimePriceSelectFields()}`, { headers: _headers() });
    if (!pr.ok) return null;
    const arr = await pr.json();
    if (!arr.length) return null;
    const tierCode = await _fetchCustomerTierCode();
    const pick = _pickTierPrice(arr, tierCode);
    return { found: true, base_price: pick.base_price, final_price: pick.final_price, discount_percent: pick.discount_percent || 0, tier_name: pick.tier_name, tier_code: pick.tier_code };
  } catch { return null; }
}

async function _fallbackBatchPrices(productIds) {
  try {
    const r = await fetch(`${API}/runtime_product_prices?product_id=in.(${productIds.join(',')})&select=product_id,product_unit_id,base_price,final_price,discount_percent,tier_name,tier_code`, { headers: _headers() });
    if (!r.ok) return [];
    const arr = await r.json();
    const tierCode = await _fetchCustomerTierCode();
    const byProduct = {};
    for (const p of arr) {
      const key = p.product_id + '|' + (p.product_unit_id || '');
      if (!byProduct[key]) byProduct[key] = [];
      byProduct[key].push(p);
    }
    return Object.values(byProduct).map(ps => {
      const pick = _pickTierPrice(ps, tierCode);
      return {
        product_id: pick.product_id, product_unit_id: pick.product_unit_id,
        final_price: pick.final_price, base_price: pick.base_price,
        discount_percent: pick.discount_percent || 0, found: true,
        tier_name: pick.tier_name, tier_code: pick.tier_code,
      };
    });
  } catch { return []; }
}

export async function getProductList({ limit = 20, offset = 0, category } = {}) {
  const params = new URLSearchParams({
    select: 'id,product_name,product_image_url,category,company_name_snapshot,barcode',
    is_active: 'eq.true',
    order: 'product_name.asc',
    limit: String(limit),
    offset: String(offset),
  });
  if (category) params.append('category', `eq.${category}`);
  const r = await fetch(`${API}/products?${params}`, { headers: _headers() });
  if (!r.ok) throw new Error('فشل تحميل المنتجات');
  const count = parseInt(r.headers.get('content-range')?.split('/')[1] || '0', 10);
  return { data: await r.json(), count };
}

export async function getProductDetail(productId) {
  const [product, units, prices, stock] = await Promise.all([
    fetch(`${API}/products?id=eq.${productId}&select=*`, { headers: _headers() }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/product_units?product_id=eq.${productId}&is_active=eq.true&order=display_order.asc`, { headers: _headers() }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/runtime_product_prices?product_id=eq.${productId}&select=product_unit_id,base_price,final_price,discount_percent,tier_name,tier_code,is_active`, { headers: _headers() }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/inventory_stock?product_id=eq.${productId}&select=*`, { headers: _headers() }).then(r => r.ok ? r.json() : []),
  ]);
  if (!product.length) throw new Error('المنتج غير موجود');
  return { product: product[0], units, prices, stock };
}

export async function getProductPrice(productId, unitId, quantity = 1) {
  const s = getSession();
  const body = { p_product_id: productId, p_unit_id: unitId, p_quantity: quantity, p_customer_id: null };
  if (s?.actor?.type === 'customer' && s?.actor?.id) body.p_customer_id = s.actor.id;
  try {
    const r = await fetch(`${API}/rpc/resolve_product_price`, {
      method: 'POST', headers: _headers(), body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
  } catch { /* RPC not available, fallback */ }

  return _fallbackPrice(productId, unitId);
}

export function clearPriceCache() {
  _priceCache.data = null;
  _priceCache.ttl = 0;
  _priceCache.key = '';
}

export async function getProductPricesBatch(productIds) {
  if (!productIds.length) return [];
  const cacheKey = productIds.sort().join(',');
  const cached = _getCached(cacheKey);
  if (cached) return cached;

  const s = getSession();
  const body = { p_product_ids: productIds, p_customer_id: null };
  if (s?.actor?.type === 'customer' && s?.actor?.id) body.p_customer_id = s.actor.id;
  let data;
  try {
    const r = await fetch(`${API}/rpc/resolve_product_prices_batch`, {
      method: 'POST', headers: _headers(), body: JSON.stringify(body),
    });
    if (r.ok) data = await r.json();
  } catch { /* RPC not available, fallback */ }

  if (!data) data = await _fallbackBatchPrices(productIds);
  if (data?.length) _setCache(cacheKey, data);
  return data || [];
}

export async function getProductStock(productIds) {
  if (!productIds.length) return {};
  const r = await fetch(`${API}/inventory_stock?product_id=in.(${productIds.join(',')})&select=product_id,product_unit_id,available_qty,reserved_qty,branch_id`, { headers: _headers() });
  if (!r.ok) return {};
  const rows = await r.json();
  const g = {};
  for (const row of rows) { if (!g[row.product_id]) g[row.product_id] = []; g[row.product_id].push(row); }
  return g;
}

export async function getCategories() {
  const r = await fetch(`${API}/products?select=category&is_active=eq.true&category=not.is.null&order=category.asc`, { headers: _headers() });
  if (!r.ok) return [];
  const rows = await r.json();
  return [...new Set(rows.map(r => r.category).filter(Boolean))];
}
