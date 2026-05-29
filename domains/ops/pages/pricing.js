import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { showModal, confirmDelete, apiPost, apiPatch, apiDelete, addStyles } from './crudHelper.js';

function _h() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

async function _fetch(path) {
  const r = await fetch(`${readConfig().baseUrl}/${path}`, { headers: _h() });
  if (!r.ok) throw new Error('فشل التحميل');
  return r.json();
}

let _tiers = [];
let _prices = [];
let _container = null;

export async function renderOpsPricing(container) {
  addStyles();
  _container = container;
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    [_tiers, _prices] = await Promise.all([
      _fetch('pricing_tiers?select=id,tier_code,tier_name,priority,minimum_order_amount,minimum_monthly_target,is_active,tier_color,notes&order=priority.asc'),
      _fetch('product_prices?select=id,product_id,tier_id,base_price,is_active,starts_at,ends_at,availability_status,sales_blocked,participates_in_tier&order=base_price.asc&limit=100'),
    ]);
    _render();
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل بيانات التسعير</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsPricing(container));
  }
}

async function _reload() {
  [_tiers, _prices] = await Promise.all([
    _fetch('pricing_tiers?select=id,tier_code,tier_name,priority,minimum_order_amount,minimum_monthly_target,is_active,tier_color,notes&order=priority.asc'),
    _fetch('product_prices?select=id,product_id,tier_id,base_price,is_active,starts_at,ends_at,availability_status,sales_blocked,participates_in_tier&order=base_price.asc&limit=100'),
  ]);
  _render();
}

function _addTier() {
  showModal('إضافة شريحة تسعير', [
    { key: 'tier_code', label: 'كود الشريحة', required: true },
    { key: 'tier_name', label: 'الاسم', required: true },
    { key: 'priority', label: 'الأولوية', type: 'number' },
    { key: 'minimum_order_amount', label: 'الحد الأدنى للطلب', type: 'number' },
    { key: 'minimum_monthly_target', label: 'الهدف الشهري', type: 'number' },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
    { key: 'is_active', label: 'نشط', type: 'checkbox', default: 'true' },
  ], null, async vals => {
    await apiPost('pricing_tiers', vals);
    await _reload();
  });
}

function _editTier(t) {
  showModal('تعديل شريحة التسعير', [
    { key: 'tier_code', label: 'كود الشريحة', required: true },
    { key: 'tier_name', label: 'الاسم', required: true },
    { key: 'priority', label: 'الأولوية', type: 'number' },
    { key: 'minimum_order_amount', label: 'الحد الأدنى للطلب', type: 'number' },
    { key: 'minimum_monthly_target', label: 'الهدف الشهري', type: 'number' },
    { key: 'notes', label: 'ملاحظات', type: 'textarea' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
  ], t, async vals => {
    await apiPatch('pricing_tiers', t.id, vals);
    await _reload();
  });
}

async function _delTier(t) {
  const ok = await confirmDelete(`حذف الشريحة "${t.tier_name}"؟`);
  if (!ok) return;
  await apiDelete('pricing_tiers', t.id);
  await _reload();
}

function _editPrice(p) {
  showModal('تعديل سعر المنتج', [
    { key: 'base_price', label: 'السعر الأساسي', type: 'number', required: true },
    { key: 'availability_status', label: 'حالة التوفر' },
    { key: 'participates_in_tier', label: 'مشاركة في الشريحة', type: 'checkbox' },
    { key: 'sales_blocked', label: 'حظر البيع', type: 'checkbox' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
  ], p, async vals => {
    await apiPatch('product_prices', p.id, vals);
    await _reload();
  });
}

function _render() {
  _container.innerHTML = `<div class="v2-ops-page">
    <div class="v2-crud-bar"><button class="v2-btn v2-btn-primary v2-add-tier">+ إضافة شريحة</button></div>
    <h2>شرائح التسعير</h2>
    <div class="v2-card-grid">${_tiers.map(t => `<div class="v2-card">
      <div class="v2-card-h"><h3>${_e(t.tier_name)}</h3>${t.is_active ? '<span class="v2-badge v2-badge-ok">نشط</span>' : ''}</div>
      <div class="v2-card-b">
        <div class="v2-info-row"><span class="v2-info-lbl">الكود:</span><span>${_e(t.tier_code)}</span></div>
        <div class="v2-info-row"><span class="v2-info-lbl">الحد الأدنى للطلب:</span><span>${t.minimum_order_amount != null ? _money(t.minimum_order_amount) : '—'}</span></div>
        <div class="v2-info-row"><span class="v2-info-lbl">الهدف الشهري:</span><span>${t.minimum_monthly_target != null ? _money(t.minimum_monthly_target) : '—'}</span></div>
        <div class="v2-info-row"><span class="v2-info-lbl">الأولوية:</span><span>${t.priority != null ? t.priority : '—'}</span></div>
        ${t.notes ? `<div class="v2-info-row"><span class="v2-info-lbl">ملاحظات:</span><span>${_e(t.notes)}</span></div>` : ''}
        <div class="v2-crud-actions" style="margin-top:8px"><button class="v2-crud-edit" data-id="${t.id}" data-type="tier">تعديل</button><button class="v2-crud-del" data-id="${t.id}" data-type="tier">حذف</button></div>
      </div>
    </div>`).join('')}</div>

    <h2>أسعار المنتجات</h2>
    ${_prices.length === 0 ? '<p>لا توجد أسعار مسجلة</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>معرف المنتج</th><th>الشريحة</th><th>السعر الأساسي</th><th>المشاركة في الشريحة</th><th>الحالة</th><th></th></tr></thead><tbody>${_prices.map(p => `<tr>
      <td><a href="#ops/pricing/${p.product_id}">${_e(p.product_id)}</a></td>
      <td>${_e(_tierName(p.tier_id))}</td>
      <td>${_money(p.base_price)}</td>
      <td>${p.participates_in_tier ? 'نعم' : 'لا'}</td>
      <td>${p.is_active ? '<span class="v2-badge v2-badge-ok">نشط</span>' : '<span class="v2-badge v2-badge-no">غير نشط</span>'}</td>
      <td><div class="v2-crud-actions"><button class="v2-crud-edit" data-id="${p.id}" data-type="price">تعديل السعر</button></div></td>
    </tr>`).join('')}</tbody></table></div>`}
  </div>`;
  _container.querySelector('.v2-add-tier')?.addEventListener('click', () => _addTier());
  _container.querySelectorAll('.v2-crud-edit').forEach(b => {
    if (b.dataset.type === 'tier') {
      const t = _tiers.find(x => x.id === b.dataset.id);
      if (t) b.addEventListener('click', () => _editTier(t));
    } else if (b.dataset.type === 'price') {
      const p = _prices.find(x => x.id === b.dataset.id);
      if (p) b.addEventListener('click', () => _editPrice(p));
    }
  });
  _container.querySelectorAll('.v2-crud-del').forEach(b => {
    const t = _tiers.find(x => x.id === b.dataset.id);
    if (t) b.addEventListener('click', () => _delTier(t));
  });
}

function _tierName(tierId) {
  const t = _tiers.find(x => x.id === tierId);
  return t ? t.tier_name : tierId;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
