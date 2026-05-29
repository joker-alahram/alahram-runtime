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
let _transitions = [];

export async function renderOpsWorkflow(container) {
  addStyles();
  _container = container;
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    _transitions = await _fetch('workflow_transitions?select=id,domain,origin_status,target_status,required_role,requires_approval,label,sort_order,is_active,created_at&order=sort_order.asc&limit=100');
    _render();
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>جدول سير العمل غير متوفر في قاعدة البيانات</p></div></div>';
  }
}

async function _reload() {
  _transitions = await _fetch('workflow_transitions?select=id,domain,origin_status,target_status,required_role,requires_approval,label,sort_order,is_active,created_at&order=sort_order.asc&limit=100');
  _render();
}

function _add() {
  showModal('إضافة انتقال جديد', [
    { key: 'domain', label: 'المجال', required: true },
    { key: 'origin_status', label: 'من الحالة', required: true },
    { key: 'target_status', label: 'إلى الحالة', required: true },
    { key: 'label', label: 'التسمية', required: true },
    { key: 'required_role', label: 'الدور المطلوب' },
    { key: 'sort_order', label: 'ترتيب', type: 'number' },
    { key: 'requires_approval', label: 'يتطلب موافقة', type: 'checkbox' },
    { key: 'is_active', label: 'نشط', type: 'checkbox', default: 'true' },
  ], null, async vals => {
    await apiPost('workflow_transitions', vals);
    await _reload();
  });
}

function _edit(t) {
  showModal('تعديل الانتقال', [
    { key: 'domain', label: 'المجال', required: true },
    { key: 'origin_status', label: 'من الحالة', required: true },
    { key: 'target_status', label: 'إلى الحالة', required: true },
    { key: 'label', label: 'التسمية', required: true },
    { key: 'required_role', label: 'الدور المطلوب' },
    { key: 'sort_order', label: 'ترتيب', type: 'number' },
    { key: 'requires_approval', label: 'يتطلب موافقة', type: 'checkbox' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
  ], t, async vals => {
    await apiPatch('workflow_transitions', t.id, vals);
    await _reload();
  });
}

async function _del(t) {
  const ok = await confirmDelete(`حذف الانتقال "${t.label}" (${t.origin_status} → ${t.target_status})؟`);
  if (!ok) return;
  await apiDelete('workflow_transitions', t.id);
  await _reload();
}

function _render() {
  _container.innerHTML = `<div class="v2-ops-page">
    <div class="v2-crud-bar"><button class="v2-btn v2-btn-primary v2-crud-add">+ إضافة انتقال</button></div>
    <h2>سير العمل — الانتقالات المتاحة</h2>
    ${_transitions.length === 0 ? '<p>لا توجد انتقالات</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>المجال</th><th>من</th><th>إلى</th><th>التسمية</th><th>الدور المطلوب</th><th>موافقة</th><th>الحالة</th><th></th></tr></thead><tbody>${_transitions.map(t => `<tr>
      <td>${_e(t.domain || '—')}</td>
      <td>${_e(t.origin_status || '—')}</td>
      <td>${_e(t.target_status || '—')}</td>
      <td>${_e(t.label || '—')}</td>
      <td>${_e(t.required_role || '—')}</td>
      <td>${t.requires_approval ? 'نعم' : 'لا'}</td>
      <td>${t.is_active ? '<span class="v2-badge v2-badge-ok">نشط</span>' : '<span class="v2-badge v2-badge-no">غير نشط</span>'}</td>
      <td><div class="v2-crud-actions"><button class="v2-crud-edit" data-id="${t.id}">تعديل</button><button class="v2-crud-del" data-id="${t.id}">حذف</button></div></td>
    </tr>`).join('')}</tbody></table></div>`}
  </div>`;
  _container.querySelector('.v2-crud-add')?.addEventListener('click', () => _add());
  _container.querySelectorAll('.v2-crud-edit').forEach(b => {
    const t = _transitions.find(x => x.id === b.dataset.id);
    if (t) b.addEventListener('click', () => _edit(t));
  });
  _container.querySelectorAll('.v2-crud-del').forEach(b => {
    const t = _transitions.find(x => x.id === b.dataset.id);
    if (t) b.addEventListener('click', () => _del(t));
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
