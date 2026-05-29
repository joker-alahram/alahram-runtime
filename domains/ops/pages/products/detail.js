import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';
import { showModal, apiPatch, apiPost, apiDelete, confirmDelete, addStyles } from '../crudHelper.js';
import {
  getManagedProductDetail,
  getManagedBrands,
  updateProduct,
  deleteProduct,
  createProductUnit,
  updateProductUnit,
  deleteProductUnit,
  upsertProductPrice,
} from '../../../../services/ops/productsApi.js';
import { canManageProducts } from '../../../../services/contracts/products.contract.js';
import { getIdentity } from '../../../../services/storefront/governanceRuntime.js';

function _h() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

export async function renderOpsProductDetail(container, { productId }) {
  addStyles();
  if (!productId) { container.innerHTML = '<div class="v2-ops-page"><p>معرف المنتج غير موجود</p><a href="#ops/products">العودة للمنتجات</a></div>'; return; }

  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    const product = await getManagedProductDetail(productId);
    const identity = getIdentity();
    const canEdit = canManageProducts(identity);

    container.innerHTML = _render(product, canEdit);

    container.querySelector('#v2-pd-back')?.addEventListener('click', () => { location.hash = '#ops/products'; });

    if (canEdit) {
      container.querySelector('#v2-pd-edit')?.addEventListener('click', async () => { try { await _editProduct(container, product); } catch { /* silently fail */ } });
      container.querySelector('#v2-pd-del')?.addEventListener('click', () => _deleteProduct(container, product));
      container.querySelector('#v2-pd-add-unit')?.addEventListener('click', () => _addUnit(container, product));
      container.querySelectorAll('[data-edit-unit]').forEach(b => {
        const u = (product.units || []).find(x => x.unit_id === b.dataset.editUnit || x.id === b.dataset.editUnit);
        if (u) b.addEventListener('click', () => _editUnit(container, product, u));
      });
      container.querySelectorAll('[data-del-unit]').forEach(b => {
        const u = (product.units || []).find(x => x.unit_id === b.dataset.delUnit || x.id === b.dataset.delUnit);
        if (u) b.addEventListener('click', () => _deleteUnit(container, product, u));
      });
      container.querySelectorAll('[data-edit-price]').forEach(b => {
        const pr = (product.active_prices || []).find(x => x.price_id === b.dataset.editPrice || x.id === b.dataset.editPrice);
        if (pr) b.addEventListener('click', () => _editPrice(container, product, pr));
      });
      container.querySelector('#v2-pd-add-price')?.addEventListener('click', () => _addPrice(container, product));
    }
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل المنتج</p><a href="#ops/products" class="v2-retry">العودة للمنتجات</a></div></div>';
  }
}

function _render(product, canEdit) {
  const units = product.units || [];
  const prices = product.active_prices || [];
  const unitName = (u) => u.unit_name || '—';
  const unitCode = (u) => u.unit_code || '';
  const priceUnitName = (pr) => {
    const u = units.find(x => x.unit_id === pr.product_unit_id);
    return u ? u.unit_name : (pr.product_unit_id?.slice(0, 8) || '—');
  };

  return `<div class="v2-ops-page">
    <button class="v2-od-back" id="v2-pd-back">← المنتجات</button>

    <div class="v2-occp-header">
      <div class="v2-occp-avatar">${(product.product_name || '?')[0]}</div>
      <div class="v2-occp-h-body">
        <div class="v2-occp-h-top">
          <span class="v2-occp-name">${_e(product.product_name)}</span>
          <span class="v2-badge">${_e(product.product_code || '')}</span>
          <span class="v2-occ-badge ${product.is_active ? 'v2-occ-badge-on' : 'v2-occ-badge-off'}">${product.is_active ? 'نشط' : 'غير نشط'}</span>
          ${product.sales_blocked ? '<span class="v2-occ-badge v2-occ-badge-off">محظور البيع</span>' : ''}
        </div>
        <div class="v2-occp-info">
          <span>🏷️ ${_e(product.company_name || product.company_name_snapshot || '—')}</span>
          <span>📂 ${_e(product.category || '—')}</span>
          ${product.barcode ? `<span>🔲 ${_e(product.barcode)}</span>` : ''}
        </div>
      </div>
      <div class="v2-occp-actions">
        ${canEdit ? `<button class="v2-btn v2-btn-sm" id="v2-pd-edit">تعديل</button>
        <button class="v2-btn v2-btn-sm v2-btn-danger" id="v2-pd-del">حذف</button>` : ''}
      </div>
    </div>

    <div class="v2-occp-stats-row">
      <div class="v2-occp-stat"><span class="v2-occp-stat-val">${units.length}</span><span class="v2-occp-stat-lbl">وحدات</span></div>
      <div class="v2-occp-stat"><span class="v2-occp-stat-val">${prices.length}</span><span class="v2-occp-stat-lbl">أسعار نشطة</span></div>
      <div class="v2-occp-stat"><span class="v2-occp-stat-val">${product.track_inventory ? 'نعم' : 'لا'}</span><span class="v2-occp-stat-lbl">تتبع المخزون</span></div>
    </div>

    <div class="v2-occp-section">
      <div class="v2-occp-section-title">
        <span>الوحدات</span>
        ${canEdit ? '<button class="v2-btn v2-btn-sm v2-btn-primary" id="v2-pd-add-unit" style="margin-right:8px">+ إضافة وحدة</button>' : ''}
      </div>
      ${units.length === 0 ? '<p>لا توجد وحدات</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>الوحدة</th><th>الكود</th><th>أساسية</th><th>قابلة للبيع</th><th>نشط</th><th>كمية الأساس</th><th>الترتيب</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>${units.map(u => `<tr>
        <td>${_e(unitName(u))}</td>
        <td>${_e(unitCode(u))}</td>
        <td>${u.is_base_unit ? '✅' : '—'}</td>
        <td>${u.is_sellable ? '✅' : '—'}</td>
        <td>${u.is_active ? '✅' : '—'}</td>
        <td class="v2-inv-num">${u.base_unit_quantity != null ? _n(u.base_unit_quantity) : '—'}</td>
        <td class="v2-inv-num">${u.display_order != null ? _n(u.display_order) : '—'}</td>
        ${canEdit ? `<td class="v2-crud-actions"><button class="v2-crud-edit" data-edit-unit="${u.unit_id || u.id}">تعديل</button><button class="v2-crud-del" data-del-unit="${u.unit_id || u.id}">حذف</button></td>` : ''}
      </tr>`).join('')}</tbody></table></div>`}
    </div>

    <div class="v2-occp-section">
      <div class="v2-occp-section-title">
        <span>الأسعار النشطة</span>
        ${canEdit ? '<button class="v2-btn v2-btn-sm v2-btn-primary" id="v2-pd-add-price" style="margin-right:8px">+ إضافة سعر</button>' : ''}
      </div>
      ${prices.length === 0 ? '<p>لا توجد أسعار نشطة</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>الوحدة</th><th>السعر الأساسي</th><th>المصدر</th><th>الحالة</th><th>الأولوية</th><th>الحد الأدنى</th><th>الحد الأقصى</th>${canEdit ? '<th></th>' : ''}</tr></thead><tbody>${prices.map(pr => `<tr>
        <td>${_e(priceUnitName(pr))}</td>
        <td class="v2-inv-num">${_money(pr.base_price)}</td>
        <td>${_e(pr.pricing_source_type || '—')}</td>
        <td>${_e(pr.availability_status || 'متاح')}</td>
        <td class="v2-inv-num">${pr.priority != null ? _n(pr.priority) : '—'}</td>
        <td class="v2-inv-num">${pr.minimum_quantity != null ? _n(pr.minimum_quantity) : '—'}</td>
        <td class="v2-inv-num">${pr.maximum_quantity != null ? _n(pr.maximum_quantity) : '—'}</td>
        ${canEdit ? `<td class="v2-crud-actions"><button class="v2-crud-edit" data-edit-price="${pr.price_id || pr.id}">تعديل</button></td>` : ''}
      </tr>`).join('')}</tbody></table></div>`}
    </div>
  </div>`;
}

async function _editProduct(container, product) {
  const brands = await getManagedBrands();
  const defaultVals = {
    ...product,
    brand_id: product.company_id || '',
  };
  showModal('تعديل المنتج', [
    { key: 'product_name', label: 'اسم المنتج', type: 'text', required: true },
    { key: 'product_code', label: 'كود المنتج' },
    { key: 'category', label: 'التصنيف' },
    { key: 'brand_id', label: 'العلامة التجارية', type: 'select',
      options: [{ value: '', label: '— اختر —' }, ...brands.map(b => ({ value: b.id, label: b.name }))] },
    { key: 'product_image_url', label: 'رابط الصورة' },
    { key: 'barcode', label: 'الباركود' },
    { key: 'track_inventory', label: 'تتبع المخزون', type: 'checkbox' },
    { key: 'sales_blocked', label: 'حظر البيع', type: 'checkbox' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
  ], defaultVals, async vals => {
    await updateProduct(product.product_id, vals);
    renderOpsProductDetail(container, { productId: product.product_id });
  });
}

async function _deleteProduct(container, product) {
  const ok = await confirmDelete(`هل أنت متأكد من حذف "${product.product_name}"؟`);
  if (!ok) return;
  await deleteProduct(product.product_id);
  location.hash = '#ops/products';
}

function _addUnit(container, product) {
  showModal('إضافة وحدة', [
    { key: 'unit_name', label: 'اسم الوحدة', required: true },
    { key: 'unit_code', label: 'كود الوحدة' },
    { key: 'is_base_unit', label: 'وحدة أساسية', type: 'checkbox' },
    { key: 'is_sellable', label: 'قابلة للبيع', type: 'checkbox', default: 'true' },
    { key: 'is_active', label: 'نشط', type: 'checkbox', default: 'true' },
    { key: 'base_unit_quantity', label: 'كمية الوحدة الأساسية', type: 'number' },
    { key: 'display_order', label: 'ترتيب العرض', type: 'number' },
  ], null, async vals => {
    await createProductUnit(product.product_id, vals);
    renderOpsProductDetail(container, { productId: product.product_id });
  });
}

function _editUnit(container, product, unit) {
  showModal('تعديل الوحدة', [
    { key: 'unit_name', label: 'اسم الوحدة', type: 'text', required: true },
    { key: 'unit_code', label: 'كود الوحدة' },
    { key: 'is_base_unit', label: 'وحدة أساسية', type: 'checkbox' },
    { key: 'is_sellable', label: 'قابلة للبيع', type: 'checkbox' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
    { key: 'base_unit_quantity', label: 'كمية الوحدة الأساسية', type: 'number' },
    { key: 'display_order', label: 'ترتيب العرض', type: 'number' },
  ], unit, async vals => {
    await updateProductUnit(unit.unit_id || unit.id, vals);
    renderOpsProductDetail(container, { productId: product.product_id });
  });
}

async function _deleteUnit(container, product, unit) {
  const ok = await confirmDelete(`حذف الوحدة "${unit.unit_name}"؟`);
  if (!ok) return;
  await deleteProductUnit(unit.unit_id || unit.id);
  renderOpsProductDetail(container, { productId: product.product_id });
}

function _addPrice(container, product) {
  const units = product.units || [];
  showModal('إضافة سعر', [
    {
      key: 'product_unit_id', label: 'الوحدة', type: 'select',
      options: units.map(u => ({ value: u.unit_id || u.id, label: u.unit_name || u.unit_code || u.id })),
      required: true,
    },
    { key: 'base_price', label: 'السعر الأساسي', type: 'number', required: true },
    { key: 'availability_status', label: 'حالة التوفر', default: 'available' },
    { key: 'pricing_source_type', label: 'مصدر التسعير', default: 'manual' },
    { key: 'priority', label: 'الأولوية', type: 'number', default: '0' },
    { key: 'minimum_quantity', label: 'الحد الأدنى للكمية', type: 'number', default: '0' },
    { key: 'maximum_quantity', label: 'الحد الأقصى للكمية', type: 'number' },
    { key: 'is_active', label: 'نشط', type: 'checkbox', default: 'true' },
  ], { product_id: product.product_id }, async vals => {
    await upsertProductPrice({ ...vals, product_id: product.product_id });
    renderOpsProductDetail(container, { productId: product.product_id });
  });
}

function _editPrice(container, product, price) {
  const units = product.units || [];
  showModal('تعديل السعر', [
    {
      key: 'product_unit_id', label: 'الوحدة', type: 'select',
      options: units.map(u => ({ value: u.unit_id || u.id, label: u.unit_name || u.unit_code || u.id })),
    },
    { key: 'base_price', label: 'السعر الأساسي', type: 'number', required: true },
    { key: 'availability_status', label: 'حالة التوفر' },
    { key: 'pricing_source_type', label: 'مصدر التسعير' },
    { key: 'priority', label: 'الأولوية', type: 'number' },
    { key: 'minimum_quantity', label: 'الحد الأدنى للكمية', type: 'number' },
    { key: 'maximum_quantity', label: 'الحد الأقصى للكمية', type: 'number' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
  ], price, async vals => {
    await upsertProductPrice({ ...vals, price_id: price.price_id || price.id, product_id: product.product_id });
    renderOpsProductDetail(container, { productId: product.product_id });
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _n(v) { if (v == null) return '0'; return Number(v).toLocaleString('en-US'); }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
