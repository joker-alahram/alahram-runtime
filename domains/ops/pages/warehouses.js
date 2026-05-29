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

let _container = null;

export async function renderOpsWarehouses(container) {
  addStyles();
  _container = container;
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    const whs = await _fetch('warehouses?select=id,name,code,address,status&order=name.asc');
    _render(whs);
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل بيانات المستودعات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsWarehouses(container));
  }
}

async function _reload() {
  const whs = await _fetch('warehouses?select=id,name,code,address,status&order=name.asc');
  _render(whs);
}

function _add() {
  showModal('إضافة مستودع جديد', [
    { key: 'name', label: 'الاسم', required: true },
    { key: 'code', label: 'الكود', required: true },
    { key: 'address', label: 'العنوان' },
    { key: 'status', label: 'الحالة', type: 'select', default: 'active', options: [{ value: 'active', label: 'نشط' }, { value: 'inactive', label: 'غير نشط' }] },
  ], null, async vals => {
    await apiPost('warehouses', vals);
    await _reload();
  });
}

function _edit(w) {
  showModal('تعديل المستودع', [
    { key: 'name', label: 'الاسم', required: true },
    { key: 'code', label: 'الكود', required: true },
    { key: 'address', label: 'العنوان' },
    { key: 'status', label: 'الحالة', type: 'select', options: [{ value: 'active', label: 'نشط' }, { value: 'inactive', label: 'غير نشط' }] },
  ], w, async vals => {
    await apiPatch('warehouses', w.id, vals);
    await _reload();
  });
}

async function _del(w) {
  const ok = await confirmDelete(`حذف المستودع "${w.name}"؟`);
  if (!ok) return;
  await apiDelete('warehouses', w.id);
  await _reload();
}

function _render(whs) {
  _container.innerHTML = `<div class="v2-ops-page">
    <div class="v2-crud-bar"><button class="v2-btn v2-btn-primary v2-crud-add">+ إضافة مستودع</button></div>
    <h2>المستودعات</h2>
    ${whs.length === 0 ? '<p>لا توجد مستودعات</p>' : `<div class="v2-card-grid">${whs.map(w => `<div class="v2-card">
      <div class="v2-card-h"><h3>${_e(w.name)}</h3>${w.status === 'active' ? '<span class="v2-badge v2-badge-ok">نشط</span>' : '<span class="v2-badge v2-badge-no">غير نشط</span>'}</div>
      <div class="v2-card-b">
        <div class="v2-info-row"><span class="v2-info-lbl">الكود:</span><span>${_e(w.code || '—')}</span></div>
        <div class="v2-info-row"><span class="v2-info-lbl">العنوان:</span><span>${_e(w.address || '—')}</span></div>
        <div class="v2-crud-actions" style="margin-top:8px"><button class="v2-crud-edit" data-id="${w.id}">تعديل</button><button class="v2-crud-del" data-id="${w.id}">حذف</button></div>
      </div>
    </div>`).join('')}</div>`}
  </div>`;
  _container.querySelector('.v2-crud-add')?.addEventListener('click', () => _add());
  _container.querySelectorAll('.v2-crud-edit').forEach(b => {
    const w = whs.find(x => x.id === b.dataset.id);
    if (w) b.addEventListener('click', () => _edit(w));
  });
  _container.querySelectorAll('.v2-crud-del').forEach(b => {
    const w = whs.find(x => x.id === b.dataset.id);
    if (w) b.addEventListener('click', () => _del(w));
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
