import { logError } from '../../utils/logger.js';
import { getSession, subscribe } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { buildWhatsAppMessage } from './whatsappApi.js';
import { runtimePriceSelectFields } from '../contracts/pricing.contract.js';

const STORAGE_KEY = 'v2_cart';
const STATE_KEY = 'v2_cart_state';
const CUSTOMER_SELECT_KEY = 'v2_cart_customer';
const RETURN_HASH_KEY = 'v2_cart_return';
const EDIT_ORDER_KEY = 'v2_edit_order_id';
const API = readConfig().baseUrl;

export const CART_STATE = {
  CLEAN: 'CLEAN',
  DIRTY: 'DIRTY',
  STALE: 'STALE',
  INVALID: 'INVALID',
};

// ─── Checkout Lock ────────────────────────────────
let _checkoutLocked = false;
let _checkoutLockTimer = null;
const CHECKOUT_LOCK_TIMEOUT = 30000;

export function acquireCheckoutLock() {
  if (_checkoutLocked) return false;
  _checkoutLocked = true;
  _checkoutLockTimer = setTimeout(() => { _checkoutLocked = false; }, CHECKOUT_LOCK_TIMEOUT);
  return true;
}

export function releaseCheckoutLock() {
  _checkoutLocked = false;
  if (_checkoutLockTimer) { clearTimeout(_checkoutLockTimer); _checkoutLockTimer = null; }
}

export function isCheckoutLocked() {
  return _checkoutLocked;
}

// ─── Cart State Machine ───────────────────────────

function _getState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || { state: 'CLEAN', dirtyAt: null }; } catch { return { state: 'CLEAN', dirtyAt: null }; }
}

function _saveState(s) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function getCartMachineState() {
  return _getState().state;
}

export function markDirty() {
  const s = _getState();
  if (s.state === 'LOCKED') return;
  s.state = 'DIRTY'; s.dirtyAt = Date.now(); _saveState(s);
}

export function markStale() {
  const s = _getState();
  s.state = 'STALE'; s.staleAt = Date.now(); _saveState(s);
}

export function markClean() {
  const s = _getState(); s.state = 'CLEAN'; _saveState(s);
}

export function markInvalid() {
  const s = _getState(); s.state = 'INVALID'; _saveState(s);
}

// ─── Customer Selection ───────────────────────────

export function getSelectedCustomer() {
  try { const v = sessionStorage.getItem(CUSTOMER_SELECT_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}

export function setSelectedCustomer(cust) {
  try { sessionStorage.setItem(CUSTOMER_SELECT_KEY, JSON.stringify(cust)); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function clearSelectedCustomer() {
  try { sessionStorage.removeItem(CUSTOMER_SELECT_KEY); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function getReturnHash() {
  try { return sessionStorage.getItem(RETURN_HASH_KEY) || ''; } catch { return ''; }
}

export function setReturnHash(h) {
  try { sessionStorage.setItem(RETURN_HASH_KEY, h); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function clearReturnHash() {
  try { sessionStorage.removeItem(RETURN_HASH_KEY); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

// ─── Edit Order Mode ──────────────────────────────

export function setEditOrderId(orderId) {
  try { sessionStorage.setItem(EDIT_ORDER_KEY, orderId); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function getEditOrderId() {
  try { return sessionStorage.getItem(EDIT_ORDER_KEY) || null; } catch { return null; }
}

export function clearEditOrderId() {
  try { sessionStorage.removeItem(EDIT_ORDER_KEY); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function isEditMode() {
  return !!getEditOrderId();
}

export function restoreCartFromOrder(order, items) {
  const cartItems = (items || []).map(item => ({
    pid: item.product_id,
    puid: item.product_unit_id,
    qty: Number(item.quantity || 1),
    product: item.product_id_product || null,
    unit: null,
    code: item.product_code_snapshot || '',
    unitName: item.unit_name_snapshot || 'قطعة',
    unitCode: item.unit_code_snapshot || '',
  }));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems)); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  try { localStorage.removeItem(STATE_KEY); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  return cartItems;
}

const JUST_SELECTED_KEY = 'v2_cust_just_selected';

export function setCustomerJustSelected(name) {
  try { sessionStorage.setItem(JUST_SELECTED_KEY, name || '1'); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function consumeCustomerJustSelected() {
  try { const v = sessionStorage.getItem(JUST_SELECTED_KEY); sessionStorage.removeItem(JUST_SELECTED_KEY); return v; } catch { return null; }
}

export function requireCustomer() {
  const s = getSession();
  if (s?.actor?.type === 'customer') return true;
  const selected = getSelectedCustomer();
  if (selected && selected.id) return true;
  setReturnHash(location.hash);
  location.hash = '#customers?select=1';
  return false;
}

// ─── Cart Items ────────────────────────────────────

export function getCartRaw() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function _save(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function addItem(productId, unitId, qty = 1, extra = {}) {
  const items = getCartRaw();
  const idx = items.findIndex(i => i.pid === productId && i.puid === unitId);
  if (idx >= 0) { items[idx].qty += qty; } else { items.push({ pid: productId, puid: unitId, qty, ...extra }); }
  _save(items); markDirty(); return items;
}

export function removeItem(productId, unitId) {
  const items = getCartRaw().filter(i => !(i.pid === productId && i.puid === unitId));
  _save(items); markDirty(); return items;
}

export function updateQuantity(productId, unitId, qty) {
  const items = getCartRaw();
  if (qty <= 0) return removeItem(productId, unitId);
  const item = items.find(i => i.pid === productId && i.puid === unitId);
  if (item) item.qty = qty;
  _save(items); markDirty(); return items;
}

export function clearCart() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  try { localStorage.removeItem(STATE_KEY); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export function cartCount() {
  return getCartRaw().reduce((s, i) => s + i.qty, 0);
}

// ─── Session Subscription (STALE detection) ──────

let _subscribed = false;
let _lastTierKey = null;

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

export function initCartRuntime() {
  if (_subscribed) return;
  _subscribed = true;

  const s = getSession();
  _lastTierKey = _tierKey(s);

  subscribe((session) => {
    const tier = _tierKey(session);
    if (_lastTierKey && tier !== _lastTierKey) {
      markStale();
    }
    _lastTierKey = tier;
  });
}

function _tierKey(session) {
  if (!session || session.status !== 'authenticated') return null;
  return `${session.actor?.type}:${session.actor?.id}:${session.role?.roleName || ''}`;
}

// ─── Cart Hydration ───────────────────────────────

let _gen = 0;

export async function hydrateCart() {
  const gen = ++_gen;
  const raw = getCartRaw();
  if (!raw.length) return [];

  const productIds = [...new Set(raw.map(i => i.pid))];

  const [products, stockRaw] = await Promise.all([
    _fetchProducts(productIds),
    _fetchStock(productIds),
  ]);
  if (_gen !== gen) return [];

  const productMap = {};
  for (const p of products) productMap[p.id] = p;

  const stockMap = {};
  for (const row of stockRaw) {
    if (!stockMap[row.product_id]) stockMap[row.product_id] = {};
    if (!stockMap[row.product_id][row.product_unit_id]) stockMap[row.product_id][row.product_unit_id] = 0;
    stockMap[row.product_id][row.product_unit_id] += (row.available_qty || 0);
  }

  const hydrated = [];
  for (const item of raw) {
    const product = productMap[item.pid];
    if (!product) continue;
    const unit = (product.units || []).find(u => u.id === item.puid);
    hydrated.push({
      pid: item.pid, puid: item.puid, qty: item.qty, product, unit,
      stock: stockMap[item.pid]?.[item.puid] ?? null,
      unitName: unit?.unit_name || unit?.unit_code || '',
      unitCode: unit?.unit_code || '',
    });
  }

  if (_gen !== gen) return [];
  const priced = await _applyPrices(hydrated, gen);
  if (_gen !== gen) return [];

  const hasErrors = priced.some(h => !h.price?.found || !h.product || !h.unit || (h.stock !== null && h.qty > h.stock));
  if (hasErrors) markInvalid(); else markClean();

  return priced;
}

async function _fetchProducts(ids) {
  if (!ids.length) return [];
  const idList = ids.join(',');
  const selectFields = 'id,product_name,product_image_url,product_code,company_name_snapshot,category,barcode';
  const r = await fetch(`${API}/products?id=in.(${idList})&select=${selectFields}`, { headers: _headers() });
  if (!r.ok) return [];
  const products = await r.json();
  const withUnits = await Promise.all(products.map(async (p) => {
    const u = await fetch(`${API}/product_units?product_id=eq.${p.id}&is_active=eq.true&order=display_order.asc`, { headers: _headers() }).then(r => r.ok ? r.json() : []);
    return { ...p, units: u };
  }));
  return withUnits;
}

async function _fetchStock(ids) {
  if (!ids.length) return [];
  const idList = ids.join(',');
  const r = await fetch(`${API}/inventory_stock?product_id=in.(${idList})&select=product_id,product_unit_id,available_qty,branch_id`, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

async function _applyPrices(items, gen) {
  const s = getSession();
  const customerId = s?.actor?.type === 'customer' && s?.actor?.id ? s.actor.id : null;

  const priced = await Promise.all(items.map(async (item) => {
    if (_gen !== gen) return null;
    const body = { p_product_id: item.pid, p_unit_id: item.puid, p_quantity: item.qty, p_customer_id: customerId };
    try {
      const r = await fetch(`${API}/rpc/resolve_product_price`, {
        method: 'POST', headers: _headers(), body: JSON.stringify(body),
      });
      if (r.ok) {
        const price = await r.json();
        return { ...item, price, _pricingContext: _extractContext(price, s) };
      }
    } catch { /* RPC not available, fallback */ }

    // Fallback: use runtime_product_prices view (tier-resolved)
    try {
      const pr = await fetch(`${API}/runtime_product_prices?product_id=eq.${item.pid}&product_unit_id=eq.${item.puid}&select=${runtimePriceSelectFields()}`, { headers: _headers() });
      if (pr.ok) {
        const arr = await pr.json();
        if (arr.length) {
          const tierCode = await _fetchCustomerTierCode();
          const pick = _pickTierPrice(arr, tierCode);
          const price = { found: true, base_price: pick.base_price, final_price: pick.final_price, discount_percent: pick.discount_percent || 0, tier_name: pick.tier_name, tier_code: pick.tier_code };
          return { ...item, price, _pricingContext: _extractContext(price, s) };
        }
      }
    } catch { /* ignore */ }
    return { ...item, price: null, _pricingContext: null };
  }));
  return priced.filter(Boolean);
}

function _extractContext(price, session) {
  if (!price?.found) return null;
  return {
    basePrice: price.base_price,
    finalPrice: price.final_price,
    discountPercent: price.discount_percent || 0,
    tierLabel: price.tier_name || null,
    reason: price.reason || null,
    hasDiscount: price.base_price !== price.final_price,
  };
}

// ─── Totals ───────────────────────────────────────

export function computeTotals(hydrated) {
  let subtotal = 0;
  let discountTotal = 0;
  for (const item of hydrated) {
    if (!item.price?.found) continue;
    subtotal += item.price.base_price * item.qty;
    discountTotal += (item.price.base_price - item.price.final_price) * item.qty;
  }
  const grand = hydrated.reduce((s, item) => {
    if (!item.price?.found) return s;
    return s + item.price.final_price * item.qty;
  }, 0);
  return { subtotal, discountTotal, grand };
}

// ─── Validation ───────────────────────────────────

export function validateCart(hydrated) {
  const errors = [];
  for (const item of hydrated) {
    if (!item.product) errors.push({ pid: item.pid, msg: 'المنتج غير موجود' });
    else if (!item.unit) errors.push({ pid: item.pid, msg: 'الوحدة غير موجودة' });
    else if (!item.price?.found) errors.push({ pid: item.pid, msg: 'السعر غير متوفر' });
    else if (item.stock !== null && item.qty > item.stock) errors.push({ pid: item.pid, msg: `الكمية المطلوبة (${item.qty}) تتجاوز المتاح (${item.stock})` });
  }
  return errors;
}

// ─── Checkout ─────────────────────────────────────

export function buildCheckoutWhatsApp(hydrated, notes) {
  const s = getSession();
  const items = hydrated.map(h => ({
    product_name_snapshot: h.product?.product_name || '',
    product_code_snapshot: h.product?.product_code || h.code || '',
    quantity: h.qty,
    final_price: h.price?.final_price || 0,
    base_price: h.price?.base_price || 0,
    discount_percent: h.price?.discount_percent || 0,
    unit_name_snapshot: h.unitName || 'قطعة',
    tier_name_snapshot: h._pricingContext?.tierLabel || '',
  }));
  const order = { total_amount: computeTotals(hydrated).grand };
  const vm = { company: { name: 'شركة الأهرام للتجارة والتوزيع', brand: 'متجر الأهرام' }, invoice: { number: '', total: computeTotals(hydrated).grand, itemCount: items.length, totalQty: items.reduce((a, i) => a + i.quantity, 0), status: 'pending', statusLabel: 'قيد الانتظار', dateStr: new Date().toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }), timeStr: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }), date: new Date(), notes: '' }, customer: { name: s?.actor?.fullName || '', phone: s?.actor?.phone || '', address: s?.actor?.address || '' }, creator: { name: s?.actor?.fullName || '', phone: s?.actor?.phone || '', address: s?.actor?.address || '', type: s?.actor?.type || '' }, execution: { latitude: null, longitude: null, accuracy: null, quality: null, qualityLabel: '', source: null, capturedAt: null, mapsUrl: '' }, visit: null, items, groupedItems: [], geoGuidance: notes || null };
  return buildWhatsAppMessage(vm);
}

// ─── Utils ────────────────────────────────────────

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'count=exact' };

  return h;
}

