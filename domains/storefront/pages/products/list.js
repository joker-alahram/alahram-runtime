import { getProductList, getProductPricesBatch, getCategories } from '../../../../services/storefront/productsApi.js';
import { logError } from '../../../../utils/logger.js';
import { consumeCustomerJustSelected } from '../../../../services/storefront/cartApi.js';
import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';
import { productCardHtml, bindProductCards, setCardPrice, setCardUnit } from '../../../../runtime/components/productCard.js';

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

  bindProductCards(grid);
}

async function _lazyPrices(grid, ids) {
  const prices = await getProductPricesBatch(ids);
  if (!prices.length) return;
  const byProduct = {};
  for (const p of prices) {
    if (!byProduct[p.product_id]) byProduct[p.product_id] = { min: Infinity, max: 0, last: null };
    if (p.final_price < byProduct[p.product_id].min) byProduct[p.product_id].min = p.final_price;
    if (p.final_price > byProduct[p.product_id].max) byProduct[p.product_id].max = p.final_price;
    byProduct[p.product_id].last = p;
  }
  for (const [pid, data] of Object.entries(byProduct)) {
    const card = grid.querySelector(`[data-pid="${pid}"]`);
    if (!card) continue;
    setCardPrice(card, data.last);
  }
}

async function _lazyUnits(grid, ids) {
  if (!ids.length) return;
  const idList = ids.join(',');
  const s = getSession();
  const headers = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  try {
    const r = await fetch(`${readConfig().baseUrl}/product_units?product_id=in.(${idList})&is_active=eq.true&is_sellable=eq.true&select=id,product_id,unit_code,unit_name&order=display_order.asc`, { headers });
    if (!r.ok) return;
    const units = await r.json();
    const firstByProduct = {};
    for (const u of units) {
      if (!firstByProduct[u.product_id]) firstByProduct[u.product_id] = u;
    }
    for (const [pid, unit] of Object.entries(firstByProduct)) {
      const card = grid.querySelector(`[data-pid="${pid}"]`);
      if (!card) continue;
      setCardUnit(card, unit.id, unit.unit_name || unit.unit_code || '');
    }
  } catch { /* units unavailable */ }
}

function _card(p) {
  return productCardHtml({
    pid: p.id,
    name: p.product_name || '',
    code: p.product_code || '',
    imageUrl: p.product_image_url || '',
    companyName: p.company_name_snapshot || '',
  });
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
