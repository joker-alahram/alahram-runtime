import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';
import { showModal, apiPost, apiPatch, apiDelete, confirmDelete, addStyles } from '../crudHelper.js';
import {
  getManagedProductList,
  getManagedCategories,
  getManagedBrands,
  searchManagedProducts,
  createProduct,
} from '../../../../services/ops/productsApi.js';
import { canManageProducts } from '../../../../services/contracts/products.contract.js';
import { getIdentity } from '../../../../services/storefront/governanceRuntime.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

let _search = '', _category = '', _isActive = 'all', _page = 0;
const _LIMIT = 30;

export async function renderOpsProductsList(container) {
  addStyles();
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try { await _render(container); } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل التحميل</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsProductsList(container));
  }
}

async function _render(container) {
  const [categories, result] = await Promise.all([
    getManagedCategories(),
    getManagedProductList({ search: _search, category: _category, isActive: _isActive === 'all' ? undefined : _isActive === 'true', limit: _LIMIT, offset: _page * _LIMIT }),
  ]);
  const { data: products, count } = result;
  const identity = getIdentity();
  const canCreate = canManageProducts(identity);

  container.innerHTML = `<div class="v2-ops-page">
    <div class="v2-occ-bar">
      <h2 class="v2-occ-title">المنتجات</h2>
      <span class="v2-occ-count">${_n(count)}</span>
      ${canCreate ? '<button class="v2-btn v2-btn-primary" id="v2-prod-add">+ إضافة منتج</button>' : ''}
    </div>

    <div class="v2-rpr-filter">
      <span class="v2-rpr-filter-lbl">بحث</span>
      <input class="v2-rpr-filter-inp" id="v2-prod-search" value="${_e(_search)}" placeholder="اسم المنتج أو الكود" style="flex:1;min-width:140px"/>
      <span class="v2-rpr-filter-lbl">التصنيف</span>
      <select class="v2-rpr-filter-inp" id="v2-prod-cat">
        <option value="">الكل</option>
        ${categories.map(c => `<option value="${_e(c)}"${c === _category ? ' selected' : ''}>${_e(c)}</option>`).join('')}
      </select>
      <span class="v2-rpr-filter-lbl">الحالة</span>
      <select class="v2-rpr-filter-inp" id="v2-prod-active">
        <option value="all"${_isActive === 'all' ? ' selected' : ''}>الكل</option>
        <option value="true"${_isActive === 'true' ? ' selected' : ''}>نشط</option>
        <option value="false"${_isActive === 'false' ? ' selected' : ''}>غير نشط</option>
      </select>
    </div>

    ${products.length === 0
      ? '<div class="v2-occ-empty">لا توجد منتجات</div>'
      : `<div class="v2-occ-grid">${products.map(p => `
        <a class="v2-occ-card" href="#ops/products/${p.product_id}">
          <div class="v2-occ-card-top">
            <div class="v2-occ-avatar">${(p.product_name || '?')[0]}</div>
            <div class="v2-occ-card-h">
              <div class="v2-occ-card-name">${_e(p.product_name)}</div>
              <div class="v2-occ-card-meta">
                <span class="v2-occ-badge ${p.is_active ? 'v2-occ-badge-on' : 'v2-occ-badge-off'}">${p.is_active ? 'نشط' : 'غير نشط'}</span>
                ${p.sales_blocked ? '<span class="v2-occ-badge v2-occ-badge-off">محظور</span>' : ''}
                ${p.product_code ? `<span class="v2-badge">${_e(p.product_code)}</span>` : ''}
              </div>
            </div>
            <div class="v2-occ-card-amount">${_e(p.company_name || '')}</div>
          </div>
          <div class="v2-occ-card-footer">
            ${p.category ? `<span>${_e(p.category)}</span>` : ''}
          </div>
        </a>`
      ).join('')}</div>`
    }

    ${_pagination(_page, Math.ceil(count / _LIMIT))}
  </div>`;

  // Search with debounce
  const searchInp = container.querySelector('#v2-prod-search');
  if (searchInp) {
    let timer;
    searchInp.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { _search = searchInp.value; _page = 0; _render(container); }, 300);
    });
  }

  container.querySelector('#v2-prod-cat')?.addEventListener('change', e => { _category = e.target.value; _page = 0; _render(container); });
  container.querySelector('#v2-prod-active')?.addEventListener('change', e => { _isActive = e.target.value; _page = 0; _render(container); });
  container.querySelector('#v2-prod-add')?.addEventListener('click', async () => { try { await _showAddProduct(container); } catch { /* silently fail */ } });
  container.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { _page = Number(btn.dataset.page); _render(container); });
  });
}

async function _showAddProduct(container) {
  const brands = await getManagedBrands();
  showModal('إضافة منتج جديد', [
    { key: 'product_name', label: 'اسم المنتج', required: true },
    { key: 'product_code', label: 'كود المنتج' },
    { key: 'category', label: 'التصنيف' },
    { key: 'brand_id', label: 'العلامة التجارية', type: 'select',
      options: [{ value: '', label: '— اختر —' }, ...brands.map(b => ({ value: b.id, label: b.name }))] },
    { key: 'product_image_url', label: 'رابط الصورة' },
    { key: 'barcode', label: 'الباركود' },
    { key: 'is_active', label: 'نشط', type: 'checkbox', default: 'true' },
  ], null, async vals => {
    await createProduct(vals);
    _render(container);
  });
}

function _pagination(current, total) {
  if (total <= 1) return '';
  const pages = [];
  for (let i = 0; i < total && i < 10; i++) {
    pages.push(`<button class="v2-btn v2-btn-sm ${i === current ? 'v2-btn-primary' : 'v2-btn-ghost'}" data-page="${i}">${i + 1}</button>`);
  }
  return `<div class="v2-crud-bar" style="justify-content:center;margin-top:12px">${pages.join('')}</div>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _n(v) { if (v == null) return '0'; return Number(v).toLocaleString('en-US'); }
