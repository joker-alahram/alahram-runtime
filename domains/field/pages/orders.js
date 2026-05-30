import { readConfig } from '../../../config.js';
import { buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';

export async function renderFieldOrders(container) {
  container.innerHTML = '<div class="v2-fv"><div class="v2-fv-loading">جاري التحميل...</div></div>';

  let orders;
  try {
    const API = readConfig().baseUrl;
    const headers = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
    const scopeFilter = buildOrderScopeFilter();
    const r = await fetch(`${API}/runtime_order_visibility?select=${orderListSelect()}&order=created_at.desc&limit=50${scopeFilter ? '&' + scopeFilter : ''}`, { headers });
    orders = await r.json();
  } catch {
    container.innerHTML = '<div class="v2-fv"><div class="v2-fv-error"><p>فشل تحميل الطلبات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderFieldOrders(container));
    return;
  }

  container.innerHTML = `<div class="v2-fv">
    ${orders.length === 0 ? '<div class="v2-fv-empty">لا توجد طلبات</div>' : orders.map(o => _card(o)).join('')}
  </div>`;
}

const STATUS_LABEL = { pending: 'قيد الانتظار', confirmed: 'مؤكد', processing: 'قيد التنفيذ', shipped: 'تم الشحن', delivered: 'تم التوصيل', cancelled: 'ملغي' };

function _card(o) {
  const repName = o.created_by_name_snapshot || '';
  const repPhone = o.created_by_phone_snapshot || '';
  const custName = o.customer_name_snapshot || '';
  const custPhone = o.customer_phone_snapshot || '';
  const custAddr = o.customer_address_snapshot || '';
  const docType = _docTitle(o.order_status);
  return `<a href="#field/orders/${o.id}" class="v2-fv-card">
    <div class="v2-fv-ch"><span>${docType} ${_e(o.order_number || '#' + o.id)}</span><span>${STATUS_LABEL[o.order_status] || o.order_status}</span></div>
    ${custName ? '<div class="v2-fv-time">👤 ' + _e(custName) + (custPhone ? ' - ' + _e(custPhone) : '') + '</div>' : ''}
    ${custAddr ? '<div class="v2-fv-time" style="color:#6b7280">📍 ' + _e(custAddr) + '</div>' : ''}
    <div class="v2-fv-time">🧑‍💼 ${_e(repName || '—')}${repPhone ? ' - ' + _e(repPhone) : ''}</div>
    <div class="v2-fv-time">${_dt(o.created_at)} - ${_money(o.total_amount)}</div>
  </a>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
function _docTitle(status) {
  const s = String(status || '').trim().toLowerCase();
  return ['pending', 'reviewing', 'submitted'].includes(s) ? 'طلب شراء' : 'فاتورة';
}
