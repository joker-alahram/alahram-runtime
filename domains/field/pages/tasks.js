import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';

export async function renderFieldTasks(container) {
  container.innerHTML = '<div class="v2-fv"><div class="v2-fv-empty">المهام غير متوفرة حاليًا — جدول المهام لم يتم إعداده بعد</div></div>';
}

const STATUS_LABEL = { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', completed: 'مكتملة', cancelled: 'ملغية' };
const PRIORITY_LABEL = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', urgent: 'عاجلة' };

function _card(t) {
  const pClass = t.priority === 'urgent' ? 'v2-task-urgent' : t.priority === 'high' ? 'v2-task-high' : '';
  return `<a href="#field/tasks/${t.id}" class="v2-fv-card ${pClass}">
    <div class="v2-fv-ch"><span>${_e(t.title)}</span><span>${PRIORITY_LABEL[t.priority] || t.priority}</span></div>
    <div class="v2-fv-time">${STATUS_LABEL[t.status] || t.status}${t.due_date ? ` - يستحق: ${_dt(t.due_date)}` : ''}</div>
    ${t.description ? `<div class="v2-fv-oc">${_e(t.description.substring(0, 100))}${t.description.length > 100 ? '...' : ''}</div>` : ''}
  </a>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
