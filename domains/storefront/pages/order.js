import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { getIdentity, buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { orderDetailSelect } from '../../../services/contracts/orders.contract.js';
import { getOrderTimeline } from '../../../services/storefront/orderTimelineApi.js';
import { groupItemsByCompany, getCompanyName, getProductName, getProductCode, getQuantity, getFinalPrice, getUnitName, getLineTotal, computeGroupSubtotal, computeGrandTotal } from '../../../services/storefront/groupItems.js';

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

async function _fetchOrder(id) {
  const scopeFilter = buildOrderScopeFilter();
  let url = readConfig().baseUrl + '/runtime_order_visibility?select=' + orderDetailSelect() + '&id=eq.' + id;
  if (scopeFilter) url += '&' + scopeFilter;
  const r = await fetch(url, { headers: _headers() });
  if (!r.ok) return null;
  const arr = await r.json();
  return arr.length ? arr[0] : null;
}

async function _fetchItems(orderId) {
  const r = await fetch(readConfig().baseUrl + '/order_items?select=*,product_name_snapshot,product_code_snapshot,unit_name_snapshot&order_id=eq.' + orderId, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

export async function renderOrderPage(container, params) {
  const orderId = params?.orderId || params?.id || '';
  if (!orderId) {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>الطلب غير موجود</p><a href="#orders" class="v2-btn v2-btn-p">عودة للطلبات</a></div></div>';
    return;
  }
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل تفاصيل الطلب...</div></div>';
  try {
    const [order, items, timeline] = await Promise.all([_fetchOrder(orderId), _fetchItems(orderId), getOrderTimeline(orderId)]);
    if (!order) {
      container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>الطلب غير موجود</p><a href="#orders" class="v2-btn v2-btn-p">عودة للطلبات</a></div></div>';
      return;
    }
    _render(container, order, items, timeline);
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>فشل تحميل تفاصيل الطلب</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOrderPage(container, params));
  }
}

function _render(container, order, items, timeline) {
  const parts = [];
  parts.push('<div class="v2-page"><nav class="v2-back-nav"><a href="#orders" class="v2-back-link">← العودة للطلبات</a></nav>');

  const docType = _docTitle(order.order_status);
  parts.push('<div class="v2-order-detail">');
  parts.push('<div class="v2-order-detail-header">');
  parts.push('<h1 class="v2-page-title">' + docType + ' ' + _e(order.order_number || '') + '</h1>');
  parts.push('<span class="v2-order-status v2-order-status-' + _statusClass(order.order_status) + '">' + _statusText(order.order_status) + '</span>');
  parts.push('</div>');

  parts.push('<div class="v2-order-detail-info">');
  if (order.created_at) parts.push('<div class="v2-order-info-row"><span>التاريخ</span><span>' + _e(order.created_at.slice(0, 10)) + '</span></div>');
  if (order.customer_name_snapshot) {
    parts.push('<div class="v2-order-info-row"><span>العميل</span><span>' + _e(order.customer_name_snapshot) + '</span></div>');
    if (order.customer_phone_snapshot) parts.push('<div class="v2-order-info-row"><span>هاتف العميل</span><span dir="ltr">' + _e(order.customer_phone_snapshot) + '</span></div>');
    if (order.customer_address_snapshot) parts.push('<div class="v2-order-info-row"><span>عنوان العميل</span><span>' + _e(order.customer_address_snapshot) + '</span></div>');
  }
  const repName = order.created_by_name_snapshot || '';
  const repPhone = order.created_by_phone_snapshot || '';
  if (repName) parts.push('<div class="v2-order-info-row"><span>مندوب المبيعات</span><span>' + _e(repName) + (repPhone ? ' - ' + _e(repPhone) : '') + '</span></div>');
  if (order.note) parts.push('<div class="v2-order-info-row"><span>ملاحظات</span><span>' + _e(order.note) + '</span></div>');
  parts.push('</div>');

  parts.push('<div class="v2-order-items"><h2>الأصناف</h2>');
  if (!items.length) {
    parts.push('<div class="v2-empty"><p>لا توجد أصناف</p></div>');
  } else {
    const groups = groupItemsByCompany(items);
    parts.push('<table class="v2-order-table"><thead><tr><th>كود الصنف</th><th>اسم الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>');
    let grandTotal = 0;
    for (const group of groups) {
      const groupSubtotal = computeGroupSubtotal(group.items);
      grandTotal += groupSubtotal;
      parts.push('<tr class="v2-group-header" style="background:#eef2ff;font-weight:700;text-align:right"><td colspan="6" style="padding:6px 10px;color:#0d2b6b;border-bottom:2px solid #0052cc">' + _e(group.companyName) + ' (' + group.items.length + ' أصناف)</td></tr>');
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
    parts.push('</tbody><tfoot><tr class="v2-order-grand"><td colspan="5" style="text-align:left;">الإجمالي النهائي</td><td>' + _money(grandTotal) + '</td></tr></tfoot></table>');
  }
  parts.push('</div>');

  if (order.execution_maps_url) {
    parts.push('<div class="v2-order-maps"><a href="' + _e(order.execution_maps_url) + '" target="_blank" class="v2-btn v2-btn-b">عرض الموقع</a></div>');
  }

  // Timeline
  if (timeline && timeline.length > 0) {
    parts.push('<div class="v2-order-timeline"><h2>سجل التغييرات</h2><div class="v2-timeline-list">');
    for (const ev of timeline) {
      parts.push(_renderTimelineEvent(ev));
    }
    parts.push('</div></div>');
  }

  parts.push('</div></div>');
  container.innerHTML = parts.join('');
}

function _docTitle(status) {
  const s = String(status || '').trim().toLowerCase();
  const purchaseStatuses = ['pending', 'reviewing', 'submitted'];
  return purchaseStatuses.includes(s) ? 'طلب شراء' : 'فاتورة';
}

function _renderTimelineEvent(ev) {
  const type = ev.event_type || '';
  const actorName = (ev.actor_name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ev.actor_name)) ? ev.actor_name : '';
  const phone = ev.actor_phone || '';
  const ts = ev.created_at ? new Date(ev.created_at) : null;
  const dateStr = ts ? ts.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const timeStr = ts ? ts.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
  const actionMap = {
    order_created: 'تم إنشاء الطلب', order_edited: 'تم تعديل الطلب',
    item_added: 'تمت إضافة صنف', item_removed: 'تم حذف صنف',
    qty_changed: 'تم تعديل الكمية', price_changed: 'تم تعديل السعر',
    return_to_cart: 'تمت إعادة الطلب للسلة', resubmitted: 'تمت إعادة إرسال الطلب',
    approved: 'تم اعتماد الطلب', status_changed: 'تم تغيير الحالة',
  };
  const statusLabels = {
    draft: 'مسودة', pending: 'قيد الانتظار', submitted: 'تم الإرسال',
    reviewing: 'تحت المراجعة', approved: 'معتمد', preparing: 'قيد التجهيز',
    dispatched: 'خرج للشحن', delivered: 'تم التسليم', collected: 'تم التحصيل',
    returned: 'مرتجع', cancelled: 'ملغي', confirmed: 'تم التأكيد',
    processing: 'قيد التجهيز', shipped: 'تم الشحن', paid: 'مدفوع',
    completed: 'مكتمل', rejected: 'مرفوض',
  };
  const action = actionMap[type] || '';
  let detailsHtml = '';
  if (ev.change_details && Array.isArray(ev.change_details)) {
    const groups = [];
    for (const d of ev.change_details) {
      const lines = [];
      if (d.type === 'QTY_CHANGE') {
        lines.push('<span class="v2-tl-dl">الصنف:</span><span class="v2-tl-dv"> ' + _e((d.product_name || '') + (d.product_code ? ' (' + d.product_code + ')' : '')) + '</span>');
        lines.push('<span class="v2-tl-dl">الكمية:</span><span class="v2-tl-dv"> ' + (d.old_quantity || 0) + ' ← ' + (d.new_quantity || 0) + '</span>');
      } else if (d.type === 'ADD_ITEM') {
        lines.push('<span class="v2-tl-dl">الصنف:</span><span class="v2-tl-dv"> ' + _e((d.product_name || '') + (d.product_code ? ' (' + d.product_code + ')' : '')) + '</span>');
        lines.push('<span class="v2-tl-dv v2-tl-dv-ad">تمت إضافته</span>');
        if (d.new_quantity != null) lines.push('<span class="v2-tl-dl">الكمية:</span><span class="v2-tl-dv"> ' + d.new_quantity + '</span>');
      } else if (d.type === 'REMOVE_ITEM') {
        lines.push('<span class="v2-tl-dl">الصنف:</span><span class="v2-tl-dv"> ' + _e((d.product_name || '') + (d.product_code ? ' (' + d.product_code + ')' : '')) + '</span>');
        lines.push('<span class="v2-tl-dv v2-tl-dv-rm">تم حذفه</span>');
        if (d.old_quantity != null) lines.push('<span class="v2-tl-dl">الكمية السابقة:</span><span class="v2-tl-dv"> ' + d.old_quantity + '</span>');
      } else if (d.type === 'PRICE_CHANGE') {
        lines.push('<span class="v2-tl-dl">الصنف:</span><span class="v2-tl-dv"> ' + _e((d.product_name || '') + (d.product_code ? ' (' + d.product_code + ')' : '')) + '</span>');
        lines.push('<span class="v2-tl-dl">السعر:</span><span class="v2-tl-dv"> ' + _money(d.old_price || 0) + ' ← ' + _money(d.new_price || 0) + '</span>');
      } else if (d.type === 'STATUS_CHANGE') {
        const fromLabel = statusLabels[String(d.from || '').trim().toLowerCase()] || d.from;
        const toLabel = statusLabels[String(d.to || '').trim().toLowerCase()] || d.to;
        lines.push('<span class="v2-tl-dl">الحالة:</span><span class="v2-tl-dv"> ' + _e(fromLabel) + ' ← ' + _e(toLabel) + '</span>');
        if (d.note) lines.push('<span class="v2-tl-dv" style="font-size:.75rem;color:#6b7280">' + _e(d.note) + '</span>');
      }
      if (lines.length) groups.push('<div class="v2-tl-dg">' + lines.join('') + '</div>');
    }
    if (groups.length) detailsHtml = '<div class="v2-tl-card-det">' + groups.join('<hr class="v2-tl-dsep">') + '</div>';
  }
  return '<div class="v2-tl-card">'
    + '<div class="v2-tl-card-hd"><span class="v2-tl-card-arrow">▼</span><span class="v2-tl-card-dt">' + _e(dateStr) + ' - ' + _e(timeStr) + '</span></div>'
    + (actorName ? '<div class="v2-tl-card-actor"><span class="v2-tl-card-an">' + _e(actorName) + '</span>' + (phone ? '<span class="v2-tl-card-ap"> ' + _e(phone) + '</span>' : '') + '</div>' : '')
    + (action ? '<div class="v2-tl-card-act">' + _e(action) + '</div>' : '')
    + detailsHtml
    + '</div>';
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
