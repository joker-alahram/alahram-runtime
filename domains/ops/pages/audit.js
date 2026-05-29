import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';

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

export async function renderOpsAudit(container) {
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    const logs = await _fetch('workflow_transitions?select=id,domain,origin_status,target_status,label,sort_order,is_active,created_at&order=created_at.desc&limit=50');
    container.innerHTML = `<div class="v2-ops-page">
      <h2>سجل المراجعة — انتقالات سير العمل</h2>
      ${logs.length === 0 ? '<p>لا توجد سجلات انتقال</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>المجال</th><th>من</th><th>إلى</th><th>التسمية</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>${logs.map(l => `<tr>
        <td>${_e(l.domain || '—')}</td>
        <td>${_e(l.origin_status || '—')}</td>
        <td>${_e(l.target_status || '—')}</td>
        <td>${_e(l.label || '—')}</td>
        <td>${l.is_active ? '<span class="v2-badge v2-badge-ok">نشط</span>' : '<span class="v2-badge v2-badge-no">غير نشط</span>'}</td>
        <td>${_d(l.created_at)}</td>
      </tr>`).join('')}</tbody></table></div>`}
    </div>`;
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>سجل المراجعة غير متوفر — الجدول غير موجود في قاعدة البيانات</p></div></div>';
  }
}

function _opLabel(op) {
  const m = { INSERT: 'إضافة', UPDATE: 'تحديث', DELETE: 'حذف', TRUNCATE: 'حذف الكل' };
  return m[op] || op;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
function _t(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
