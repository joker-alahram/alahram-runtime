import { getProductList, getProductPricesBatch, getProductStock, getCategories } from '../../../../services/storefront/productsApi.js';
import { logError } from '../../../../utils/logger.js';
import { addItem, requireCustomer, consumeCustomerJustSelected } from '../../../../services/storefront/cartApi.js';
import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';

const PAGE_SIZE = 20;
let _cachedCats = null;

export async function renderProductList(container) {
  container.innerHTML = `<div class="v2-pl">${_skeleton()}${_catsCached()}</div>`;
  try {
    if (!_cachedCats) _cachedCats = await getCategories();
    await _render(container, 0, null);
  } catch { _error(container); }
}

function _skeleton() {
  return `<div class="v2-pl-loading-skeleton">${Array(6).fill('<div class="v2-skeleton-card"><div class="v2-skeleton-image"></div><div class="v2-skeleton-card-body"><div class="v2-skeleton-text"></div><div class="v2-skeleton-text-short"></div></div></div>').join('')}</div>`;
}

function _catsCached() { return _cachedCats?.length ? `<div class="v2-pl-cats"><button class="v2-pl-cat v2-pl-ca" data-cat="">الكل</button>${_cachedCats.map(c => `<button class="v2-pl-cat" data-cat="${_e(c)}">${_e(c)}</button>`).join('')}</div>` : ''; }

async function _render(container, offset, category) {
  container.innerHTML = `<div class="v2-pl">${_cats(category)}<div class="v2-pl-grid"></div><div class="v2-pl-foot"></div></div>`;
  const grid = container.querySelector('.v2-pl-grid');
  const foot = container.querySelector('.v2-pl-foot');
  grid.innerHTML = '<div class="v2-pl-loading">جاري التحميل...</div>';

  let result;
  try {
    result = await getProductList({ limit: PAGE_SIZE, offset, category: category || undefined });
  } catch {
    grid.innerHTML = '<div class="v2-pl-error"><p>فشل تحميل المنتجات</p><button class="v2-retry">إعادة المحاولة</button></div>';
    grid.querySelector('.v2-retry')?.addEventListener('click', () => _render(container, offset, category));
    return;
  }

  if (!result.data.length) {
    grid.innerHTML = '<div class="v2-pl-empty">لا توجد منتجات متاحة حالياً</div>';
    return;
  }

  const justSelected = consumeCustomerJustSelected();
  grid.innerHTML = `${justSelected ? `<div class="v2-pl-cust-banner">✅ الآن يمكنك الشراء 👤 ${_e(justSelected)}</div>` : ''}<div class="v2-pc-grid">${result.data.map(p => _card(p)).join('')}</div>`;

  const ids = result.data.map(p => p.id);
  _lazyPrices(grid, ids);
  _lazyStock(grid, ids);
  _lazyUnits(grid, ids);

  const total = result.count;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  foot.innerHTML = _pagination(totalPages, currentPage, total);

  foot.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pg = parseInt(btn.dataset.page, 10);
      if (pg !== currentPage) _render(container, (pg - 1) * PAGE_SIZE, category);
    });
  });

  foot.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      _render(container, 0, btn.dataset.cat || null);
    });
  });

  grid.querySelectorAll('[data-link]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const href = el.dataset.link;
      if (href) location.hash = href;
    });
  });

  grid.querySelectorAll('[data-atc]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!requireCustomer()) return;
      const pid = btn.dataset.atc;
      if (!btn.dataset.unit) return;
      btn.disabled = true;
      btn.textContent = '✓ تم';
      btn.classList.add('v2-pc-atc-added');
      addItem(pid, btn.dataset.unit, 1);
      _showAtcFeedback(btn);
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = '+ أضف للسلة';
        btn.classList.remove('v2-pc-atc-added');
      }, 1200);
    });
  });
}

function _showAtcFeedback(btn) {
  const el = document.createElement('div');
  el.className = 'v2-pc-atc-feedback';
  el.textContent = '✓ أضيف إلى السلة';
  const rect = btn.getBoundingClientRect();
  el.style.left = (rect.left + rect.width / 2 - 60) + 'px';
  el.style.top = (rect.top - 10) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 600);
}

async function _lazyPrices(grid, ids) {
  const prices = await getProductPricesBatch(ids);
  if (!prices.length) return;
  const byProduct = {};
  for (const p of prices) {
    if (!byProduct[p.product_id]) byProduct[p.product_id] = { min: Infinity, max: 0 };
    if (p.final_price < byProduct[p.product_id].min) byProduct[p.product_id].min = p.final_price;
    if (p.final_price > byProduct[p.product_id].max) byProduct[p.product_id].max = p.final_price;
  }
  for (const [pid, range] of Object.entries(byProduct)) {
    const el = grid.querySelector(`[data-pid="${pid}"] .v2-pc-price`);
    if (!el) continue;
    const text = range.min === range.max
      ? _money(range.min)
      : `من ${_money(range.min)}`;
    el.textContent = text;
    el.classList.add('v2-pc-price-loaded');
  }
}

async function _lazyStock(grid, ids) {
  const stock = await getProductStock(ids);
  for (const [pid, rows] of Object.entries(stock)) {
    const el = grid.querySelector(`[data-pid="${pid}"] .v2-pc-stock`);
    if (!el) continue;
    const totalAvail = rows.reduce((s, r) => s + (r.available_qty || 0), 0);
    if (totalAvail <= 0) { el.textContent = 'غير متوفر'; el.classList.add('v2-pc-stock-out'); }
    else if (totalAvail < 10) { el.textContent = 'متبقي ' + totalAvail; el.classList.add('v2-pc-stock-low'); }
    else { el.textContent = 'متوفر'; el.classList.add('v2-pc-stock-ok'); }
  }
}

async function _lazyUnits(grid, ids) {
  if (!ids.length) return;
  const idList = ids.join(',');
  const s = getSession();
  const headers = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  try {
    const r = await fetch(`${readConfig().baseUrl}/product_units?product_id=in.(${idList})&is_active=eq.true&is_sellable=eq.true&select=id,product_id,unit_code&order=display_order.asc`, { headers });
    if (!r.ok) return;
    const units = await r.json();
    const firstByProduct = {};
    for (const u of units) {
      if (!firstByProduct[u.product_id]) firstByProduct[u.product_id] = u.id;
    }
    for (const [pid, unitId] of Object.entries(firstByProduct)) {
      const btn = grid.querySelector(`[data-pid="${pid}"] [data-atc]`);
      if (btn) btn.dataset.unit = unitId;
    }
  } catch { /* units unavailable */ }
}

function _card(p) {
  const img = p.product_image_url || '';
  const initial = p.product_name ? _e(p.product_name[0]) : 'ص';
  const offerRibbon = p.offer_type ? `<span class="v2-pc-offer-ribbon">${_e(p.offer_type)}</span>` : '';
  return `<div class="v2-pc-card v2-pc-card-pro" data-pid="${p.id}" data-link="#products/${p.id}" tabindex="0" role="button">
    <div class="v2-pc-img">
      ${img ? `<img src="${_e(img)}" alt="${_e(p.product_name)}" loading="lazy">` : `<span class="v2-pc-img-ph v2-pc-initial">${initial}</span>`}
      ${offerRibbon}
    </div>
    <div class="v2-pc-card-body">
      <div class="v2-pc-name">${_e(p.product_name)}</div>
      ${p.product_code ? `<div class="v2-pc-code">${_e(p.product_code)}</div>` : ''}
      <div class="v2-pc-company">${_e(p.company_name_snapshot || '')}</div>
      <div class="v2-pc-price v2-pc-price-loading">—</div>
      <div class="v2-pc-stock">—</div>
      <div class="v2-pc-card-atc">
        <button data-atc="${p.id}" data-unit="">+ أضف للسلة</button>
      </div>
    </div>
  </div>`;
}

function _cats(active) {
  if (!_cachedCats || !_cachedCats.length) return '';
  return `<div class="v2-pl-cats"><button class="v2-pl-cat${!active ? ' v2-pl-ca' : ''}" data-cat="">الكل</button>${_cachedCats.map(c => `<button class="v2-pl-cat${c === active ? ' v2-pl-ca' : ''}" data-cat="${_e(c)}">${_e(c)}</button>`).join('')}</div>`;
}

function _pagination(totalPages, current, total) {
  if (totalPages <= 1) return `<div class="v2-pl-total">${total} منتج</div>`;
  let h = `<div class="v2-pl-pages">`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - current) <= 2) {
      h += `<button class="v2-pl-page${i === current ? ' v2-pl-pa' : ''}" data-page="${i}">${i}</button>`;
    } else if (i === current - 3 || i === current + 3) {
      h += `<span class="v2-pl-ell">...</span>`;
    }
  }
  h += `</div><div class="v2-pl-total">${total} منتج</div>`;
  return h;
}

function _error(container) {
  container.innerHTML = `<div class="v2-pl"><div class="v2-pl-error"><p>فشل تحميل المنتجات</p><button class="v2-retry">إعادة المحاولة</button></div></div>`;
  container.querySelector('.v2-retry')?.addEventListener('click', () => renderProductList(container));
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
