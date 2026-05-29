import { globalSearch, searchGen } from '../../../services/storefront/searchApi.js';
import { logError } from '../../../utils/logger.js';

let _gen = 0;

const ENTITY_LABELS = {
  product: 'منتج',
  customer: 'عميل',
  employee: 'موظف',
};

const ENTITY_ICONS = {
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
    globalSearch(q).then(results => {
      if (_gen !== gen) return;
      if (results.length === 0) {
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
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.entity_type]) grouped[r.entity_type] = [];
    grouped[r.entity_type].push(r);
  }

  const order = ['product', 'customer', 'employee'];
  let html = '<div class="v2-srch-results">';
  for (const type of order) {
    const items = grouped[type];
    if (!items || items.length === 0) continue;
    html += `<div class="v2-srch-group">
      <div class="v2-srch-gh">${ENTITY_ICONS[type] || ''} ${ENTITY_LABELS[type] || type} <span class="v2-srch-gc">${items.length}</span></div>
      <div class="v2-srch-gl">${items.map(r => _resultCard(r)).join('')}</div>
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('[data-link]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const href = el.dataset.link;
      if (href) location.hash = href;
    });
  });
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

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
