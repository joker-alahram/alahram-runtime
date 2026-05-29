import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { transitionOffer, createOffer, deleteOffer, resolveAutomaticState, getCampaignStates, validateTransition } from '../../../services/runtime/campaignLifecycle.js';
import { getTraces, getMetrics } from '../../../services/runtime/runtimeTelemetry.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  return h;
}

function _id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const OFFER_TYPES = [
  { value: 'daily_deal', label: 'صفقة اليوم', icon: '🔥' },
  { value: 'flash_offer', label: 'عرض الساعة', icon: '⚡' },
  { value: 'regular', label: 'عرض عادي', icon: '🏷️' },
];

const STATE_LABELS = {
  draft: { label: 'مسودة', badge: 'v2-badge-warn' },
  scheduled: { label: 'مجدول', badge: 'v2-badge-info' },
  live: { label: 'نشط', badge: 'v2-badge-ok' },
  paused: { label: 'متوقف', badge: 'v2-badge-no' },
  exhausted: { label: 'مستنفذ', badge: 'v2-badge-no' },
  expired: { label: 'منتهي', badge: 'v2-badge-no' },
  archived: { label: 'مؤرشف', badge: 'v2-badge-warn' },
};

export async function renderOpsCampaigns(container) {
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    const [offers] = await Promise.all([
      fetch(`${API}/offers?select=*,offer_items(*)&order=created_at.desc`, { headers: _h() }).then(r => r.ok ? r.json() : []),
    ]);

    const now = new Date();
    const computedOffers = offers.map(o => ({ ...o, _computedState: resolveAutomaticState(o, now) }));
    const liveOffers = computedOffers.filter(o => o._computedState === 'live');
    const dailyDealActive = liveOffers.filter(o => o.offer_type === 'daily_deal');
    const flashOfferActive = liveOffers.filter(o => o.offer_type === 'flash_offer');
    const traces = getTraces(5);
    const metrics = getMetrics();

    container.innerHTML = `<div class="v2-ops-page" style="max-width:1200px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
        <h2 style="font-size:1.125rem;font-weight:700">🎯 إدارة الحملات</h2>
        <button class="v2-ops-btn v2-ops-btn-primary" id="v2-campaign-create">+ حملة جديدة</button>
      </div>

      <!-- Runtime Metrics -->
      <div class="v2-dash-grid" style="grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));margin-bottom:1rem">
        <div class="v2-dash-card v2-dash-card-0"><div class="v2-dash-ico">🔥</div><div class="v2-dash-num">${_n(dailyDealActive.length)}</div><div class="v2-dash-lbl">صفقات نشطة</div></div>
        <div class="v2-dash-card v2-dash-card-3"><div class="v2-dash-ico">⚡</div><div class="v2-dash-num">${_n(flashOfferActive.length)}</div><div class="v2-dash-lbl">عروض الساعة</div></div>
        <div class="v2-dash-card v2-dash-card-1"><div class="v2-dash-ico">🏷️</div><div class="v2-dash-num">${_n(liveOffers.length)}</div><div class="v2-dash-lbl">العروض النشطة</div></div>
        <div class="v2-dash-card v2-dash-card-2"><div class="v2-dash-ico">📊</div><div class="v2-dash-num">${_n(offers.length)}</div><div class="v2-dash-lbl">إجمالي الحملات</div></div>
      </div>

      <!-- System Health -->
      <div class="v2-ops-campaign-health" style="display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap">
        <span class="v2-ops-health-badge" style="background:#fef3c7;color:#92400e;padding:.25rem .75rem;border-radius:999px;font-size:.75rem">⏳ عمليات البيئة: ${_n(metrics['campaign_transition']?.count || 0)}</span>
        <span class="v2-ops-health-badge" style="background:#fee2e2;color:#991b1b;padding:.25rem .75rem;border-radius:999px;font-size:.75rem">❌ تعقب فاشل: ${_n(metrics['failed_events']?.total || 0)}</span>
        <span class="v2-ops-health-badge" style="background:#fef3c7;color:#92400e;padding:.25rem .75rem;border-radius:999px;font-size:.75rem">🔄 آخر الأحداث: ${traces.length ? _d(new Date(traces[traces.length-1].ts)) : '—'}</span>
      </div>

      <!-- State Filter Tabs -->
      <div class="v2-ops-tabs" style="display:flex;gap:.25rem;margin-bottom:1rem;overflow-x:auto">
        <button class="v2-ops-tab v2-ops-tab-active" data-state="all">الكل (${offers.length})</button>
        ${OFFER_TYPES.map(t => `<button class="v2-ops-tab" data-state="${t.value}">${t.icon} ${t.label} (${computedOffers.filter(o => o.offer_type === t.value).length})</button>`).join('')}
      </div>

      <!-- Campaign Table -->
      <div class="v2-inv-scroll"><table class="v2-inv-tbl" id="v2-campaign-tbl">
        <thead><tr><th>النوع</th><th>العنوان</th><th>السعر</th><th>الكمية</th><th>المبيعات</th><th>الحالة</th><th>البداية</th><th>النهاية</th><th>إجراءات</th></tr></thead>
        <tbody>${computedOffers.map(o => _row(o, now)).join('')}</tbody>
      </table></div>

      <!-- Create Modal -->
      <div class="v2-modal-overlay" id="v2-campaign-modal" style="display:none">
        <div class="v2-modal" style="background:#fff;border-radius:12px;max-width:500px;margin:2rem auto;padding:1.5rem;box-shadow:0 20px 60px rgba(0,0,0,.3)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <h3 style="font-size:1rem;font-weight:700">حملة جديدة</h3>
            <button class="v2-modal-close" style="border:none;background:none;font-size:1.25rem;cursor:pointer">✕</button>
          </div>
          <form id="v2-campaign-form" style="display:flex;flex-direction:column;gap:.75rem">
            <label style="font-size:.8125rem;font-weight:600">نوع الحملة
              <select name="offer_type" required style="display:block;width:100%;margin-top:.25rem;padding:.5rem;border:1px solid #d1d5db;border-radius:8px;font-size:.875rem">
                ${OFFER_TYPES.map(t => `<option value="${t.value}">${t.icon} ${t.label}</option>`).join('')}
              </select>
            </label>
            <label style="font-size:.8125rem;font-weight:600">العنوان
              <input name="title" required style="display:block;width:100%;margin-top:.25rem;padding:.5rem;border:1px solid #d1d5db;border-radius:8px;font-size:.875rem">
            </label>
            <label style="font-size:.8125rem;font-weight:600">سعر العرض
              <input name="offer_price" type="number" step="0.01" required style="display:block;width:100%;margin-top:.25rem;padding:.5rem;border:1px solid #d1d5db;border-radius:8px;font-size:.875rem">
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
              <label style="font-size:.8125rem;font-weight:600">تاريخ البدء
                <input name="starts_at" type="datetime-local" style="display:block;width:100%;margin-top:.25rem;padding:.5rem;border:1px solid #d1d5db;border-radius:8px;font-size:.875rem">
              </label>
              <label style="font-size:.8125rem;font-weight:600">تاريخ الانتهاء
                <input name="ends_at" type="datetime-local" style="display:block;width:100%;margin-top:.25rem;padding:.5rem;border:1px solid #d1d5db;border-radius:8px;font-size:.875rem">
              </label>
            </div>
            <label style="font-size:.8125rem;font-weight:600">الكمية الإجمالية
              <input name="total_quantity" type="number" style="display:block;width:100%;margin-top:.25rem;padding:.5rem;border:1px solid #d1d5db;border-radius:8px;font-size:.875rem">
            </label>
            <label style="font-size:.8125rem;font-weight:600">الوصف
              <textarea name="description" rows="2" style="display:block;width:100%;margin-top:.25rem;padding:.5rem;border:1px solid #d1d5db;border-radius:8px;font-size:.875rem;resize:vertical"></textarea>
            </label>
            <div style="display:flex;gap:.5rem">
              <label style="font-size:.8125rem;display:flex;align-items:center;gap:.25rem"><input name="show_countdown" type="checkbox" value="true"> عرض العداد</label>
              <label style="font-size:.8125rem;display:flex;align-items:center;gap:.25rem"><input name="is_active" type="checkbox" value="true" checked> نشط</label>
            </div>
            <button type="submit" class="v2-ops-btn v2-ops-btn-primary" style="margin-top:.5rem">إنشاء الحملة</button>
          </form>
        </div>
      </div>
    </div>`;

    _bindTabs(container, computedOffers);
    _bindModal(container);
    _bindTransitions(container);
    _bindDelete(container);
  } catch (e) {
    console.warn('[campaigns] render error', e.message);
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل الحملات</p><button class="v2-retry" id="v2-campaign-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('#v2-campaign-retry')?.addEventListener('click', () => renderOpsCampaigns(container));
  }
}

function _row(o, now) {
  const typeMeta = OFFER_TYPES.find(t => t.value === o.offer_type) || OFFER_TYPES[2];
  const cs = o._computedState || 'draft';
  const st = STATE_LABELS[cs] || STATE_LABELS.draft;
  const start = o.starts_at ? new Date(o.starts_at) : null;
  const end = o.ends_at ? new Date(o.ends_at) : null;

  const transitions = { draft: 'scheduled', scheduled: 'live', live: 'paused', paused: 'live' };
  const nextAction = transitions[cs];
  const nextLabel = { scheduled: 'تفعيل', live: 'إيقاف', paused: 'تشغيل', draft: 'جدولة' };
  const canTransition = cs !== 'expired' && cs !== 'archived' && cs !== 'exhausted' && nextAction;

  return `<tr data-offer-id="${o.id}">
    <td><span style="font-size:1.25rem">${typeMeta.icon}</span></td>
    <td><strong>${_e(o.title)}</strong>${o.description ? `<div style="font-size:.75rem;color:#6b7280">${_e(o.description.slice(0, 60))}</div>` : ''}</td>
    <td>${_money(o.offer_price)}</td>
    <td>${o.total_quantity != null ? _n(o.total_quantity) : '—'}</td>
    <td>${_n(o.sold_quantity || 0)}</td>
    <td><span class="v2-badge ${st.badge}">${st.label}</span></td>
    <td style="font-size:.75rem">${start ? _d(start) : '—'}</td>
    <td style="font-size:.75rem">${end ? _d(end) : '—'}</td>
    <td style="display:flex;gap:.25rem;flex-wrap:wrap">
      ${canTransition ? `<button class="v2-ops-btn-sm v2-campaign-transition" data-id="${o.id}" data-to="${nextAction}" data-active="${o.is_active}" data-starts="${o.starts_at || ''}" data-ends="${o.ends_at || ''}" style="padding:.25rem .5rem;font-size:.75rem;border-radius:6px;border:1px solid #d1d5db;background:${cs === 'live' ? '#fee2e2' : '#dcfce7'};cursor:pointer">${nextLabel[nextAction] || nextAction}</button>` : ''}
      <button class="v2-ops-btn-sm v2-campaign-delete" data-id="${o.id}" style="padding:.25rem .5rem;font-size:.75rem;border-radius:6px;border:1px solid #d1d5db;background:#f3f4f6;color:#ef4444;cursor:pointer">حذف</button>
    </td>
  </tr>`;
}

function _n(v) { if (v == null) return '0'; return Number(v).toLocaleString('en-US'); }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function _bindTabs(container, offers) {
  container.querySelectorAll('.v2-ops-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.v2-ops-tab').forEach(t => t.classList.remove('v2-ops-tab-active'));
      tab.classList.add('v2-ops-tab-active');
      const state = tab.dataset.state;
      const rows = container.querySelectorAll('#v2-campaign-tbl tbody tr');
      rows.forEach(row => {
        if (state === 'all') { row.style.display = ''; return; }
        const offer = offers.find(o => o.id === row.dataset.offerId);
        row.style.display = offer && offer.offer_type === state ? '' : 'none';
      });
    });
  });
}

function _bindModal(container) {
  const modal = container.querySelector('#v2-campaign-modal');
  const openBtn = container.querySelector('#v2-campaign-create');
  const closeBtn = container.querySelector('.v2-modal-close');
  openBtn?.addEventListener('click', () => modal.style.display = 'block');
  closeBtn?.addEventListener('click', () => modal.style.display = 'none');
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  const form = container.querySelector('#v2-campaign-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const offerData = {
      offer_type: fd.get('offer_type'),
      title: fd.get('title'),
      offer_price: parseFloat(fd.get('offer_price')),
      total_quantity: fd.get('total_quantity') ? parseFloat(fd.get('total_quantity')) : null,
      description: fd.get('description') || null,
      starts_at: fd.get('starts_at') ? new Date(fd.get('starts_at')).toISOString() : null,
      ends_at: fd.get('ends_at') ? new Date(fd.get('ends_at')).toISOString() : null,
      show_countdown: fd.get('show_countdown') === 'true',
      is_active: fd.get('is_active') === 'true',
      execution_priority: 0,
    };
    try {
      await createOffer(offerData);
      modal.style.display = 'none';
      renderOpsCampaigns(container);
    } catch (err) {
      alert('فشل إنشاء الحملة: ' + err.message);
    }
  });
}

function _bindTransitions(container) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.v2-campaign-transition');
    if (!btn) return;
    const id = btn.dataset.id;
    const to = btn.dataset.to;
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const offer = await transitionOffer(id, to, { skipActivation: to === 'live', offer: { is_active: btn.dataset.active === 'true', starts_at: btn.dataset.starts, ends_at: btn.dataset.ends } });
      renderOpsCampaigns(container);
    } catch (err) {
      alert('فشل تحديث الحالة: ' + err.message);
      renderOpsCampaigns(container);
    }
  });
}

function _bindDelete(container) {
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.v2-campaign-delete');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm('هل أنت متأكد من حذف هذه الحملة؟')) return;
    try {
      await deleteOffer(id);
      renderOpsCampaigns(container);
    } catch (err) {
      alert('فشل حذف الحملة: ' + err.message);
    }
  });
}
