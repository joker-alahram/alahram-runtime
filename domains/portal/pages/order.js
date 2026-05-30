import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { groupItemsByCompany, getProductName, getProductCode, getUnitName, getQuantity, getFinalPrice, getLineTotal, computeGroupSubtotal, computeGrandTotal } from '../../../services/storefront/groupItems.js';

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
  const r = await fetch(readConfig().baseUrl + '/runtime_order_visibility?select=id,order_number,customer_id,total_amount,order_status,workflow_status,created_at,note,customer_name_snapshot,customer_phone_snapshot,customer_address_snapshot,created_by_name_snapshot,owner_name_snapshot,created_by_name,created_by_phone_snapshot&id=eq.' + id, { headers: _headers() });
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
  parts.push('<h2>' + _docTitle(order.order_status) + ' ' + _e(order.order_number || '') + '</h2>');
  parts.push('<span class="v2-por-card-st v2-st-' + _statusClass(order.order_status) + '">' + _statusText(order.order_status) + '</span>');
  parts.push('</div>');
  parts.push('<div class="v2-pord-info">');
  if (order.created_at) parts.push('<div class="v2-pord-info-row"><span>التاريخ</span><span>' + _e(order.created_at.slice(0, 10)) + '</span></div>');
  if (order.customer_name_snapshot) {
    parts.push('<div class="v2-pord-info-row"><span>العميل</span><span>' + _e(order.customer_name_snapshot) + '</span></div>');
    if (order.customer_phone_snapshot) parts.push('<div class="v2-pord-info-row"><span>هاتف العميل</span><span dir="ltr">' + _e(order.customer_phone_snapshot) + '</span></div>');
    if (order.customer_address_snapshot) parts.push('<div class="v2-pord-info-row"><span>عنوان العميل</span><span>' + _e(order.customer_address_snapshot) + '</span></div>');
  }
  const repName = order.created_by_name_snapshot || '';
  const repPhone = order.created_by_phone_snapshot || '';
  if (repName) parts.push('<div class="v2-pord-info-row"><span>مندوب المبيعات</span><span>' + _e(repName) + (repPhone ? ' - ' + _e(repPhone) : '') + '</span></div>');
  if (order.note) parts.push('<div class="v2-pord-info-row"><span>ملاحظات</span><span>' + _e(order.note) + '</span></div>');
  parts.push('</div>');
  parts.push('<div class="v2-pord-items"><h3>الأصناف</h3>');
  if (!items.length) {
    parts.push('<div class="v2-empty"><p>لا توجد أصناف</p></div>');
  } else {
    const groups = groupItemsByCompany(items);
    parts.push('<table class="v2-pord-table"><thead><tr><th>كود الصنف</th><th>اسم الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>');
    let grandTotal = 0;
    for (const group of groups) {
      const groupSubtotal = computeGroupSubtotal(group.items);
      grandTotal += groupSubtotal;
      parts.push('<tr style="background:#eef2ff;font-weight:700;text-align:right"><td colspan="6" style="padding:6px 10px;color:#0d2b6b;border-bottom:2px solid #0052cc">' + _e(group.companyName) + ' (' + group.items.length + ' أصناف)</td></tr>');
      for (const item of group.items) {
        const code = getProductCode(item);
        const name = getProductName(item);
        const unit = getUnitName(item);
        const qty = getQuantity(item);
        const price = getFinalPrice(item);
        const lineTotal = getLineTotal(item);
        parts.push('<tr>'
          + '<td style="font-family:monospace;direction:ltr;font-size:.8125rem">' + _e(code || '—') + '</td>'
          + '<td>' + _e(name) + '</td>'
          + '<td>' + _e(unit) + '</td>'
          + '<td>' + qty + '</td>'
          + '<td>' + _money(price) + '</td>'
          + '<td>' + _money(lineTotal) + '</td>'
          + '</tr>');
      }
      if (groups.length > 1) {
        parts.push('<tr style="background:#f8f9fa;font-weight:600"><td colspan="5" style="text-align:left;border-top:1px solid #0052cc">إجمالي ' + _e(group.companyName) + '</td><td style="border-top:1px solid #0052cc">' + _money(groupSubtotal) + '</td></tr>');
      }
    }
    parts.push('</tbody><tfoot><tr class="v2-pord-total"><td colspan="5" style="text-align:left;">الإجمالي النهائي</td><td>' + _money(grandTotal) + '</td></tr></tfoot></table>');
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
function _docTitle(status) {
  const s = String(status || '').trim().toLowerCase();
  return ['pending', 'reviewing', 'submitted'].includes(s) ? 'طلب شراء' : 'فاتورة';
}
