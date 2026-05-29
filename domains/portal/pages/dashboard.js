import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

export async function renderPortalDashboard(container) {
  const ses = getSession();
  if (ses?.status !== 'authenticated') { location.hash = '#login'; return; }
  container.innerHTML = '<div class="v2-loading">جاري تحميل البيانات...</div>';
  try {
    const cid = ses.actor.id;
    const [orders] = await Promise.all([
      _fetchOrders(cid),
    ]);
    _render(container, ses, orders);
  } catch {
    container.innerHTML = '<div class="v2-error"><p>فشل تحميل البيانات</p><button class="v2-retry" id="v2-pdash-retry">إعادة المحاولة</button></div>';
    container.querySelector('#v2-pdash-retry')?.addEventListener('click', () => renderPortalDashboard(container));
  }
}

async function _fetchOrders(cid) {
  const r = await fetch(readConfig().baseUrl + '/runtime_order_visibility?customer_id=eq.' + cid + '&select=id,order_number,created_at,total_amount,order_status&order=created_at.desc&limit=5', { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

function _render(container, ses, orders) {
  const name = ses.actor?.fullName || '';
  container.innerHTML = '<div class="v2-pdash">'
    + '<div class="v2-pdash-welcome">'
    + '<h2>مرحباً ' + _e(name) + '</h2>'
    + '<p>بوابة العملاء - متجر الأهرام للتجارة والتوزيع</p>'
    + '</div>'
    + '<div class="v2-pdash-section"><div class="v2-pdash-sh"><h3>أحدث الطلبات</h3><a href="#portal/orders" class="v2-pdash-more">عرض الكل</a></div>'
    + (orders.length ? '<div class="v2-pdash-list">' + orders.map(o => _orderCard(o)).join('') + '</div>' : '<div class="v2-pdash-empty">لا توجد طلبات حديثة</div>')
    + '</div>'
    + '<div class="v2-pdash-links">'
    + '<a href="#portal/orders" class="v2-btn v2-btn-p">طلباتي</a>'
    + '<a href="#portal/visits" class="v2-btn v2-btn-b">زياراتي</a>'
    + '<a href="#portal/profile" class="v2-btn v2-btn-b">بياناتي</a>'
    + '</div></div>';
}

function _orderCard(o) {
  return '<a href="#portal/orders/' + o.id + '" class="v2-pdash-card">'
    + '<div class="v2-pdash-card-h">'
    + '<span class="v2-pdash-card-num">' + _e(o.order_number || '') + '</span>'
    + '<span class="v2-pdash-card-st v2-st-' + _statusClass(o.order_status) + '">' + _statusText(o.order_status) + '</span>'
    + '</div>'
    + '<div class="v2-pdash-card-b">'
    + '<span class="v2-pdash-card-date">' + _e(o.created_at ? o.created_at.slice(0, 10) : '') + '</span>'
    + '<span class="v2-pdash-card-amount">' + _money(o.total_amount) + '</span>'
    + '</div></a>';
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
