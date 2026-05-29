import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

export async function renderPortalVisits(container) {
  const ses = getSession();
  if (ses?.status !== 'authenticated') { location.hash = '#login'; return; }
  container.innerHTML = '<div class="v2-loading">جاري تحميل الزيارات...</div>';
  try {
    const visits = await _fetch(ses.actor.id);
    if (!visits.length) {
      container.innerHTML = '<div class="v2-empty"><p>لا توجد زيارات</p></div>';
      return;
    }
    container.innerHTML = '<div class="v2-pvis-list">' + visits.map(v => _card(v)).join('') + '</div>';
  } catch {
    container.innerHTML = '<div class="v2-error"><p>فشل تحميل الزيارات</p><button class="v2-retry" id="v2-pvis-retry">إعادة المحاولة</button></div>';
    container.querySelector('#v2-pvis-retry')?.addEventListener('click', () => renderPortalVisits(container));
  }
}

async function _fetch(cid) {
  const r = await fetch(readConfig().baseUrl + '/visits?select=id,visit_status,check_in_time,check_out_time,note,customer_id,created_at,employee_id&customer_id=eq.' + cid + '&order=created_at.desc&limit=50', { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

function _card(v) {
  const visitDate = v.created_at ? v.created_at.slice(0, 10) : '';
  const statusClass = _visitStatusClass(v.visit_status);
  return '<div class="v2-pvis-card">'
    + '<div class="v2-pvis-card-h">'
    + '<span class="v2-pvis-card-date">' + _e(visitDate) + '</span>'
    + '<span class="v2-pvis-card-st v2-st-' + statusClass + '">' + _visitStatusText(v.visit_status) + '</span>'
    + '</div>'
    + '<div class="v2-pvis-card-b">'
    + (v.employee_id ? '<span class="v2-pvis-card-emp">معرف الموظف: ' + _e(v.employee_id.slice(0, 8)) + '</span>' : '')
    + (v.check_in_time ? '<span class="v2-pvis-card-time">البداية: ' + _e(v.check_in_time.slice(11, 16)) + '</span>' : '')
    + (v.check_out_time ? '<span class="v2-pvis-card-time">النهاية: ' + _e(v.check_out_time.slice(11, 16)) + '</span>' : '')
    + '</div>'
    + (v.note ? '<div class="v2-pvis-card-notes">' + _e(v.note) + '</div>' : '')
    + '</div>';
}

function _visitStatusText(s) {
  const map = { scheduled: 'مجدول', checked_in: 'تم الدخول', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي', missed: 'فات' };
  return map[String(s || '').trim().toLowerCase()] || s || 'غير معروف';
}

function _visitStatusClass(s) {
  const map = { scheduled: 'scheduled', checked_in: 'checked-in', in_progress: 'in-progress', completed: 'completed', cancelled: 'cancelled', missed: 'missed' };
  return map[String(s || '').trim().toLowerCase()] || 'unknown';
}

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
