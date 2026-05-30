import { unifiedSearch, searchGen } from '../../../services/storefront/searchApi.js';
import { logError } from '../../../utils/logger.js';
import { productCardHtml, bindProductCards, setCardPrice, setCardUnit } from '../../../runtime/components/productCard.js';
import { getProductPricesBatch } from '../../../services/storefront/productsApi.js';
import { readConfig } from '../../../config.js';

let _gen = 0;

const ENTITY_LABELS = {
  company: 'شركة',
  product: 'منتج',
  customer: 'عميل',
  employee: 'موظف',
};

const ENTITY_ICONS = {
  company: '🏢',
  product: '📦',
  customer: '👤',
  employee: '👔',
};

export function renderSearchPage(container) {
  container.innerHTML = _shell();
  _bind(container);
}

function _shell() {
  return `<div class="v2-srch">
    <div class="v2-srch-bar">
      <input class="v2-srch-input" type="text" dir="rtl" placeholder="ابحث عن المنتجات أو الشركات أو العملاء..." autofocus>
      <button class="v2-srch-clear" style="display:none" aria-label="مسح">✕</button>
    </div>
    <div class="v2-srch-body">
      <div class="v2-srch-prompt">اكتب كلمة للبحث عن المنتجات والشركات والعملاء</div>
    </div>
  </div>`;
}

function _bind(container) {
  const input = container.querySelector('.v2-srch-input');
  const clear = container.querySelector('.v2-srch-clear');
  const body = container.querySelector('.v2-srch-body');
  let timer = null;

  function doSearch() {
    const q = input.value.trim();
    if (q.length < 2) {
      body.innerHTML = '<div class="v2-srch-prompt">اكتب كلمة للبحث عن المنتجات والشركات والعملاء</div>';
      clear.style.display = 'none';
      return;
    }
    clear.style.display = '';
    const gen = ++_gen;
    body.innerHTML = '<div class="v2-srch-loading">جاري البحث...</div>';
    unifiedSearch(q).then(results => {
      if (_gen !== gen) return;
      const { companies, products, customers, employees } = results;
      const total = companies.length + products.length + customers.length + employees.length;
      if (total === 0) {
        body.innerHTML = '<div class="v2-srch-empty"><p>لا توجد نتائج مطابقة</p><p class="v2-srch-hint">تأكد من كتابة الكلمة بشكل صحيح أو جرب كلمة أخرى</p></div>';
        return;
      }
      _renderResults(body, results);
    }).catch(err => {
      if (_gen !== gen) return;
      logError('search', err);
      body.innerHTML = `<div class="v2-srch-error"><p>فشل البحث</p><button class="v2-retry">إعادة المحاولة</button></div>`;
      body.querySelector('.v2-retry')?.addEventListener('click', doSearch);
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(doSearch, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      doSearch();
    }
  });

  clear.addEventListener('click', () => {
    input.value = '';
    input.focus();
    clear.style.display = 'none';
    body.innerHTML = '<div class="v2-srch-prompt">اكتب كلمة للبحث عن المنتجات والشركات والعملاء</div>';
  });
}

function _renderResults(container, results) {
  const { companies, products, customers, employees } = results;
  let html = '<div class="v2-srch-results">';

  if (companies?.length) {
    html += `<div class="v2-srch-group">
      <div class="v2-srch-gh">${ENTITY_ICONS.company} ${ENTITY_LABELS.company} <span class="v2-srch-gc">${companies.length}</span></div>
      <div class="v2-srch-gl">${companies.map(c => _companyCard(c)).join('')}</div>
    </div>`;
  }

  if (products?.length) {
    html += `<div class="v2-srch-group">
      <div class="v2-srch-gh">${ENTITY_ICONS.product} ${ENTITY_LABELS.product} <span class="v2-srch-gc">${products.length}</span></div>
      <div class="v2-pc-grid">${products.map(r => _productSearchCard(r)).join('')}</div>
    </div>`;
  }

  for (const type of ['customer', 'employee']) {
    const items = results[type + 's'] || [];
    if (!items.length) continue;
    html += `<div class="v2-srch-group">
      <div class="v2-srch-gh">${ENTITY_ICONS[type] || ''} ${ENTITY_LABELS[type] || type} <span class="v2-srch-gc">${items.length}</span></div>
      <div class="v2-srch-gl">${items.map(r => _resultCard(r)).join('')}</div>
    </div>`;
  }

  html += '</div>';
  container.innerHTML = html;

  // Bind product grid
  const productGrid = container.querySelector('.v2-pc-grid');
  if (productGrid) {
    const productIds = products.map(r => r.entity_id).filter(Boolean);
    if (productIds.length) _lazySearchPrices(productGrid, productIds);
    if (productIds.length) _lazySearchUnits(productGrid, productIds);
    bindProductCards(productGrid);
  }

  // Bind company cards
  container.querySelectorAll('[data-company]').forEach(el => {
    el.addEventListener('click', () => { location.hash = '#company/' + el.dataset.company; });
  });

  // Bind other entity cards
  container.querySelectorAll('[data-link]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const href = el.dataset.link;
      if (href) location.hash = href;
    });
  });
}

function _companyCard(c) {
  const img = c.company_logo_url || '';
  const initial = c.company_name ? c.company_name.charAt(0) : 'ش';
  return `<div class="v2-srch-card" data-company="${c.id}" tabindex="0" role="button">
    <div class="v2-srch-ci">${img ? `<img src="${_e(img)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : '<span style="font-size:1.25rem">🏢</span>'}</div>
    <div class="v2-srch-cb">
      <div class="v2-srch-ct">${_e(c.company_name)}</div>
      ${c.company_code ? `<div class="v2-srch-cs">${_e(c.company_code)}</div>` : ''}
    </div>
    <div class="v2-srch-arrow">‹</div>
  </div>`;
}

function _resultCard(r) {
  const type = r.entity_type;
  const id = r.entity_id;
  let link = '';
  if (type === 'product') link = `#products/${id}`;

  return `<div class="v2-srch-card" ${link ? `data-link="${link}"` : ''} tabindex="0" role="button">
    <div class="v2-srch-ci">${ENTITY_ICONS[type] || ''}</div>
    <div class="v2-srch-cb">
      <div class="v2-srch-ct">${_e(r.title)}</div>
      <div class="v2-srch-cs">${_e(r.subtitle || '')}${r.phone ? ` · ${_e(r.phone)}` : ''}</div>
    </div>
    <div class="v2-srch-sc">${Math.round(r.similarity_score * 100)}%</div>
  </div>`;
}

function _productSearchCard(r) {
  return productCardHtml({
    pid: r.entity_id,
    name: r.title || '',
    code: r.subtitle || '',
    imageUrl: r.image_url || '',
    companyName: r.company_name || '',
  });
}

async function _lazySearchPrices(grid, ids) {
  const prices = await getProductPricesBatch(ids);
  if (!prices.length) return;
  const best = {};
  for (const p of prices) {
    if (!best[p.product_id]) best[p.product_id] = p;
  }
  for (const [pid, price] of Object.entries(best)) {
    const card = grid.querySelector(`[data-pid="${pid}"]`);
    if (card) setCardPrice(card, price);
  }
}

async function _lazySearchUnits(grid, ids) {
  if (!ids.length) return;
  const idList = ids.join(',');
  try {
    const r = await fetch(`${readConfig().baseUrl}/product_units?product_id=in.(${idList})&is_active=eq.true&is_sellable=eq.true&select=id,product_id,unit_code,unit_name&order=display_order.asc`, { headers: { apikey: readConfig().apiKey, 'Content-Type': 'application/json' } });
    if (!r.ok) return;
    const units = await r.json();
    const first = {};
    for (const u of units) {
      if (!first[u.product_id]) first[u.product_id] = u;
    }
    for (const [pid, unit] of Object.entries(first)) {
      const card = grid.querySelector(`[data-pid="${pid}"]`);
      if (card) setCardUnit(card, unit.id, unit.unit_name || unit.unit_code || '');
    }
  } catch { /* units unavailable */ }
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
