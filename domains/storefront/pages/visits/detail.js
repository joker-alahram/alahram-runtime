import { getVisit, addVisitNote, addCollection, completeVisit, cancelVisit, linkOrderToVisit, formatDuration, getActiveVisit, VISIT_STATUS, visitStatusLabel, visitStatusIcon } from '../../../../services/storefront/visitsApi.js';
import { setSelectedCustomer, setCustomerJustSelected } from '../../../../services/storefront/cartApi.js';

export async function renderVisitDetail(container, params) {
  const id = params.visitId;
  if (!id) { container.innerHTML = '<div class="v2-vd"><p class="v2-vd-error">معرف الزيارة غير صالح</p></div>'; return; }
  const visit = getVisit(id);
  if (!visit) { container.innerHTML = '<div class="v2-vd"><p class="v2-vd-error">الزيارة غير موجودة</p><a href="#visits" class="v2-btn v2-btn-p">العودة</a></div>'; return; }
  _render(container, visit);
}

function _render(container, visit) {
  const d = new Date(visit.opened_at);
  const dateStr = d.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const dur = visit.status === 'active' ? 'جارية' : formatDuration(visit.duration_ms);
  const isActive = visit.status === 'active';
  const activeVisit = getActiveVisit();
  const isCurrentVisit = activeVisit?.id === visit.id;

  const timelineHtml = visit.timeline?.length
    ? visit.timeline.map(t => _timelineItem(t)).join('')
    : '<div class="v2-vd-tl-empty">لا توجد أحداث</div>';

  const colsHtml = visit.collections?.length
    ? visit.collections.map(c => _collectionCard(c)).join('')
    : '';

  container.innerHTML = `<div class="v2-vd">
    <nav class="v2-vd-nav"><a href="#visits" class="v2-vd-back">← الزيارات</a></nav>

    <!-- Header -->
    <div class="v2-vd-card">
      <div class="v2-vd-header">
        <div>
          <div class="v2-vd-name">${_e(visit.customer_name)}</div>
          ${visit.customer_phone ? `<div class="v2-vd-phone">📞 ${_e(visit.customer_phone)}</div>` : ''}
          ${visit.customer_address ? `<div class="v2-vd-addr">📍 ${_e(visit.customer_address)}</div>` : ''}
        </div>
        <span class="v2-vd-status-badge v2-vd-status-${visit.status}">${visitStatusIcon(visit.status)} ${visitStatusLabel(visit.status)}</span>
      </div>

      <!-- GPS Proof -->
      <div class="v2-vd-proof">
        <div class="v2-vd-proof-title">📡 إثبات الموقع</div>
        <div class="v2-vd-proof-grid">
          <div class="v2-vd-proof-item">
            <span class="v2-vd-proof-label">بداية</span>
            ${visit.gps_start ? `<span class="v2-vd-proof-val">${visit.gps_start.lat.toFixed(6)}, ${visit.gps_start.lng.toFixed(6)}</span><span class="v2-vd-proof-sub">دقة ${visit.gps_start.accuracy}m</span>` : '<span class="v2-vd-proof-val">غير متاح</span>'}
            ${visit.gps_start?.mapsUrl ? `<a href="${visit.gps_start.mapsUrl}" target="_blank" class="v2-vd-proof-map">📍 فتح الخريطة</a>` : ''}
          </div>
          ${visit.gps_end ? `<div class="v2-vd-proof-item">
            <span class="v2-vd-proof-label">نهاية</span>
            <span class="v2-vd-proof-val">${visit.gps_end.lat.toFixed(6)}, ${visit.gps_end.lng.toFixed(6)}</span>
            <span class="v2-vd-proof-sub">دقة ${visit.gps_end.accuracy}m</span>
            ${visit.gps_end.mapsUrl ? `<a href="${visit.gps_end.mapsUrl}" target="_blank" class="v2-vd-proof-map">📍 فتح الخريطة</a>` : ''}
          </div>` : ''}
        </div>
        <div class="v2-vd-proof-acc">
          جودة الموقع: ${_gpsAccuracyHTML(visit.gps_accuracy, visit.gps_start?.accuracy)}
        </div>
      </div>

      <!-- Info -->
      <div class="v2-vd-info">
        <div class="v2-vd-info-row"><span>التاريخ</span><span>${dateStr} · ${timeStr}</span></div>
        <div class="v2-vd-info-row"><span>المدة</span><span>${dur}</span></div>
        ${visit.employee_name ? `<div class="v2-vd-info-row"><span>المندوب</span><span>${_e(visit.employee_name)}</span></div>` : ''}
        <div class="v2-vd-info-row"><span>الطلبات</span><span>${visit.total_orders || 0}</span></div>
        <div class="v2-vd-info-row"><span>التحصيل</span><span>${_money(visit.total_collected_amount || 0)}</span></div>
      </div>

      <!-- Notes -->
      <div class="v2-vd-section">
        <div class="v2-vd-section-title">ملاحظات</div>
        <textarea class="v2-vd-notes" id="v2-vd-notes" rows="2" ${!isCurrentVisit ? 'disabled' : ''}>${_e(visit.notes || '')}</textarea>
        ${isCurrentVisit ? '<button class="v2-vd-save-btn" id="v2-vd-save-note">حفظ</button>' : ''}
      </div>
    </div>

    <!-- Actions -->
    ${isCurrentVisit ? `<div class="v2-vd-actions-bar">
      <button class="v2-vd-action v2-vd-action-primary" id="v2-vd-order-btn">📄 إنشاء طلب</button>
      <button class="v2-vd-action" id="v2-vd-collect-btn">💰 تحصيل</button>
      <button class="v2-vd-action v2-vd-action-danger" id="v2-vd-end-btn">✕ إنهاء الزيارة</button>
    </div>` : ''}

    <!-- Collections -->
    ${colsHtml ? `<div class="v2-vd-card">
      <div class="v2-vd-section-title" style="padding:1rem 1.5rem 0">التحصيلات</div>
      <div class="v2-vd-cols">${colsHtml}</div>
    </div>` : ''}

    <!-- Timeline -->
    <div class="v2-vd-card">
      <div class="v2-vd-section-title" style="padding:1rem 1.5rem 0">سير الزيارة</div>
      <div class="v2-vd-tl">${timelineHtml}</div>
    </div>

    <!-- Collection Modal (hidden) -->
    <div class="v2-vd-collect-modal" id="v2-vd-collect-modal" style="display:none">
      <div class="v2-vd-collect-overlay" id="v2-vd-collect-overlay"></div>
      <div class="v2-vd-collect-box">
        <h3>💰 تحصيل</h3>
        <div class="v2-vd-field">
          <label>المبلغ</label>
          <input type="number" id="v2-vd-col-amount" class="v2-vd-input" placeholder="0" min="0">
        </div>
        <div class="v2-vd-field">
          <label>طريقة الدفع</label>
          <select id="v2-vd-col-method" class="v2-vd-input">
            <option value="cash">نقداً</option>
            <option value="card">بطاقة</option>
            <option value="bank">تحويل بنكي</option>
            <option value="wallet">محفظة</option>
          </select>
        </div>
        <div class="v2-vd-field">
          <label>ملاحظات</label>
          <textarea id="v2-vd-col-notes" class="v2-vd-input" rows="2" placeholder="ملاحظات..."></textarea>
        </div>
        <div class="v2-vd-collect-actions">
          <button class="v2-vd-action v2-vd-action-primary" id="v2-vd-col-save">💰 تأكيد التحصيل</button>
          <button class="v2-vd-action" id="v2-vd-col-cancel">إلغاء</button>
        </div>
      </div>
    </div>
  </div>`;

  _bindEvents(container, visit);
}

function _timelineItem(t) {
  const ts = new Date(t.timestamp);
  const timeStr = ts.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const icons = {
    visit_opened: '🟢',
    visit_closed: '🔴',
    visit_cancelled: '❌',
    order_created: '📄',
    collection: '💰',
    note_added: '📝',
  };
  const labels = {
    visit_opened: 'فتح الزيارة',
    visit_closed: 'إغلاق الزيارة',
    visit_cancelled: 'إلغاء الزيارة',
    order_created: 'إنشاء طلب',
    collection: 'تحصيل',
    note_added: 'إضافة ملاحظة',
  };

  let detail = '';
  if (t.type === 'order_created' && t.data?.order_number) detail = `فاتورة ${t.data.order_number}`;
  if (t.type === 'collection' && t.data) detail = `${_money(t.data.amount)} - ${t.data.method === 'cash' ? 'نقداً' : t.data.method === 'card' ? 'بطاقة' : t.data.method}`;
  if (t.type === 'note_added' && t.data?.text) detail = t.data.text;

  return `<div class="v2-vd-tl-item">
    <span class="v2-vd-tl-icon">${icons[t.type] || '●'}</span>
    <div class="v2-vd-tl-body">
      <div class="v2-vd-tl-title">${labels[t.type] || t.type}</div>
      ${detail ? `<div class="v2-vd-tl-detail">${_e(detail)}</div>` : ''}
      <div class="v2-vd-tl-time">${timeStr}</div>
    </div>
  </div>`;
}

function _collectionCard(c) {
  const methodLabels = { cash: 'نقداً', card: 'بطاقة', bank: 'تحويل بنكي', wallet: 'محفظة' };
  return `<div class="v2-vd-col-card">
    <div class="v2-vd-col-amount">${_money(c.amount)}</div>
    <div class="v2-vd-col-method">${methodLabels[c.method] || c.method}</div>
    ${c.notes ? `<div class="v2-vd-col-notes">${_e(c.notes)}</div>` : ''}
  </div>`;
}

function _bindEvents(container, visit) {
  const active = getActiveVisit();
  const isCurrent = active?.id === visit.id;

  // Save notes
  container.querySelector('#v2-vd-save-note')?.addEventListener('click', () => {
    const notes = container.querySelector('#v2-vd-notes')?.value || '';
    addVisitNote(visit.id, notes);
    const btn = container.querySelector('#v2-vd-save-note');
    btn.textContent = '✓ تم';
    setTimeout(() => { btn.textContent = 'حفظ'; }, 2000);
  });

  // Order
  container.querySelector('#v2-vd-order-btn')?.addEventListener('click', () => {
    setSelectedCustomer({ id: visit.customer_id, name: visit.customer_name });
    setCustomerJustSelected(visit.customer_name);
    location.hash = '#products';
  });

  // Collect modal
  container.querySelector('#v2-vd-collect-btn')?.addEventListener('click', () => {
    const modal = container.querySelector('#v2-vd-collect-modal');
    if (modal) modal.style.display = '';
  });
  container.querySelector('#v2-vd-collect-overlay')?.addEventListener('click', () => {
    const modal = container.querySelector('#v2-vd-collect-modal');
    if (modal) modal.style.display = 'none';
  });
  container.querySelector('#v2-vd-col-cancel')?.addEventListener('click', () => {
    const modal = container.querySelector('#v2-vd-collect-modal');
    if (modal) modal.style.display = 'none';
  });
  container.querySelector('#v2-vd-col-save')?.addEventListener('click', async () => {
    const amount = parseFloat(container.querySelector('#v2-vd-col-amount')?.value || '0');
    const method = container.querySelector('#v2-vd-col-method')?.value || 'cash';
    const notes = container.querySelector('#v2-vd-col-notes')?.value || '';
    if (amount <= 0) { alert('أدخل مبلغ صحيح'); return; }
    const btn = container.querySelector('#v2-vd-col-save');
    btn.textContent = 'جاري...';
    btn.disabled = true;
    try {
      await addCollection(visit.id, amount, method, notes);
      const modal = container.querySelector('#v2-vd-collect-modal');
      if (modal) modal.style.display = 'none';
      renderVisitDetail(container, { visitId: visit.id });
    } catch {
      btn.textContent = '💰 تأكيد التحصيل';
      btn.disabled = false;
    }
  });

  // End visit
  container.querySelector('#v2-vd-end-btn')?.addEventListener('click', async () => {
    if (!confirm('إنهاء الزيارة؟')) return;
    await completeVisit();
    renderVisitDetail(container, { visitId: visit.id });
  });
}

function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _gpsAccuracyHTML(level, meters) {
  const m = meters != null ? ` (${meters}m)` : '';
  const map = {
    excellent: '🟢 ممتاز',
    accurate: '🟢 دقيق',
    good: '🟡 جيد',
    weak: '🟠 ضعيف',
    rejected: '🔴 مرفوض',
    none: '⚪ غير متاح',
  };
  return `${map[level] || map.none}${m}`;
}
