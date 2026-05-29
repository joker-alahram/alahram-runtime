import { logError } from '../../../../utils/logger.js';
import { getVisitDetail, checkOut, addVisitNote } from '../../../../services/field/visitsApi.js';
import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';

const STATUS_LABEL = { open: 'قيد التنفيذ', completed: 'مكتملة', cancelled: 'ملغية', scheduled: 'مجدولة' };
const EVENT_LABEL = {
  visit_started: 'بدء الزيارة', visit_completed: 'إنهاء الزيارة',
  note_added: 'إضافة ملاحظة', photo_taken: 'التقاط صورة',
  task_completed: 'إكمال مهمة', location_updated: 'تحديث الموقع',
  payment_collected: 'تحصيل مدفوعات',
};
const OUTCOMES = [
  { v: 'completed', l: 'تمت بنجاح' },
  { v: 'partial', l: 'تمت جزئياً' },
  { v: 'no_answer', l: 'لا يوجد رد' },
  { v: 'customer_busy', l: 'العميل مشغول' },
  { v: 'postponed', l: 'مؤجلة' },
];

export async function renderFieldVisitDetail(container, { visitId }) {
  if (!visitId) { container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-error"><p>معرف الزيارة غير موجود</p><a href="#field/visits">العودة</a></div></div>'; return; }

  container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-loading">جاري التحميل...</div></div>';

  let detail;
  try {
    detail = await getVisitDetail(visitId);
  } catch {
    container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-error"><p>فشل تحميل تفاصيل الزيارة</p><a href="#field/visits" class="v2-retry">العودة</a></div></div>';
    return;
  }

  const v = detail.visit || {};
  const c = detail.customer || {};
  const evts = detail.events || [];
  const notes = detail.notes || [];

  const el = container.querySelector('.v2-fv-d');
  if (!el) return;
  el.innerHTML = _render(v, c, evts, notes);

  if (v.visit_status === 'open') {
    const co = el.querySelector('#v2-fv-co');
    if (co) co.addEventListener('click', async () => {
      const outcome = el.querySelector('#v2-fv-oc-select')?.value || 'completed';
      const note = el.querySelector('#v2-fv-co-note')?.value || '';
      if (!confirm('إنهاء الزيارة؟')) return;
      co.disabled = true; co.textContent = 'جاري إنهاء الزيارة...';
      let lat, lng;
      try {
        const p = await _gps();
        lat = p.coords.latitude; lng = p.coords.longitude;
      } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
      try {
        await checkOut(visitId, outcome, note, lat, lng);
        renderFieldVisitDetail(container, { visitId });
      } catch {
        co.disabled = false; co.textContent = 'فشل الإنهاء';
      }
    });

    const addNoteBtn = el.querySelector('#v2-fv-add-note-btn');
    if (addNoteBtn) {
      addNoteBtn.addEventListener('click', async () => {
        const text = el.querySelector('#v2-fv-note-input')?.value?.trim();
        if (!text) return;
        addNoteBtn.disabled = true; addNoteBtn.textContent = 'جاري...';
        try {
          await addVisitNote(visitId, text);
          el.querySelector('#v2-fv-note-input').value = '';
          renderFieldVisitDetail(container, { visitId });
        } catch {
          addNoteBtn.disabled = false; addNoteBtn.textContent = 'إضافة ملاحظة';
        }
      });
    }

    const createOrder = el.querySelector('#v2-fv-create-order');
    if (createOrder) {
      createOrder.addEventListener('click', () => {
        location.hash = `#checkout?customerId=${c.id || ''}`;
      });
    }

    const collectBtn = el.querySelector('#v2-fv-collect');
    if (collectBtn) {
      collectBtn.addEventListener('click', async () => {
        const amount = el.querySelector('#v2-fv-collect-amount')?.value;
        const ref = el.querySelector('#v2-fv-collect-ref')?.value || '';
        if (!amount || isNaN(amount) || Number(amount) <= 0) { alert('الرجاء إدخال مبلغ صحيح'); return; }
        collectBtn.disabled = true; collectBtn.textContent = 'جاري...';
        try {
          const s = getSession();
          const r = await fetch(readConfig().baseUrl + '/rpc/record_collection', {
            method: 'POST', headers: _h(),
            body: JSON.stringify({ p_visit_id: visitId, p_amount: Number(amount), p_reference: ref, p_notes: '' }),
          });
          if (!r.ok) throw new Error('فشل');
          el.querySelector('#v2-fv-collect-amount').value = '';
          el.querySelector('#v2-fv-collect-ref').value = '';
          renderFieldVisitDetail(container, { visitId });
        } catch {
          collectBtn.disabled = false; collectBtn.textContent = 'تسجيل التحصيل';
        }
      });
    }
  }

  if (v.visit_status === 'scheduled') {
    const startBtn = el.querySelector('#v2-fv-start');
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        startBtn.disabled = true; startBtn.textContent = 'جاري تحديد الموقع...';
        let lat, lng;
        try {
          const p = await _gps();
          lat = p.coords.latitude; lng = p.coords.longitude;
        } catch (e) {
          const m = e.code === 1 ? 'الرجاء السماح بتحديد الموقع' : 'فشل تحديد الموقع';
          startBtn.textContent = m; startBtn.disabled = false; return;
        }
        startBtn.textContent = 'جاري بدء الزيارة...';
        try {
          const { checkIn } = await import('../../../../services/field/visitsApi.js');
          await checkIn(c.id, lat, lng, '');
          renderFieldVisitDetail(container, { visitId });
        } catch {
          startBtn.textContent = 'فشل بدء الزيارة'; startBtn.disabled = false;
        }
      });
    }
  }
}

function _render(v, c, evts, notes) {
  const isOpen = v.visit_status === 'open';
  const isScheduled = v.visit_status === 'scheduled';

  const timelineItems = [
    { label: 'إنشاء الزيارة', time: v.created_at, done: true },
    { label: 'بدء الزيارة', time: v.check_in_time, done: !!v.check_in_time, active: !!v.check_in_time && !v.check_out_time },
    { label: 'إنهاء الزيارة', time: v.check_out_time, done: !!v.check_out_time },
  ];

  const timelineHtml = `<div class="v2-fv-timeline"><h3>تسلسل الزيارة</h3>${timelineItems.map(t => {
    let dotClass = 'v2-fv-tl-dot-pending';
    if (t.active) dotClass = 'v2-fv-tl-dot-active';
    else if (t.done) dotClass = 'v2-fv-tl-dot-done';
    return `<div class="v2-fv-tl-item">
      <div class="v2-fv-tl-dot ${dotClass}"></div>
      <div class="v2-fv-tl-content">
        <div class="v2-fv-tl-label">${t.label}</div>
        ${t.time ? `<div class="v2-fv-tl-time">${_dt(t.time)}</div>` : '<div class="v2-fv-tl-time">—</div>'}
      </div>
    </div>`;
  }).join('')}</div>`;

  const actionBtns = [];
  if (isScheduled) {
    actionBtns.push(`<button class="v2-btn v2-btn-p" id="v2-fv-start" style="width:100%;border-radius:12px;padding:.75rem;min-height:48px">بدء الزيارة</button>`);
  }
  if (isOpen) {
    actionBtns.push(`<button class="v2-btn v2-btn-p" id="v2-fv-create-order" style="width:100%;border-radius:12px;padding:.75rem;min-height:48px">â‍• إنشاء طلب جديد</button>`);
  }
  const actionsHtml = actionBtns.length ? `<div class="v2-fv-actions">${actionBtns.join('')}</div>` : '';

  return `<a href="#field/visits" class="v2-fv-back">← العودة للزيارات</a>
    <div class="v2-fv-dh">
      <h2 class="v2-fv-dc">${_e(c.customer_name)}</h2>
      <span class="v2-fv-ds v2-fv-st-${v.visit_status}">${STATUS_LABEL[v.visit_status] || v.visit_status}</span>
    </div>
    <div class="v2-fv-di">
      ${c.phone ? `<div><span class="v2-fv-lbl">الهاتف</span> ${_e(c.phone)}</div>` : ''}
      ${c.address ? `<div><span class="v2-fv-lbl">العنوان</span> ${_e(c.address)}</div>` : ''}
      ${v.visit_outcome ? `<div><span class="v2-fv-lbl">النتيجة</span> ${_e(v.visit_outcome)}</div>` : ''}
    </div>
    ${timelineHtml}
    ${actionsHtml}
    ${isOpen ? _collectionForm() : ''}
    ${isOpen ? _notesForm(notes) : ''}
    ${isOpen ? _checkOutForm() : ''}
    ${!isOpen && notes.length > 0 ? `<div class="v2-fv-notes"><h3>الملاحظات</h3>${notes.map(n => `<div class="v2-fv-note"><div class="v2-fv-note-t">${_dt(n.created_at)}</div><div>${_e(n.note)}</div></div>`).join('')}</div>` : ''}
    <div class="v2-fv-evts"><h3>الأحداث</h3>${evts.length === 0 ? '<p>لا توجد أحداث</p>' : evts.map(e =>
      `<div class="v2-fv-evt"><span class="v2-fv-evt-t">${_dt(e.created_at)}</span><span>${EVENT_LABEL[e.event_type] || e.event_type}</span></div>`
    ).join('')}</div>`;
}

function _collectionForm() {
  return `<div class="v2-fv-collect-card">
    <h3>💰 تحصيل مدفوعات</h3>
    <div class="v2-fv-collect-row">
      <input id="v2-fv-collect-amount" class="v2-fv-inp" type="number" placeholder="المبلغ" min="0" step="0.01" style="flex:1">
      <input id="v2-fv-collect-ref" class="v2-fv-inp" type="text" placeholder="مرجع (اختياري)" style="flex:1">
    </div>
    <button id="v2-fv-collect" class="v2-fv-btn" style="background:#059669">تسجيل التحصيل</button>
  </div>`;
}

function _notesForm(notes) {
  return `<div class="v2-fv-notes-card">
    <h3>📝 الملاحظات</h3>
    <textarea id="v2-fv-note-input" class="v2-fv-inp" placeholder="أضف ملاحظة..." rows="2"></textarea>
    <button id="v2-fv-add-note-btn" class="v2-fv-btn" style="background:var(--v2-primary)">إضافة ملاحظة</button>
    ${notes.length > 0 ? `<div class="v2-fv-notes-list">${notes.slice(-3).map(n => `<div class="v2-fv-note"><div class="v2-fv-note-t">${_dt(n.created_at)}</div><div>${_e(n.note)}</div></div>`).join('')}</div>` : ''}
  </div>`;
}

function _checkOutForm() {
  return `<div class="v2-fv-co">
    <h3>إنهاء الزيارة</h3>
    <select id="v2-fv-oc-select" class="v2-fv-inp">${OUTCOMES.map(o => `<option value="${o.v}">${o.l}</option>`).join('')}</select>
    <textarea id="v2-fv-co-note" class="v2-fv-inp" placeholder="ملاحظات الإنهاء..." rows="2"></textarea>
    <button id="v2-fv-co" class="v2-fv-btn" style="background:#dc2626">إنهاء الزيارة</button>
  </div>`;
}

function _gps() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { rej(new Error('GPS غير متوفر')); return; }
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });
}

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

