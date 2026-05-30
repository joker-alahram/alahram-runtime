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
  try { await _render(container); } catch (e) { _error(container); }
}

async function _render(container) {
  var raw = getCartRaw();
  if (!raw.length) {
    container.innerHTML = '<div class="v2-cart"><div class="v2-cart-empty-ill"><div class="v2-cart-empty-ill-icon">🛒</div><h3>السلة فارغة</h3><p>تصفح الشركات وأضف ما تريد</p><a href="#companies" class="v2-btn v2-btn-p" style="border-radius:12px;padding:.75rem 2rem">تصفح الشركات</a></div></div>';
    return;
  }

  var totalQty = raw.reduce(function(s, i) { return s + i.qty; }, 0);

  container.innerHTML = '<div class="v2-cart">'
    + '<div class="v2-cart-header" style="padding-top:1rem"><h1>🛒 سلة المشتريات</h1><span class="v2-cart-count">' + totalQty + ' قطعة</span></div>'
    + '<div class="v2-cart-items" id="v2-cart-items"><div class="v2-cart-loading">جاري تحديث الأسعار...</div></div>'
    + '<div class="v2-cart-foot" id="v2-cart-foot" style="display:none"></div>'
    + '</div>';

  var itemsEl = container.querySelector('#v2-cart-items');
  var footEl = container.querySelector('#v2-cart-foot');

  var t0 = performance.now();
  _hydrated = await hydrateCart();
  _pickerMs = performance.now() - t0;
  if (!_hydrated.length && raw.length) {
    _hydrated = raw.map(function(r) {
      return {
        pid: r.pid, puid: r.puid, qty: r.qty,
        product: { product_name: r.name || '', product_image_url: r.img || '', product_code: r.code || '' },
        unit: { unit_name: r.unitName || '' },
        unitName: r.unitName || '',
        code: r.code || '',
        price: null, _pricingContext: null, stock: null,
      };
    });
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

  // Group by company
  var groups = {};
  for (var gi = 0; gi < _hydrated.length; gi++) {
    var item = _hydrated[gi];
    var co = (item.product && item.product.company_name_snapshot) || 'غير مصنف';
    if (!groups[co]) groups[co] = { name: co, items: [], subtotal: 0 };
    groups[co].items.push(item);
    groups[co].subtotal += (item.price && item.price.found ? item.price.final_price * item.qty : 0);
  }

  var html = '';
  for (var coName in groups) {
    var grp = groups[coName];
    html += '<div class="v2-cart-company-group"><div class="v2-cart-company-header">'
      + '<span class="v2-cart-company-icon">🏢</span>'
      + '<span class="v2-cart-company-name">' + _e(grp.name) + '</span>'
      + '<span class="v2-cart-company-subtotal">' + _money(grp.subtotal) + '</span>'
      + '</div><div class="v2-cart-company-items">';
    for (var ii = 0; ii < grp.items.length; ii++) {
      html += _itemCard(grp.items[ii], ii);
    }
    html += '</div>'
      + '<div class="v2-cart-company-footer"><span>إجمالي ' + _e(grp.name) + '</span><span>' + _money(grp.subtotal) + '</span></div>'
      + '</div>';
  }

  // "إضافة من شركة أخرى" link
  html += '<div style="text-align:center;padding:.75rem 1rem 1.5rem">'
    + '<a href="#companies" class="v2-btn v2-btn-b" style="background:var(--v2-bg);color:var(--v2-primary);border:1px solid var(--v2-border);text-decoration:none;border-radius:12px;padding:.625rem 1.5rem;display:inline-flex;align-items:center;gap:.5rem;font-size:.875rem">➕ إضافة من شركة أخرى</a>'
    + '</div>';

  var hasErrors = _errors.length > 0;
  if (hasErrors) {
    html += '<div class="v2-cart-errors">' + _errors.map(function(e) { return '<p>' + e.msg + '</p>'; }).join('') + '</div>';
  }

  el.innerHTML = html;

  var state = getCartMachineState();
  if (state === CART_STATE.STALE) {
    renderGuidanceCard(el, 'STALE_TIER', {});
  } else if (state === CART_STATE.INVALID) {
    renderGuidanceCard(el, 'INVALID_CART', {});
  }

  el.querySelectorAll('[data-action="remove"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pid = btn.dataset.pid, puid = btn.dataset.puid;
      btn.style.transform = 'scale(.8)';
      btn.style.opacity = '.5';
      setTimeout(function() {
        removeItem(pid, puid);
        _render(container);
      }, 150);
    });
  });

  el.querySelectorAll('[data-action="qty"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pid = btn.dataset.pid, puid = btn.dataset.puid;
      var delta = parseInt(btn.dataset.delta, 10);
      var current = null;
      for (var hi = 0; hi < _hydrated.length; hi++) {
        if (_hydrated[hi].pid === pid && _hydrated[hi].puid === puid) { current = _hydrated[hi]; break; }
      }
      if (!current) return;
      var newQty = Math.max(1, current.qty + delta);
      updateQuantity(pid, puid, newQty);
      _render(container);
    });
  });
}

function _renderFoot(el, totalQty) {
  var t = _totals;
  var hasErrors = _errors.length > 0;
  var state = getCartMachineState();
  var isReady = state === 'CLEAN' && !hasErrors && _hydrated.length > 0 && t.grand > 0;
  var ses = getSession();
  var itemsOk = _hydrated.length && !hasErrors && t.grand > 0;
  var discounted = _hydrated.some(function(h) { return h._pricingContext && h._pricingContext.hasDiscount; });
  var discountCount = 0;
  for (var di = 0; di < _hydrated.length; di++) {
    if (_hydrated[di]._pricingContext && _hydrated[di]._pricingContext.hasDiscount) discountCount++;
  }
  var tierLabel = [];
  for (var ti = 0; ti < _hydrated.length; ti++) {
    var lbl = _hydrated[ti]._pricingContext && _hydrated[ti]._pricingContext.tierLabel;
    if (lbl) tierLabel.push(lbl);
  }
  var uniqueTier = tierLabel.filter(function(v, i, a) { return a.indexOf(v) === i; })[0];

  var saved = t.discountTotal || 0;
  el.innerHTML = '<div class="v2-cart-summary-modern">'
    + '<div class="v2-cart-summary-top">'
    + '<span class="v2-cart-item-count">🛒 ' + totalQty + ' قطعة</span>'
    + (ses && (ses.actor && ses.actor.type === 'customer') || uniqueTier ? '<span class="v2-cart-tier-badge">🏷️ ' + (uniqueTier || 'قاعدة') + '</span>' : '')
    + '</div>'
    + '<div class="v2-cart-totals">'
    + '<div class="v2-cart-tr"><span>الإجمالي الفرعي</span><span id="v2-cart-subtotal">' + _money(t.subtotal) + '</span></div>'
    + (saved > 0 ? '<div class="v2-cart-tr v2-cart-discount"><span>الخصم</span><span>-' + _money(saved) + '</span></div>' : '')
    + (saved > 0 ? '<div class="v2-cart-saved">💰 وفّرت <strong>' + _money(saved) + '</strong></div>' : '')
    + (discounted ? '<div class="v2-cart-discount-breakdown">🏷️ ' + discountCount + ' صنف بسعر مخفّض</div>' : '')
    + '<div class="v2-cart-tr v2-cart-grand"><span>الإجمالي</span><span id="v2-cart-grand" class="v2-cart-grand-amt">' + _money(t.grand) + '</span></div>'
    + '</div>'
    + '<button class="v2-cart-checkout-cta" id="v2-cart-checkout"' + (itemsOk ? '' : ' disabled') + '>'
    + (hasErrors ? '⚠️ يوجد خطأ' : !_hydrated.length ? 'السلة فارغة' : t.grand <= 0 ? 'المبلغ غير صالح' : 'إتمام الطلب')
    + '</button>'
    + '<div style="display:flex;gap:.5rem;margin-top:.5rem">'
    + '<a href="#companies" class="v2-btn v2-btn-b" style="background:var(--v2-bg);color:var(--v2-primary);border:1px solid var(--v2-border);text-decoration:none;border-radius:12px;flex:1">متابعة التسوق</a>'
    + '<button class="v2-btn v2-btn-b" id="v2-cart-clear" style="background:var(--v2-bg);color:var(--v2-text2);border:1px solid var(--v2-border);border-radius:12px">تفريغ</button>'
    + '</div></div>';

  el.querySelector('#v2-cart-checkout')?.addEventListener('click', function() {
    var grandEl = document.getElementById('v2-cart-grand');
    if (grandEl) grandEl.classList.add('v2-cart-total-bump');
    setTimeout(function() { location.hash = '#checkout'; }, 150);
  });
  el.querySelector('#v2-cart-clear')?.addEventListener('click', function() { clearCart(); _render(container); });
}

function _itemCard(item, i) {
  var p = item.product;
  var img = p ? (p.product_image_url || '') : '';
  var price = item.price;
  var ctx = item._pricingContext;
  var stock = item.stock;
  var remaining = stock !== null ? stock - item.qty : null;
  var stockOk = stock === null || item.qty <= stock;
  var stockLow = remaining !== null && remaining >= 0 && remaining < 5;
  var hasIssue = !price || !price.found || !stockOk;

  var css = 'v2-cart-item v2-cart-item-modern';
  if (hasIssue) css += ' v2-cart-item-error';
  else if (stockLow && item.qty > 1) css += ' v2-cart-item-stale';

  var stockCss = '', stockLabel = '';
  if (stock === null) { /* no stock info */ }
  else if (!stockOk) { stockCss = 'v2-cart-cs-out'; stockLabel = '⚠️ الكمية تتجاوز المتاح'; }
  else if (stockLow) { stockCss = 'v2-cart-cs-low'; stockLabel = '⚠️ المتبقي ' + remaining; }
  else { stockCss = 'v2-cart-cs-ok'; stockLabel = '✅ متوفر ' + stock; }

  var priceLabel = price && price.found ? _money(price.final_price) : '—';
  var lineLabel = price && price.found ? _money(price.final_price * item.qty) : '—';

  var offerBadge = '';
  if (ctx && ctx.hasDiscount) {
    offerBadge = '<span class="v2-cart-offer-badge">🔥 ' + (ctx.discountPercent || '') + '%</span>';
  }

  var priceNote = '';
  if (ctx && ctx.hasDiscount) {
    priceNote = '<div class="v2-cart-cs v2-cart-cs-warn">🏷️ خصم ' + (ctx.discountPercent || '') + '% (' + (ctx.tierLabel || '') + ')</div>';
  } else if (ctx && ctx.tierLabel) {
    priceNote = '<div class="v2-cart-cs v2-cart-cs-ok">' + ctx.tierLabel + '</div>';
  }

  return '<div class="' + css + '">'
    + '<div class="v2-cart-ci">' + (img ? '<img src="' + _e(img) + '" alt="">' : '📦') + '</div>'
    + '<div class="v2-cart-cb">'
    + '<div class="v2-cart-cn">' + _e(p ? p.product_name || '' : '') + '</div>'
    + '<div class="v2-cart-cu">' + _e(item.unitName || item.unitCode || 'وحدة') + (ctx && ctx.reason ? ' · ' + _e(ctx.reason) : '') + '</div>'
    + '<div class="v2-cart-cq">'
    + '<button class="v2-cart-qb v2-cart-qty-anim" data-action="qty" data-pid="' + item.pid + '" data-puid="' + item.puid + '" data-delta="-1">−</button>'
    + '<span class="v2-cart-qv">' + item.qty + '</span>'
    + '<button class="v2-cart-qb v2-cart-qty-anim" data-action="qty" data-pid="' + item.pid + '" data-puid="' + item.puid + '" data-delta="1">+</button>'
    + '</div>'
    + (stockLabel ? '<div style="margin-top:.25rem"><span class="v2-cart-cs ' + stockCss + '">' + stockLabel + '</span></div>' : '')
    + '</div>'
    + '<div class="v2-cart-cr">'
    + '<div class="v2-cart-cp">' + priceLabel + ' ' + offerBadge + '</div>'
    + '<div class="v2-cart-cline">' + lineLabel + '</div>'
    + priceNote
    + '</div>'
    + '<button class="v2-cart-rm v2-cart-remove-anim" data-action="remove" data-pid="' + item.pid + '" data-puid="' + item.puid + '" title="إزالة">✕</button>'
    + '</div>';
}

function _error(container) {
  container.innerHTML = '<div class="v2-cart"><div class="v2-cart-error"><p>فشل تحميل السلة</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
  var btn = container.querySelector('.v2-retry');
  if (btn) btn.addEventListener('click', function() { renderCartPage(container); });
}

function _e(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
