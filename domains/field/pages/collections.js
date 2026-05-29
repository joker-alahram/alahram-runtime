import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';

export async function renderFieldCollections(container) {
  container.innerHTML = '<div class="v2-fv"><div class="v2-fv-empty">التحصيلات غير متوفرة حاليًا — جدول التحصيلات لم يتم إعداده بعد</div></div>';
}

const METHOD_LABEL = { cash: 'نقدي', card: 'بطاقة', bank_transfer: 'تحويل بنكي', cheque: 'شيك' };
const STATUS_LABEL = { pending: 'قيد الانتظار', confirmed: 'مؤكد', cancelled: 'ملغي' };

function _card(c) {
  return `<a href="#field/collections/${c.id}" class="v2-fv-card">
    <div class="v2-fv-ch"><span>${_e(c.customer_name_snapshot)}</span><span>${_money(c.amount)}</span></div>
    <div class="v2-fv-time">${_dt(c.collection_date)} - ${METHOD_LABEL[c.payment_method] || c.payment_method} - ${STATUS_LABEL[c.status] || c.status}</div>
    ${c.order_number_snapshot ? `<div class="v2-fv-time">طلب: ${_e(c.order_number_snapshot)}</div>` : ''}
    ${c.notes ? `<div class="v2-fv-oc">${_e(c.notes)}</div>` : ''}
  </a>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
