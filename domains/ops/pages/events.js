import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';

function _h() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

async function _fetch(path) {
  const r = await fetch(`${readConfig().baseUrl}/${path}`, { headers: _h() });
  if (!r.ok) throw new Error('فشل التحميل');
  return r.json();
}

const EVENT_ICONS = {
  order_created: '🛒', order_updated: '📝', order_cancelled: '❌',
  payment_received: '💰', customer_created: '👤', inventory_adjustment: '📦',
};

function _icon(type) { return EVENT_ICONS[type] || '🔔'; }

export async function renderOpsEvents(container) {
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    const events = await _fetch('search_index_runtime?select=id,entity_type,entity_id,title,subtitle,is_active,created_at&order=created_at.desc&limit=50');
    container.innerHTML = `<div class="v2-ops-page">
      <h2>الأحداث الأخيرة — فهرس البحث</h2>
      ${events.length === 0 ? '<p>لا توجد أحداث</p>' : `<div class="v2-event-list">${events.map(ev => `<div class="v2-event-item">
        <div class="v2-event-icon">${_icon(ev.entity_type)}</div>
        <div class="v2-event-body">
          <div class="v2-event-desc">${_e(ev.title || '—')}</div>
          <div class="v2-event-meta">
            <span class="v2-event-type">${_e(ev.entity_type || '')}</span>
            <span class="v2-event-entity">#${_e(ev.entity_id || '—')}</span>
            <span class="v2-event-time">${_d(ev.created_at)} ${_t(ev.created_at)}</span>
          </div>
        </div>
      </div>`).join('')}</div>`}
    </div>`;
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>جدول الأحداث غير متوفر في قاعدة البيانات</p></div></div>';
  }
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
function _t(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
