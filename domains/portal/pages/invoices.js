import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

export async function renderPortalInvoices(container) {
  container.innerHTML = '<div class="v2-empty"><p>بيان الفواتير غير متوفر حاليًا — يمكنك متابعة طلباتك من صفحة الطلبات.</p><a href="#portal/orders" class="v2-btn v2-btn-p">عرض الطلبات</a></div>';
}

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

function _statusText(s) {
  const map = { draft: 'مسودة', pending: 'قيد الانتظار', submitted: 'تم الإرسال', confirmed: 'تم التأكيد', processing: 'قيد التجهيز', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي', rejected: 'مرفوض', completed: 'مكتمل', paid: 'مدفوع', unpaid: 'غير مدفوع' };
  return map[String(s || '').trim().toLowerCase()] || s || 'غير معروف';
}

function _statusClass(s) {
  const map = { draft: 'draft', pending: 'pending', submitted: 'submitted', confirmed: 'confirmed', processing: 'processing', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled', rejected: 'rejected', completed: 'completed', paid: 'paid', unpaid: 'unpaid' };
  return map[String(s || '').trim().toLowerCase()] || 'unknown';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
