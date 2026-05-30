import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

export async function renderPortalOrders(container) {
  const ses = getSession();
  if (ses?.status !== 'authenticated') { location.hash = '#login'; return; }
  container.innerHTML = '<div class="v2-loading">جاري تحميل الطلبات...</div>';
  try {
    const orders = await _fetch(ses.actor.id);
    if (!orders.length) {
      container.innerHTML = '<div class="v2-empty"><p>لا توجد طلبات</p></div>';
      return;
    }
    container.innerHTML = '<div class="v2-por-list">' + orders.map(o => _card(o)).join('') + '</div>';
  } catch {
    container.innerHTML = '<div class="v2-error"><p>فشل تحميل الطلبات</p><button class="v2-retry" id="v2-por-retry">إعادة المحاولة</button></div>';
    container.querySelector('#v2-por-retry')?.addEventListener('click', () => renderPortalOrders(container));
  }
}

async function _fetch(cid) {
  const r = await fetch(readConfig().baseUrl + '/runtime_order_visibility?customer_id=eq.' + cid + '&select=id,order_number,created_at,total_amount,order_status,note,customer_name_snapshot,customer_phone_snapshot,customer_address_snapshot,created_by_name_snapshot,created_by_name,created_by_phone_snapshot&order=created_at.desc&limit=50', { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

function _card(o) {
  const docType = _docTitle(o.order_status);
  const repName = o.created_by_name_snapshot || '';
  const repPhone = o.created_by_phone_snapshot || '';
  const custName = o.customer_name_snapshot || '';
  const custPhone = o.customer_phone_snapshot || '';
  const custAddr = o.customer_address_snapshot || '';
  return '<a href="#portal/orders/' + o.id + '" class="v2-por-card">'
    + '<div class="v2-por-card-h">'
    + '<span class="v2-por-card-num">' + docType + ' ' + _e(o.order_number || '') + '</span>'
    + '<span class="v2-por-card-st v2-st-' + _statusClass(o.order_status) + '">' + _statusText(o.order_status) + '</span>'
    + '</div>'
    + '<div class="v2-por-card-b">'
    + '<span class="v2-por-card-date">' + _e(o.created_at ? o.created_at.slice(0, 10) : '') + '</span>'
    + '<span class="v2-por-card-amount">' + _money(o.total_amount) + '</span>'
    + '</div>'
    + (custName ? '<div class="v2-por-card-notes">👤 ' + _e(custName) + (custPhone ? ' - ' + _e(custPhone) : '') + '</div>' : '')
    + (custAddr ? '<div class="v2-por-card-notes" style="color:#6b7280">📍 ' + _e(custAddr) + '</div>' : '')
    + (repName ? '<div class="v2-por-card-notes">🧑‍💼 ' + _e(repName) + (repPhone ? ' - ' + _e(repPhone) : '') + '</div>' : '')
    + (o.note ? '<div class="v2-por-card-notes">' + _e(o.note) + '</div>' : '')
    + '</a>';
}

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

function _statusText(s) {
  const map = { draft: 'مسودة', pending: 'قيد الانتظار', submitted: 'تم الإرسال', confirmed: 'تم التأكيد', processing: 'قيد التجهيز', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي', rejected: 'مرفوض', completed: 'مكتمل' };
  return map[String(s || '').trim().toLowerCase()] || s || 'غير معروف';
}

function _statusClass(s) {
  const map = { draft: 'draft', pending: 'pending', submitted: 'submitted', confirmed: 'confirmed', processing: 'processing', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled', rejected: 'rejected', completed: 'completed' };
  return map[String(s || '').trim().toLowerCase()] || 'unknown';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _docTitle(status) {
  const s = String(status || '').trim().toLowerCase();
  return ['pending', 'reviewing', 'submitted'].includes(s) ? 'طلب شراء' : 'فاتورة';
}
