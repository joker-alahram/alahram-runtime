import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { showModal, confirmDelete, apiPost, apiPatch, apiDelete, addStyles } from './crudHelper.js';
import { fetchAllEmployeeProjections } from '../../../services/contracts/employeeProjectionService.js';

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

let _allEmployees = [];
let _container = null;

export async function renderOpsEmployees(container) {
  addStyles();
  _container = container;
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    _allEmployees = await fetchAllEmployeeProjections();
    _render();
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل بيانات الموظفين</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsEmployees(container));
  }
}

function _add() {
  showModal('إضافة موظف جديد', [
    { key: 'employee_code', label: 'كود الموظف', required: true },
    { key: 'full_name', label: 'الاسم', required: true },
    { key: 'phone', label: 'رقم الهاتف', type: 'tel' },
    { key: 'password', label: 'كلمة المرور', type: 'password' },
    { key: 'region_name', label: 'المنطقة' },
    { key: 'is_active', label: 'نشط', type: 'checkbox', default: 'true' },
  ], null, async vals => {
    await apiPost('employees', vals);
    _allEmployees = await fetchAllEmployeeProjections();
    _render();
  });
}

function _edit(e) {
  showModal('تعديل الموظف', [
    { key: 'employee_code', label: 'كود الموظف', required: true },
    { key: 'full_name', label: 'الاسم', required: true },
    { key: 'phone', label: 'رقم الهاتف', type: 'tel' },
    { key: 'password', label: 'كلمة المرور (اترك فارغاً إن لم ترد التغيير)', type: 'password' },
    { key: 'region_name', label: 'المنطقة' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
  ], e, async vals => {
    const clean = { ...vals };
    if (!clean.password) delete clean.password;
    await apiPatch('employees', e.id, clean);
    _allEmployees = await fetchAllEmployeeProjections();
    _render();
  });
}

async function _del(e) {
  const ok = await confirmDelete(`حذف الموظف "${e.full_name}"؟`);
  if (!ok) return;
  await apiDelete('employees', e.id);
  _allEmployees = _allEmployees.filter(x => x.id !== e.id);
  _render();
}

function _render() {
  _container.innerHTML = `<div class="v2-ops-page">
    <div class="v2-crud-bar"><button class="v2-btn v2-btn-primary v2-crud-add">+ إضافة موظف</button></div>
    <h2>الموظفين</h2>
    ${_allEmployees.length === 0 ? '<p>لا يوجد موظفون</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>الكود</th><th>الاسم</th><th>رقم الهاتف</th><th>المنطقة</th><th>الحالة</th><th>تاريخ التسجيل</th><th></th></tr></thead><tbody>${_allEmployees.map(e => `<tr>
      <td>${_e(e.employee_code || '—')}</td>
      <td><a href="#ops/employees/${e.id}">${_e(e.full_name)}</a></td>
      <td>${_e(e.phone || '—')}</td>
      <td>${_e(e.region_name || '—')}</td>
      <td>${e.is_active ? '<span class="v2-badge v2-badge-ok">نشط</span>' : '<span class="v2-badge v2-badge-no">غير نشط</span>'}</td>
      <td>${_d(e.created_at)}</td>
      <td><div class="v2-crud-actions"><button class="v2-crud-edit" data-id="${e.id}">تعديل</button><button class="v2-crud-del" data-id="${e.id}">حذف</button></div></td>
    </tr>`).join('')}</tbody></table></div>`}
  </div>`;
  _container.querySelector('.v2-crud-add')?.addEventListener('click', () => _add());
  _container.querySelectorAll('.v2-crud-edit').forEach(b => {
    const e = _allEmployees.find(x => x.id === b.dataset.id);
    if (e) b.addEventListener('click', () => _edit(e));
  });
  _container.querySelectorAll('.v2-crud-del').forEach(b => {
    const e = _allEmployees.find(x => x.id === b.dataset.id);
    if (e) b.addEventListener('click', () => _del(e));
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
