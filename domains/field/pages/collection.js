import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';

const METHOD_LABEL = { cash: 'نقدي', card: 'بطاقة', bank_transfer: 'تحويل بنكي', cheque: 'شيك' };
const STATUS_LABEL = { pending: 'قيد الانتظار', confirmed: 'مؤكد', cancelled: 'ملغي' };

export async function renderFieldCollection(container, params) {
  container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-empty"><p>التحصيلات غير متوفرة</p><a href="#field/visits" class="v2-btn v2-btn-p">العودة للزيارات</a></div></div>';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
