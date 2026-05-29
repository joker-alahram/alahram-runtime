import { getCartRaw, hydrateCart, computeTotals, validateCart, updateQuantity, removeItem, clearCart, getCartMachineState, CART_STATE } from '../../../services/storefront/cartApi.js';
import { getSession } from '../../../auth/sessionService.js';
import { logError } from '../../../utils/logger.js';
import { renderGuidanceCard } from '../../../runtime/guidance.js';

let _hydrated = [];
let _totals = { subtotal: 0, discountTotal: 0, grand: 0 };
let _errors = [];
let _pickerMs = 0;

export async function renderCartPage(container) {
  container.innerHTML = '<div class="v2-cart"><div class="v2-cart-loading">جاري تحميل السلة...</div></div>';
  try { await _render(container); } catch { _error(container); }
}

async function _render(container) {
  const raw = getCartRaw();
  if (!raw.length) {
    container.innerHTML = '<div class="v2-cart"><div class="v2-cart-empty-ill"><div class="v2-cart-empty-ill-icon">🛒</div><h3>السلة فارغة</h3><p>تصفح المنتجات وأضف ما تريد</p><a href="#products" class="v2-btn v2-btn-p" style="border-radius:12px;padding:.75rem 2rem">تصفح المنتجات</a></div></div>';
    return;
  }

  const totalQty = raw.reduce((s, i) => s + i.qty, 0);

  container.innerHTML = `<div class="v2-cart">
    <div class="v2-cart-header" style="padding-top:1rem"><h1>🛒 سلة المشتريات</h1><span class="v2-cart-count">${totalQty} قطعة</span></div>
    <div class="v2-cart-items" id="v2-cart-items"><div class="v2-cart-loading">جاري تحديث الأسعار...</div></div>
    <div class="v2-cart-foot" id="v2-cart-foot" style="display:none"></div>
  </div>`;

  const itemsEl = container.querySelector('#v2-cart-items');
  const footEl = container.querySelector('#v2-cart-foot');

  const t0 = performance.now();
  _hydrated = await hydrateCart();
  _pickerMs = performance.now() - t0;
  if (!_hydrated.length && raw.length) {
    _hydrated = raw.map(r => ({
      pid: r.pid, puid: r.puid, qty: r.qty,
      product: { product_name: r.name || '', product_image_url: r.img || '', product_code: r.code || '' },
      unit: { unit_name: r.unitName || '' },
      unitName: r.unitName || '',
      code: r.code || '',
      price: null, _pricingContext: null, stock: null,
    }));
  }
  _errors = validateCart(_hydrated);
  _totals = computeTotals(_hydrated);

  _renderItems(itemsEl, container);
  _renderFoot(footEl, totalQty);
  footEl.style.display = '';
}

function _renderItems(el, container) {
  if (!_hydrated.length) {
    el.innerHTML = '<div class="v2-cart-empty-ill"><div class="v2-cart-empty-ill-icon">🛒</div><h3>السلة فارغة</h3></div>';
    return;
  }

  const hasErrors = _errors.length > 0;
  const state = getCartMachineState();
  const discounted = _hydrated.some(h => h._pricingContext?.hasDiscount);

  let html = `<div class="v2-cart-list">${_hydrated.map((item, i) => _itemCard(item, i)).join('')}</div>`;

  if (hasErrors) {
    html += `<div class="v2-cart-errors">${_errors.map(e => `<p>${e.msg}</p>`).join('')}</div>`;
  }

  el.innerHTML = html;

  if (state === CART_STATE.STALE) {
    renderGuidanceCard(el, 'STALE_TIER', {});
  } else if (state === CART_STATE.INVALID) {
    renderGuidanceCard(el, 'INVALID_CART', {});
  }

  el.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { pid, puid } = btn.dataset;
      btn.style.transform = 'scale(.8)';
      btn.style.opacity = '.5';
      setTimeout(() => {
        removeItem(pid, puid);
        _render(container);
      }, 150);
    });
  });

  el.querySelectorAll('[data-action="qty"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { pid, puid } = btn.dataset;
      const delta = parseInt(btn.dataset.delta, 10);
      const current = _hydrated.find(h => h.pid === pid && h.puid === puid);
      if (!current) return;
      const newQty = Math.max(1, current.qty + delta);
      updateQuantity(pid, puid, newQty);
      _render(container);
    });
  });
}

function _renderFoot(el, totalQty) {
  const t = _totals;
  const hasErrors = _errors.length > 0;
  const state = getCartMachineState();
  const isReady = state === 'CLEAN' && !hasErrors && _hydrated.length > 0 && t.grand > 0;
  const ses = getSession();
  const isCustomer = ses?.actor?.type === 'customer';
  const itemsOk = _hydrated.length && !hasErrors && t.grand > 0;
  const discounted = _hydrated.some(h => h._pricingContext?.hasDiscount);
  const discountCount = _hydrated.filter(h => h._pricingContext?.hasDiscount).length;
  const tierLabel = _hydrated.map(h => h._pricingContext?.tierLabel).filter(Boolean);
  const uniqueTier = [...new Set(tierLabel)][0];

  const saved = t.discountTotal || 0;
  el.innerHTML = `<div class="v2-cart-summary-modern">
    <div class="v2-cart-summary-top">
      <span class="v2-cart-item-count">🛒 ${totalQty} قطعة</span>
      ${isCustomer || uniqueTier ? `<span class="v2-cart-tier-badge">🏷️ ${uniqueTier || 'قاعدة'}</span>` : ''}
    </div>
    <div class="v2-cart-totals">
      <div class="v2-cart-tr"><span>الإجمالي الفرعي</span><span id="v2-cart-subtotal">${_money(t.subtotal)}</span></div>
      ${saved > 0 ? `<div class="v2-cart-tr v2-cart-discount"><span>الخصم</span><span>-${_money(saved)}</span></div>` : ''}
      ${saved > 0 ? `<div class="v2-cart-saved">💰 وفّرت <strong>${_money(saved)}</strong></div>` : ''}
      ${discounted ? `<div class="v2-cart-discount-breakdown">🏷️ ${discountCount} صنف بسعر مخفّض</div>` : ''}
      <div class="v2-cart-tr v2-cart-grand"><span>الإجمالي</span><span id="v2-cart-grand" class="v2-cart-grand-amt">${_money(t.grand)}</span></div>
    </div>
    <button class="v2-cart-checkout-cta" id="v2-cart-checkout" ${itemsOk ? '' : 'disabled'}>
      ${hasErrors ? '⚠️ يوجد خطأ' : !_hydrated.length ? 'السلة فارغة' : t.grand <= 0 ? 'المبلغ غير صالح' : 'إتمام الطلب'}
    </button>
    <div style="display:flex;gap:.5rem;margin-top:.5rem">
      <a href="#products" class="v2-btn v2-btn-b" style="background:var(--v2-bg);color:var(--v2-primary);border:1px solid var(--v2-border);text-decoration:none;border-radius:12px;flex:1">متابعة التسوق</a>
      <button class="v2-btn v2-btn-b" id="v2-cart-clear" style="background:var(--v2-bg);color:var(--v2-text2);border:1px solid var(--v2-border);border-radius:12px">تفريغ</button>
    </div>
  </div>`;

  el.querySelector('#v2-cart-checkout')?.addEventListener('click', () => {
    const grandEl = document.getElementById('v2-cart-grand');
    if (grandEl) grandEl.classList.add('v2-cart-total-bump');
    setTimeout(() => location.hash = '#checkout', 150);
  });
  el.querySelector('#v2-cart-clear')?.addEventListener('click', () => { clearCart(); _render(container); });
}

function _itemCard(item, i) {
  const p = item.product;
  const img = p?.product_image_url || '';
  const price = item.price;
  const ctx = item._pricingContext;
  const stock = item.stock;
  const remaining = stock !== null ? stock - item.qty : null;
  const stockOk = stock === null || item.qty <= stock;
  const stockLow = remaining !== null && remaining >= 0 && remaining < 5;
  const hasIssue = !price?.found || !stockOk;

  let css = 'v2-cart-item v2-cart-item-modern';
  if (hasIssue) css += ' v2-cart-item-error';
  else if (stockLow && item.qty > 1) css += ' v2-cart-item-stale';

  let stockCss = '';
  let stockLabel = '';
  if (stock === null) { /* no stock info */ }
  else if (!stockOk) { stockCss = 'v2-cart-cs-out'; stockLabel = '⚠️ الكمية تتجاوز المتاح'; }
  else if (stockLow) { stockCss = 'v2-cart-cs-low'; stockLabel = `⚠️ المتبقي ${remaining}`; }
  else { stockCss = 'v2-cart-cs-ok'; stockLabel = `✅ متوفر ${stock}`; }

  let priceLabel = price?.found ? _money(price.final_price) : '—';
  let lineLabel = price?.found ? _money(price.final_price * item.qty) : '—';
  let priceNote = '';

  if (ctx?.hasDiscount) {
    priceNote = `<div class="v2-cart-cs v2-cart-cs-warn">🏷️ خصم ${ctx.discountPercent}% (${ctx.tierLabel || ''})</div>`;
  } else if (ctx?.tierLabel) {
    priceNote = `<div class="v2-cart-cs v2-cart-cs-ok">${ctx.tierLabel}</div>`;
  }

  return `<div class="${css}">
    <div class="v2-cart-ci">${img ? `<img src="${_e(img)}" alt="">` : '📦'}</div>
    <div class="v2-cart-cb">
      <div class="v2-cart-cn">${_e(p?.product_name || '')}</div>
      <div class="v2-cart-cu">${_e(item.unitName || item.unitCode || 'وحدة')}${ctx?.reason ? ` · ${_e(ctx.reason)}` : ''}</div>
      <div class="v2-cart-cq">
        <button class="v2-cart-qb v2-cart-qty-anim" data-action="qty" data-pid="${item.pid}" data-puid="${item.puid}" data-delta="-1">−</button>
        <span class="v2-cart-qv">${item.qty}</span>
        <button class="v2-cart-qb v2-cart-qty-anim" data-action="qty" data-pid="${item.pid}" data-puid="${item.puid}" data-delta="1">+</button>
      </div>
      ${stockLabel ? `<div style="margin-top:.25rem"><span class="v2-cart-cs ${stockCss}">${stockLabel}</span></div>` : ''}
    </div>
    <div class="v2-cart-cr">
      <div class="v2-cart-cp">${priceLabel}</div>
      <div class="v2-cart-cline">${lineLabel}</div>
      ${priceNote}
    </div>
    <button class="v2-cart-rm v2-cart-remove-anim" data-action="remove" data-pid="${item.pid}" data-puid="${item.puid}" title="إزالة">✕</button>
  </div>`;
}

function _error(container) {
  container.innerHTML = '<div class="v2-cart"><div class="v2-cart-error"><p>فشل تحميل السلة</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
  container.querySelector('.v2-retry')?.addEventListener('click', () => renderCartPage(container));
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
