import { getTodayVisits, getMyCustomers, checkIn } from '../../../../services/field/visitsApi.js';

const STATUS_ICON = { open: '🟢', completed: '✅', cancelled: '❌', scheduled: '📋' };
const STATUS_LABEL = { open: 'قيد التنفيذ', completed: 'مكتملة', cancelled: 'ملغية', scheduled: 'مجدولة' };

export async function renderFieldVisitsList(container) {
  container.innerHTML = '<div class="v2-fv"><div class="v2-fv-loading">جاري التحميل...</div></div>';

  let visits, customers;
  try {
    [visits, customers] = await Promise.all([getTodayVisits(), getMyCustomers()]);
  } catch {
    container.innerHTML = '<div class="v2-fv"><div class="v2-fv-error"><p>فشل تحميل الزيارات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderFieldVisitsList(container));
    return;
  }

  const open = visits.find(v => v.visit_status === 'open');
  const done = visits.filter(v => v.visit_status !== 'open');

  const el = container.querySelector('.v2-fv');
  if (!el) return;
  el.innerHTML = `
    ${open ? _activeCard(open) : ''}
    <button class="v2-fv-new" id="v2-fv-new-btn"${open ? ' disabled' : ''}>${open ? 'يوجد زيارة نشطة حالياً' : 'بدء زيارة جديدة'}</button>
    <div class="v2-fv-cust-list" id="v2-fv-cust-list" style="display:none">${customers.map(c =>
      `<button class="v2-fv-cust-item" data-start="${c.id}" data-name="${_e(c.customer_name)}">${_e(c.customer_name)}${c.phone ? `<span class="v2-fv-cust-ph">${_e(c.phone)}</span>` : ''}</button>`
    ).join('')}</div>
    ${done.length > 0 ? `<div class="v2-fv-sep">اليوم</div>${done.map(v => _card(v)).join('')}` : ''}
    ${visits.length === 0 ? '<div class="v2-fv-empty">لا توجد زيارات اليوم</div>' : ''}
  `;

  const newBtn = el.querySelector('#v2-fv-new-btn');
  const custList = el.querySelector('#v2-fv-cust-list');
  if (newBtn && custList && !newBtn.disabled) {
    newBtn.addEventListener('click', () => {
      custList.style.display = custList.style.display === 'none' ? 'block' : 'none';
    });
  }

  el.querySelectorAll('[data-start]').forEach(b => {
    b.addEventListener('click', async () => {
      const id = b.dataset.start;
      b.disabled = true; b.innerHTML = 'جاري تحديد الموقع...';
      let lat, lng;
      try {
        const p = await _gps();
        lat = p.coords.latitude; lng = p.coords.longitude;
      } catch (e) {
        const m = e.code === 1 ? 'الرجاء السماح بتحديد الموقع' : 'فشل تحديد الموقع';
        b.innerHTML = m; b.disabled = false; return;
      }
      b.innerHTML = 'جاري بدء الزيارة...';
      try {
        const vid = await checkIn(id, lat, lng, '');
        location.hash = `#field/visits/${vid}`;
      } catch {
        b.innerHTML = 'فشل بدء الزيارة'; b.disabled = false;
      }
    });
  });

  el.querySelectorAll('[data-visit]').forEach(b => {
    b.addEventListener('click', () => { location.hash = `#field/visits/${b.dataset.visit}`; });
  });
}

function _activeCard(v) {
  return `<div class="v2-fv-active-card" data-visit="${v.visit_id}">
    <div class="v2-fv-active-name">${_e(v.customer_name)}</div>
    <div class="v2-fv-active-time">${_t(v.check_in_time)} ${v.check_in_time ? `(${_d(v.check_in_time)})` : ''}</div>
    <div class="v2-fv-active-go">متابعة الزيارة ←</div>
  </div>`;
}

function _card(v) {
  const s = v.visit_status;
  return `<div class="v2-fv-card" data-visit="${v.visit_id}">
    <div class="v2-fv-ch"><span>${_e(v.customer_name)}</span><span class="v2-fv-st-${s}">${STATUS_LABEL[s] || s}</span></div>
    <div class="v2-fv-time">${_t(v.check_in_time)}${v.check_out_time ? ` ← ${_t(v.check_out_time)}` : v.check_in_time ? ' ← مستمر' : ''}</div>
    ${v.visit_outcome ? `<div class="v2-fv-oc">${_e(v.visit_outcome.length > 120 ? v.visit_outcome.slice(0, 120) + '...' : v.visit_outcome)}</div>` : ''}
  </div>`;
}

function _gps() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { rej(new Error('GPS غير متوفر')); return; }
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _t(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
function _d(d) { if (!d) return ''; const m = Math.floor((Date.now() - new Date(d)) / 60000); return m < 1 ? 'لحظات' : `${m} د`; }
