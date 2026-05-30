import { getCartRaw, hydrateCart, computeTotals } from '../../services/storefront/cartApi.js';

let _el = null;
let _cleanup = null;
let _recalcTimer = null;

const CACHE_KEY = 'v2_cart_summary';

function _cache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}

function _saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() })); } catch {}
}

export function getCachedTotal() {
  const c = _cache();
  return c.total != null ? c.total : null;
}

export function renderFloatingBar(container) {
  destroyFloatingBar();

  const el = document.createElement('div');
  el.id = 'v2-floating-bar';
  el.className = 'v2-floating-bar';
  el.style.display = 'none';
  container.appendChild(el);
  _el = el;

  _recalc();

  const handler = () => {
    clearTimeout(_recalcTimer);
    _recalcTimer = setTimeout(_recalc, 100);
  };
  window.addEventListener('cart-changed', handler);
  _cleanup = () => {
    window.removeEventListener('cart-changed', handler);
    clearTimeout(_recalcTimer);
  };
}

export function destroyFloatingBar() {
  if (_cleanup) { _cleanup(); _cleanup = null; }
  if (_el) { _el.remove(); _el = null; }
}

async function _recalc() {
  const el = _el;
  if (!el) return;

  const raw = getCartRaw();
  if (!raw.length) {
    el.style.display = 'none';
    return;
  }

  el.style.display = '';

  const cached = _cache();
  const now = Date.now();
  const cacheAge = cached.ts ? (now - cached.ts) : Infinity;
  const cacheFresh = cacheAge < 10000;

  let total = cached.total;
  let tierCode = cached.tierCode || null;
  let tierName = cached.tierName || null;
  let tierMin = cached.tierMin || 0;

  if (!cacheFresh) {
    _showLoading(el, total);
    const hydrated = await hydrateCart();
    if (!el.isConnected) return;
    if (hydrated.length) {
      const totals = computeTotals(hydrated);
      total = totals.grand;
      const ctx = hydrated[0]._pricingContext;
      tierCode = ctx?.tierLabel || null;
      tierName = ctx?.tierLabel || null;
      _saveCache({ total, tierCode, tierName, tierMin });
    }
  }

  if (!el.isConnected) return;
  _render(el, { total, tierCode, tierName, tierMin, raw });
}

function _showLoading(el, prevTotal) {
  if (prevTotal != null) {
    el.innerHTML = `<div class="v2-fb-inner">
      <div class="v2-fb-main">
        <span class="v2-fb-label">🛒 إجمالي الطلب الحالي</span>
        <span class="v2-fb-total">${_money(prevTotal)}</span>
        <span class="v2-fb-spinner"></span>
      </div>
      <div class="v2-fb-cta">عرض الطلب</div>
    </div>`;
    el.classList.add('v2-fb-has-data');
  } else {
    el.innerHTML = `<div class="v2-fb-inner">
      <div class="v2-fb-main">
        <span class="v2-fb-label">🛒 جاري حساب الطلب...</span>
        <span class="v2-fb-spinner"></span>
      </div>
    </div>`;
    el.classList.remove('v2-fb-has-data');
  }
}

function _render(el, { total, tierCode, tierName, tierMin, raw }) {
  let tierHtml = '';
  let ctaLabel = 'عرض الطلب';

  if (total == null || total === 0) {
    el.style.display = 'none';
    return;
  }

  if (tierCode && tierName && tierMin > 0) {
    const achieved = total >= tierMin;
    const remaining = Math.max(0, tierMin - total);
    if (achieved) {
      tierHtml = `<div class="v2-fb-tier v2-fb-tier-ok">🏅 ${tierName} — ✓ تم تحقيق الشريحة</div>`;
    } else {
      tierHtml = `<div class="v2-fb-tier v2-fb-tier-pending">🏅 ${tierName} — متبقي ${_money(remaining)} لتحقيق الشريحة</div>`;
    }
  }

  el.innerHTML = `<div class="v2-fb-inner" role="button" tabindex="0">
    <div class="v2-fb-body">
      <div class="v2-fb-main">
        <span class="v2-fb-label">🛒 إجمالي الطلب الحالي</span>
        <span class="v2-fb-total">${_money(total)}</span>
      </div>
      ${tierHtml ? `<div class="v2-fb-tier-row">${tierHtml}</div>` : ''}
    </div>
    <div class="v2-fb-cta">${ctaLabel}</div>
  </div>`;

  el.classList.add('v2-fb-has-data');

  const inner = el.querySelector('.v2-fb-inner');
  inner.addEventListener('click', (e) => {
    e.stopPropagation();
    location.hash = '#cart';
  });
}

function _money(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US') + ' ج.م';
}
