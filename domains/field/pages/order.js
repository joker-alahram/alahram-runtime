import { readConfig } from '../../../config.js';
import { buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { orderDetailSelect } from '../../../services/contracts/orders.contract.js';

const STATUS_LABEL = { pending: 'قيد الانتظار', confirmed: 'مؤكد', processing: 'قيد التنفيذ', shipped: 'تم الشحن', delivered: 'تم التوصيل', cancelled: 'ملغي' };

export async function renderFieldOrder(container, params) {
  const orderId = params?.orderId;
  if (!orderId) {
    container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-error"><p>معرف الطلب غير موجود</p><a href="#field/orders">العودة</a></div></div>';
    return;
  }

  container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-loading">جاري التحميل...</div></div>';

  let order, items;
  try {
    const API = readConfig().baseUrl;
    const headers = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
    const scopeFilter = buildOrderScopeFilter();
    const [or_, ir] = await Promise.all([
      fetch(`${API}/runtime_order_visibility?select=${orderDetailSelect()}&id=eq.${orderId}${scopeFilter ? '&' + scopeFilter : ''}`, { headers }),
      fetch(`${API}/order_items?select=*,product_name_snapshot,product_code_snapshot,unit_name_snapshot,final_price&order_id=eq.${orderId}`, { headers }),
    ]);
    const odata = await or_.json();
    order = Array.isArray(odata) ? odata[0] : odata;
    items = await ir.json();
  } catch {
    container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-error"><p>فشل تحميل تفاصيل الطلب</p><a href="#field/orders" class="v2-retry">العودة</a></div></div>';
    return;
  }

  if (!order) {
    container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-error"><p>الطلب غير موجود</p><a href="#field/orders">العودة</a></div></div>';
    return;
  }

  const el = container.querySelector('.v2-fv-d');
  if (!el) return;
  el.innerHTML = `
    <a href="#field/orders" class="v2-fv-back">← العودة</a>
    <div class="v2-fv-dh">
      <h2 class="v2-fv-dc">${_e(order.order_number || 'طلب #' + order.id)}</h2>
      <span class="v2-fv-ds">${STATUS_LABEL[order.order_status] || order.order_status}</span>
    </div>
    <div class="v2-fv-di">
      ${(order.created_by_name || order.created_by_name_snapshot) ? `<div><span class="v2-fv-lbl">الموظف:</span> ${_e(order.created_by_name || order.created_by_name_snapshot)}</div>` : ''}
      ${order.created_at ? `<div><span class="v2-fv-lbl">التاريخ:</span> ${_dt(order.created_at)}</div>` : ''}
      <div><span class="v2-fv-lbl">الإجمالي:</span> ${_money(order.total_amount)}</div>
      ${order.note ? `<div><span class="v2-fv-lbl">ملاحظات:</span> ${_e(order.note)}</div>` : ''}
    </div>
    <div class="v2-order-items"><h3>المنتجات</h3>
      ${items.length === 0 ? '<p>لا توجد منتجات</p>' : `<table class="v2-order-table"><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${items.map(i => `
        <tr><td>${_e(i.product_name_snapshot || 'منتج')}${i.product_code_snapshot ? '<br><small>' + _e(i.product_code_snapshot) + '</small>' : ''}</td><td>${i.quantity || 0}</td><td>${_money(i.final_price)}</td><td>${_money((i.quantity || 0) * (i.final_price || 0))}</td></tr>
      `).join('')}</tbody></table>`}
    </div>
  `;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
