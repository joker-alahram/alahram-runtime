import { logError } from '../../../utils/logger.js';
import { getRuntimeState, subscribe, setActiveVisit, setWorkspaceMode, clearActiveVisit, canShowWorkspace } from '../../../services/storefront/runtimeContext.js';
import { startVisit, completeVisit, cancelVisit, captureGps, formatDurationLive, getActiveVisit, syncActiveVisit } from '../../../services/storefront/visitsApi.js';
import { getSession } from '../../../auth/sessionService.js';
import { setSelectedCustomer, setCustomerJustSelected } from '../../../services/storefront/cartApi.js';

let _interval = null;
let _el = null;
let _unsub = null;

function _renderVisitStart(customerId, customerName, customerPhone, customerAddress) {
  _cleanup();
  const el = document.createElement('div');
  el.id = 'v2-avw';
  el.className = 'v2-avw v2-avw-expanded';
  el.innerHTML = `
    <div class="v2-avw-backdrop"></div>
    <div class="v2-avw-sheet">
      <div class="v2-avw-sheet-header">
        <button class="v2-avw-close" id="v2-avw-close">✕</button>
        <span class="v2-avw-title">بدء الزيارة</span>
      </div>
      <div class="v2-avw-sheet-body">
        <div class="v2-avw-customer">
          <div class="v2-avw-customer-avatar">${(customerName || '?')[0]}</div>
          <div class="v2-avw-customer-info">
            <div class="v2-avw-customer-name">${_e(customerName || '')}</div>
            ${customerPhone ? `<div class="v2-avw-customer-detail">📞 ${_e(customerPhone)}</div>` : ''}
            ${customerAddress ? `<div class="v2-avw-customer-detail">📍 ${_e(customerAddress)}</div>` : ''}
          </div>
        </div>
        <div class="v2-avw-gps" id="v2-avw-gps">
          <div class="v2-avw-gps-loading">جاري الحصول على الموقع...</div>
        </div>
        <div class="v2-avw-notes">
          <label class="v2-avw-label">ملاحظات الزيارة</label>
          <textarea id="v2-avw-notes" rows="3" placeholder="أي ملاحظات الزيارة..." class="v2-avw-textarea"></textarea>
        </div>
      </div>
      <div class="v2-avw-sheet-footer">
        <button class="v2-avw-btn v2-avw-btn-primary" id="v2-avw-start">بدء الزيارة</button>
        <button class="v2-avw-btn" id="v2-avw-cancel">إلغاء</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  _el = el;
  _bindStart(el, customerId, customerName, customerPhone, customerAddress);
  _captureGps(el);
}

function _renderMinimized(visit) {
  _cleanup();
  const el = document.createElement('div');
  el.id = 'v2-avw';
  el.className = 'v2-avw v2-avw-minimized';
  el.innerHTML = `
    <div class="v2-avw-min-card" id="v2-avw-card">
      <div class="v2-avw-min-left">
        <span class="v2-avw-min-dot"></span>
        <div class="v2-avw-min-info">
          <span class="v2-avw-min-name">${_e(visit.customer_name || 'جاري')}</span>
          <span class="v2-avw-min-sub">زيارة نشطة</span>
        </div>
      </div>
      <div class="v2-avw-min-center">
        <span class="v2-avw-min-timer" id="v2-avw-timer">${formatDurationLive(visit.opened_at)}</span>
      </div>
      <div class="v2-avw-min-chevron">⌃</div>
    </div>
    <div class="v2-avw-min-actions" id="v2-avw-min-actions">
      <button class="v2-avw-min-btn" data-action="order"><span class="v2-avw-min-btn-icon">📄</span><span>طلب</span></button>
      <button class="v2-avw-min-btn" data-action="collect"><span class="v2-avw-min-btn-icon">💰</span><span>تحصيل</span></button>
      <button class="v2-avw-min-btn" data-action="map"><span class="v2-avw-min-btn-icon">📍</span><span>الموقع</span></button>
      <button class="v2-avw-min-btn v2-avw-min-btn-end" data-action="end"><span class="v2-avw-min-btn-icon">✕</span><span>إنهاء</span></button>
    </div>`;
  document.body.appendChild(el);
  _el = el;
  _bindMinimized(el, visit);
  _interval = setInterval(() => {
    const t = document.getElementById('v2-avw-timer');
    if (t) t.textContent = formatDurationLive(visit.opened_at);
  }, 1000);
}

function _renderExpanded(visit) {
  _cleanup();
  const timeline = (visit.timeline || []).map(e => _timelineItem(e)).join('');
  const orders = (visit.order_ids || []).length;
  const collections = (visit.collections || []).length;
  const collected = (visit.total_collected_amount || 0);
  const notes = visit.notes || '';

  const el = document.createElement('div');
  el.id = 'v2-avw';
  el.className = 'v2-avw v2-avw-expanded';
  el.innerHTML = `
    <div class="v2-avw-backdrop"></div>
    <div class="v2-avw-sheet">
      <div class="v2-avw-sheet-header">
        <div class="v2-avw-sh-left">
          <div class="v2-avw-avatar">${(visit.customer_name || '?')[0]}</div>
          <div>
            <div class="v2-avw-title">${_e(visit.customer_name)}</div>
            <div class="v2-avw-subtitle">${_e(visit.customer_address || 'بدون عنوان')}</div>
          </div>
        </div>
        <div class="v2-avw-sh-right">
          <span class="v2-avw-timer" id="v2-avw-timer-exp">${formatDurationLive(visit.opened_at)}</span>
          <button class="v2-avw-close" id="v2-avw-close">⌄</button>
        </div>
      </div>

      <div class="v2-avw-sheet-body">
        <div class="v2-avw-counters">
          <div class="v2-avw-counter"><span class="v2-avw-counter-num">${orders}</span><span class="v2-avw-counter-lbl">طلبات</span></div>
          <div class="v2-avw-counter"><span class="v2-avw-counter-num">${collections}</span><span class="v2-avw-counter-lbl">تحصيلات</span></div>
          <div class="v2-avw-counter"><span class="v2-avw-counter-num">${_money(collected)}</span><span class="v2-avw-counter-lbl">المبلغ</span></div>
        </div>

        <div class="v2-avw-actions-grid">
          <button class="v2-avw-action-card" data-action="order">
            <span class="v2-avw-action-icon">📄</span>
            <span class="v2-avw-action-label">طلب جديد</span>
          </button>
          <button class="v2-avw-action-card" data-action="collect">
            <span class="v2-avw-action-icon">💰</span>
            <span class="v2-avw-action-label">تحصيل</span>
          </button>
          <button class="v2-avw-action-card" data-action="map">
            <span class="v2-avw-action-icon">📍</span>
            <span class="v2-avw-action-label">الموقع</span>
          </button>
          <button class="v2-avw-action-card v2-avw-action-end" data-action="end">
            <span class="v2-avw-action-icon">✕</span>
            <span class="v2-avw-action-label">إنهاء</span>
          </button>
        </div>

        <div class="v2-avw-section">
          <div class="v2-avw-section-title">سجل الزيارة</div>
          <div class="v2-avw-timeline">${timeline || '<div class="v2-avw-timeline-empty">لا توجد أحداث بعد</div>'}</div>
        </div>

        <div class="v2-avw-section">
          <div class="v2-avw-section-title">ملاحظات</div>
          <div class="v2-avw-notes-content">${notes ? _e(notes) : '<span class="v2-avw-notes-empty">لا توجد ملاحظات</span>'}</div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  _el = el;
  _bindExpanded(el, visit);
  _interval = setInterval(() => {
    const t = document.getElementById('v2-avw-timer-exp');
    if (t) t.textContent = formatDurationLive(visit.opened_at);
  }, 1000);
}

function _timelineItem(e) {
  const icons = { visit_opened: '🔍', visit_closed: '✅', visit_cancelled: '❌', order_created: '📄', collection: '💰', note_added: '📝' };
  const labels = { visit_opened: 'بدء الزيارة', visit_closed: 'إنهاء الزيارة', visit_cancelled: 'إلغاء الزيارة', order_created: 'إنشاء طلب', collection: 'تحصيل', note_added: 'إضافة ملاحظة' };
  const icon = icons[e.type] || '❌';
  const label = labels[e.type] || e.type;
  const time = e.timestamp ? _t(e.timestamp) : '';
  const detail = e.data?.order_number ? `#${e.data.order_number}` : e.data?.amount ? `${_money(e.data.amount)}` : '';
  return `<div class="v2-avw-timeline-item">
    <span class="v2-avw-tl-icon">${icon}</span>
    <div class="v2-avw-tl-body">
      <div class="v2-avw-tl-label">${label} ${detail ? `<span class="v2-avw-tl-detail">${detail}</span>` : ''}</div>
      <div class="v2-avw-tl-time">${time}</div>
    </div>
  </div>`;
}

async function _captureGps(el) {
  const gpsEl = el.querySelector('#v2-avw-gps');
  if (!gpsEl) return;
  const gps = await captureGps();
  if (!gps) {
    gpsEl.innerHTML = '<div class="v2-avw-gps-fail">تعذر الحصول على الموقع. الرجاء التأكد من تشغيل GPS.</div>';
    return;
  }
  const cls = gps.accuracy <= 15 ? 'v2-avw-gps-ok' : gps.accuracy <= 50 ? 'v2-avw-gps-warn' : 'v2-avw-gps-bad';
  gpsEl.innerHTML = `<div class="${cls}">📍 ${gps.accLabel} (${gps.accuracy}m)</div>`;
  el.dataset.gps = JSON.stringify(gps);
}

function _bindStart(el, customerId, customerName, customerPhone, customerAddress) {
  el.querySelector('#v2-avw-close')?.addEventListener('click', _cleanup);
  el.querySelector('#v2-avw-cancel')?.addEventListener('click', _cleanup);

  el.querySelector('#v2-avw-start')?.addEventListener('click', async () => {
    const notes = el.querySelector('#v2-avw-notes')?.value || '';
    const btn = el.querySelector('#v2-avw-start');
    btn.disabled = true;
    btn.textContent = 'جاري...';
    try {
      const visit = await startVisit(customerId, customerName, customerPhone, customerAddress, notes);
      setActiveVisit(visit);
      _cleanup();
      _renderMinimized(visit);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'بدء الزيارة';
    }
  });
}

function _bindMinimized(el, visit) {
  const card = el.querySelector('#v2-avw-card');
  card?.addEventListener('click', () => {
    _renderExpanded(visit);
  });

  el.querySelector('[data-action="order"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setSelectedCustomer({ id: visit.customer_id, name: visit.customer_name });
    setCustomerJustSelected(visit.customer_name);
    location.hash = '#products';
  });

  el.querySelector('[data-action="collect"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    location.hash = '#visits/' + visit.id;
    setTimeout(() => document.getElementById('v2-vd-collect-btn')?.click(), 300);
  });

  el.querySelector('[data-action="map"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const url = visit.gps_start?.mapsUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });

  el.querySelector('[data-action="end"]')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('إنهاء الزيارة الآن؟')) return;
    try {
      await completeVisit();
      clearActiveVisit();
      _cleanup();
    } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  });
}

function _bindExpanded(el, visit) {
  el.querySelector('#v2-avw-close')?.addEventListener('click', () => {
    _renderMinimized(visit);
  });

  el.querySelector('[data-action="order"]')?.addEventListener('click', () => {
    setSelectedCustomer({ id: visit.customer_id, name: visit.customer_name });
    setCustomerJustSelected(visit.customer_name);
    location.hash = '#products';
    _renderMinimized(visit);
  });

  el.querySelector('[data-action="collect"]')?.addEventListener('click', () => {
    location.hash = '#visits/' + visit.id;
    _renderMinimized(visit);
  });

  el.querySelector('[data-action="map"]')?.addEventListener('click', () => {
    const url = visit.gps_start?.mapsUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });

  el.querySelector('[data-action="end"]')?.addEventListener('click', async () => {
    if (!confirm('إنهاء الزيارة الآن؟')) return;
    try {
      await completeVisit();
      clearActiveVisit();
      _cleanup();
    } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
    if (location.hash.startsWith('#visits/' + visit.id)) {
      location.hash = '#visits/' + visit.id;
    }
  });
}

function _cleanup() {
  if (_interval) { clearInterval(_interval); _interval = null; }
  if (_unsub) { _unsub(); _unsub = null; }
  const existing = document.getElementById('v2-avw');
  if (existing) existing.remove();
  _el = null;
}

export function destroyWorkspace() { _cleanup(); }

export function initWorkspace() {
  if (!canShowWorkspace()) return;
  const state = getRuntimeState();
  if (state.activeVisit) {
    _renderMinimized(state.activeVisit);
  }
  _unsub = subscribe((s) => {
    if (s.activeVisit && !document.getElementById('v2-avw')) {
      if (canShowWorkspace()) _renderMinimized(s.activeVisit);
    } else if (!s.activeVisit && document.getElementById('v2-avw')) {
      _cleanup();
    }
  });
}

export function showVisitStart(customerId, customerName, customerPhone, customerAddress) {
  const existing = getActiveVisit() || getRuntimeState().activeVisit;
  if (existing) {
    _renderExpanded(existing);
    return;
  }
  _renderVisitStart(customerId, customerName, customerPhone, customerAddress);
}

export function showActiveWorkspace() {
  const visit = getActiveVisit() || getRuntimeState().activeVisit;
  if (visit) _renderExpanded(visit);
}

export function refreshWorkspace() {
  if (!canShowWorkspace()) return;
  const state = getRuntimeState();
  if (state.activeVisit && !document.getElementById('v2-avw')) {
    _renderMinimized(state.activeVisit);
  }
}

const _t = (d) => { if (!d) return ''; return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); };
const _e = (s) => { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const _money = (n) => { if (n == null) return '0'; return Number(n).toLocaleString('en-US') + ' ج.م'; };

