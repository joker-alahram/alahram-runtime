import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { getIdentity, buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

async function _fetch(session) {
  const scopeFilter = buildOrderScopeFilter();
  let url = readConfig().baseUrl + '/runtime_order_visibility?select=' + orderListSelect() + ',note,execution_maps_url&order=created_at.desc';
  if (scopeFilter) url += '&' + scopeFilter;
  const r = await fetch(url, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

export async function renderOrdersPage(container) {
  const ses = getSession();
  if (ses?.status !== 'authenticated') {
    location.hash = '#login';
    return;
  }
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل الطلبات...</div></div>';
  try {
    const orders = await _fetch(ses);
    if (!orders.length) {
      container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا توجد طلبات</p><a href="#products" class="v2-btn v2-btn-p">تصفح المنتجات</a></div></div>';
      return;
    }
    container.innerHTML = '<div class="v2-page"><div class="v2-orders"><h1 class="v2-page-title">طلباتي</h1><div class="v2-orders-list" id="v2-orders-list"></div></div></div>';
    const listEl = container.querySelector('#v2-orders-list');
    listEl.innerHTML = orders.map(o => _orderItem(o)).join('');
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>فشل تحميل الطلبات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOrdersPage(container));
  }
}

function _orderItem(o) {
  const statusLabel = _statusText(o.order_status);
  const statusClass = _statusClass(o.order_status);
  return '<a href="#invoices/' + o.id + '" class="v2-order-item">'
    + '<div class="v2-order-item-header">'
    + '<span class="v2-order-number">' + _e(o.order_number || '') + '</span>'
    + '<span class="v2-order-status v2-order-status-' + statusClass + '">' + statusLabel + '</span>'
    + '</div>'
    + '<div class="v2-order-item-body">'
    + '<div class="v2-order-date">' + _e(o.created_at ? o.created_at.slice(0, 10) : '') + '</div>'
    + ((o.created_by_name || o.created_by_name_snapshot) ? '<div class="v2-order-company">' + _e(o.created_by_name || o.created_by_name_snapshot) + '</div>' : '')
    + '<div class="v2-order-total">' + _money(o.total_amount) + '</div>'
    + '</div>'
    + (o.note ? '<div class="v2-order-notes">' + _e(o.note) + '</div>' : '')
    + '</a>';
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
