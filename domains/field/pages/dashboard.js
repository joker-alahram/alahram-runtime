import { readConfig } from '../../../config.js';
import { buildVisitScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { visitSelectFields, normalizeVisits } from '../../../services/contracts/visits.contract.js';

export async function renderFieldDashboard(container) {
  container.innerHTML = '<div class="v2-fv"><div class="v2-fv-loading">جاري التحميل...</div></div>';

  let visits;
  try {
    const today = new Date().toISOString().split('T')[0];
    const API = readConfig().baseUrl;
    const headers = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
    const visitScope = buildVisitScopeFilter();
    const r = await fetch(`${API}/runtime_visits_with_maps?select=${visitSelectFields()}&created_at=gte.${today}&order=check_in_time.desc${visitScope ? '&' + visitScope : ''}`, { headers });
    visits = normalizeVisits(await r.json());
  } catch {
    container.innerHTML = '<div class="v2-fv"><div class="v2-fv-error"><p>فشل تحميل البيانات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderFieldDashboard(container));
    return;
  }

  const pending = visits.filter(v => v.visit_status === 'open' || v.visit_status === 'scheduled').length;
  const completed = visits.filter(v => v.visit_status === 'completed').length;
  const total = visits.length;

  const activeVisit = visits.find(v => v.visit_status === 'open');
  const activeBtn = activeVisit ? `<a href="#field/visits/${activeVisit.id}" class="v2-dash-btn" style="border-color:#3b82f6;background:#eff6ff;font-weight:600">متابعة الزيارة الحالية ←</a>` : '';

  container.innerHTML = `<div class="v2-fv">
    <div class="v2-dash-stats">
      <div class="v2-dash-stat"><span class="v2-dash-num">${total}</span><span class="v2-dash-lbl">إجمالي الزيارات</span></div>
      <div class="v2-dash-stat"><span class="v2-dash-num">${pending}</span><span class="v2-dash-lbl">قيد الانتظار</span></div>
      <div class="v2-dash-stat"><span class="v2-dash-num">${completed}</span><span class="v2-dash-lbl">مكتملة</span></div>
    </div>
    <div class="v2-dash-actions">
      <a href="#field/visits" class="v2-dash-btn">بدء زيارة جديدة</a>
      <a href="#field/customers" class="v2-dash-btn">عرض العملاء</a>
      <a href="#field/visits" class="v2-dash-btn">عرض الزيارات</a>
      ${activeBtn}
    </div>
    ${visits.length > 0 ? `<div class="v2-fv-sep">زيارات اليوم</div>${visits.map(v => _card(v)).join('')}` : '<div class="v2-fv-empty">لا توجد زيارات اليوم</div>'}
  </div>`;
}

function _card(v) {
  const s = v.visit_status || 'scheduled';
  const icon = s === 'completed' ? '✅' : s === 'open' ? '🟢' : s === 'cancelled' ? '❌' : '📋';
  const lbl = s === 'completed' ? 'مكتملة' : s === 'open' ? 'قيد التنفيذ' : s === 'cancelled' ? 'ملغية' : 'مجدولة';
  return `<div class="v2-fv-card" data-visit="${v.id}">
    <div class="v2-fv-ch"><span>${_e(v.visit_number ? 'زيارة #' + v.visit_number : 'زيارة')}</span><span>${icon} ${lbl}</span></div>
    ${v.check_in_time ? `<div class="v2-fv-time">${_t(v.check_in_time)}${v.check_out_time ? ` - ${_t(v.check_out_time)}` : ''}</div>` : ''}
    ${v.note ? `<div class="v2-fv-oc">${_e(v.note)}</div>` : ''}
  </div>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _t(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
