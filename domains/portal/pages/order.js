import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

export async function renderPortalOrder(container, params) {
  const orderId = params?.orderId || '';
  if (!orderId) {
    container.innerHTML = '<div class="v2-error"><p>الطلب غير موجود</p><a href="#portal/orders" class="v2-btn v2-btn-p">عودة للطلبات</a></div>';
    return;
  }
  container.innerHTML = '<div class="v2-loading">جاري تحميل تفاصيل الطلب...</div>';
  try {
    const [order, items] = await Promise.all([_fetchOrder(orderId), _fetchItems(orderId)]);
    if (!order) {
      container.innerHTML = '<div class="v2-error"><p>الطلب غير موجود</p><a href="#portal/orders" class="v2-btn v2-btn-p">عودة للطلبات</a></div>';
      return;
    }
    _render(container, order, items);
  } catch {
    container.innerHTML = '<div class="v2-error"><p>فشل تحميل تفاصيل الطلب</p><button class="v2-retry" id="v2-pord-retry">إعادة المحاولة</button></div>';
    container.querySelector('#v2-pord-retry')?.addEventListener('click', () => renderPortalOrder(container, params));
  }
}

async function _fetchOrder(id) {
  const r = await fetch(readConfig().baseUrl + '/runtime_order_visibility?select=id,order_number,customer_id,total_amount,order_status,workflow_status,created_at,note,created_by_name_snapshot,owner_name_snapshot,created_by_name&id=eq.' + id, { headers: _headers() });
  if (!r.ok) return null;
  const arr = await r.json();
  return arr.length ? arr[0] : null;
}

async function _fetchItems(orderId) {
  const r = await fetch(readConfig().baseUrl + '/order_items?select=*,product_name_snapshot,product_code_snapshot,unit_name_snapshot&order_id=eq.' + orderId, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

function _render(container, order, items) {
  const parts = [];
  parts.push('<nav class="v2-back-nav"><a href="#portal/orders" class="v2-back-link">← العودة للطلبات</a></nav>');
  parts.push('<div class="v2-pord">');
  parts.push('<div class="v2-pord-header">');
  parts.push('<h2>طلب ' + _e(order.order_number || '') + '</h2>');
  parts.push('<span class="v2-por-card-st v2-st-' + _statusClass(order.order_status) + '">' + _statusText(order.order_status) + '</span>');
  parts.push('</div>');
  parts.push('<div class="v2-pord-info">');
  if (order.created_at) parts.push('<div class="v2-pord-info-row"><span>التاريخ</span><span>' + _e(order.created_at.slice(0, 10)) + '</span></div>');
  if (order.created_by_name || order.created_by_name_snapshot) parts.push('<div class="v2-pord-info-row"><span>الموظف</span><span>' + _e(order.created_by_name || order.created_by_name_snapshot) + '</span></div>');
  if (order.note) parts.push('<div class="v2-pord-info-row"><span>ملاحظات</span><span>' + _e(order.note) + '</span></div>');
  parts.push('</div>');
  parts.push('<div class="v2-pord-items"><h3>الأصناف</h3>');
  if (!items.length) {
    parts.push('<div class="v2-empty"><p>لا توجد أصناف</p></div>');
  } else {
    parts.push('<table class="v2-pord-table"><thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>');
    let total = 0;
    for (const item of items) {
      const lineTotal = (item.final_price || 0) * (item.quantity || 0);
      total += lineTotal;
      parts.push('<tr>'
        + '<td>' + _e(item.product_name_snapshot || '') + (item.product_code_snapshot ? '<br><small>' + _e(item.product_code_snapshot) + '</small>' : '') + '</td>'
        + '<td>' + _e(item.unit_name_snapshot || '') + '</td>'
        + '<td>' + (item.quantity || 0) + '</td>'
        + '<td>' + _money(item.final_price) + '</td>'
        + '<td>' + _money(lineTotal) + '</td>'
        + '</tr>');
    }
    parts.push('</tbody><tfoot><tr class="v2-pord-total"><td colspan="4" style="text-align:left;">الإجمالي</td><td>' + _money(total) + '</td></tr></tfoot></table>');
  }
  parts.push('</div>');
  if (order.execution_maps_url) {
    parts.push('<div class="v2-pord-maps"><a href="' + _e(order.execution_maps_url) + '" target="_blank" class="v2-btn v2-btn-b">عرض الموقع</a></div>');
  }
  parts.push('</div>');
  container.innerHTML = parts.join('');
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
