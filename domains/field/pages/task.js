import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';

const STATUS_LABEL = { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', completed: 'مكتملة', cancelled: 'ملغية' };
const PRIORITY_LABEL = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة' };

export async function renderFieldTask(container, params) {
  container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-empty"><p>المهام غير متوفرة حاليًا</p><a href="#field/visits" class="v2-btn v2-btn-p">العودة للزيارات</a></div></div>';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
