import { getVisits, getActiveVisit, formatDuration, VISIT_STATUS, visitStatusLabel, visitStatusIcon } from '../../../../services/storefront/visitsApi.js';

export async function renderVisitsList(container) {
  container.innerHTML = '<div class="v2-vl"><div class="v2-vl-loading">جاري تحميل الزيارات...</div></div>';
  try {
    const visits = getVisits();
    _render(container, visits);
  } catch {
    container.innerHTML = '<div class="v2-vl"><div class="v2-vl-error"><p>فشل تحميل الزيارات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderVisitsList(container));
  }
}

function _render(container, visits) {
  const active = getActiveVisit();

  if (!visits.length) {
    container.innerHTML = '<div class="v2-vl"><div class="v2-vl-empty"><p>لا توجد زيارات بعد</p><p class="v2-vl-hint">اختر عميلاً وابدأ زيارة ميدانية</p></div></div>';
    return;
  }

  const stats = {
    active: visits.filter(v => v.status === 'active').length,
    completed: visits.filter(v => v.status === 'completed').length,
    cancelled: visits.filter(v => v.status === 'cancelled').length,
    totalOrders: visits.reduce((s, v) => s + (v.total_orders || 0), 0),
    totalCollected: visits.reduce((s, v) => s + (v.total_collected_amount || 0), 0),
  };

  container.innerHTML = `<div class="v2-vl">
    <div class="v2-vl-header">
      <h2>الزيارات الميدانية</h2>
      <span class="v2-vl-count">${visits.length} زيارة</span>
    </div>
    <div class="v2-vl-stats-row">
      <div class="v2-vl-s v2-vl-s-blue"><span class="v2-vl-sv">${stats.active}</span><span class="v2-vl-sl">${visitStatusLabel('active')}</span></div>
      <div class="v2-vl-s v2-vl-s-green"><span class="v2-vl-sv">${stats.completed}</span><span class="v2-vl-sl">${visitStatusLabel('completed')}</span></div>
      <div class="v2-vl-s v2-vl-s-amber"><span class="v2-vl-sv">${stats.totalOrders}</span><span class="v2-vl-sl">طلبات</span></div>
      <div class="v2-vl-s v2-vl-s-purple"><span class="v2-vl-sv">${_money(stats.totalCollected)}</span><span class="v2-vl-sl">تحصيل</span></div>
    </div>
    <div class="v2-vl-cards">${visits.map(v => _card(v)).join('')}</div>
  </div>`;

  container.querySelectorAll('[data-link]').forEach(el => {
    el.addEventListener('click', () => { location.hash = el.dataset.link; });
  });
}

function _card(v) {
  const d = new Date(v.opened_at);
  const ds = d.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const ts = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  const dur = v.status === 'active' ? 'جارية' : formatDuration(v.duration_ms);
  const isActive = v.status === 'active';

  const gpsIcons = { excellent: '🟢', accurate: '🟢', good: '🟡', weak: '🟠', rejected: '🔴', none: '⚪' };
  const gpsLabels = { excellent: 'ممتاز', accurate: 'دقيق', good: 'جيد', weak: 'ضعيف', rejected: 'مرفوض', none: 'بدون GPS' };
  const gpsIcon = gpsIcons[v.gps_accuracy] || '⚪';
  const gpsLabel = gpsLabels[v.gps_accuracy] || 'غير معروف';

  const badgeClassMap = { active: 'v2-vl-badge-blue', completed: 'v2-vl-badge-green', cancelled: 'v2-vl-badge-gray' };

  return `<div class="v2-vl-card ${isActive ? 'v2-vl-card-active' : ''}" data-link="#visits/${v.id}">
    <div class="v2-vl-card-top">
      <div class="v2-vl-card-h">
        <strong class="v2-vl-card-name">${_e(v.customer_name)}</strong>
        <span class="v2-vl-badge ${badgeClassMap[v.status] || ''}">${visitStatusIcon(v.status)} ${visitStatusLabel(v.status)}</span>
      </div>
      <div class="v2-vl-card-sub">
        <span>${ds} · ${ts}</span>
        <span class="v2-vl-card-dur">${dur}</span>
      </div>
    </div>
    <div class="v2-vl-card-mid">
      <span class="v2-vl-card-stat">📄 ${v.total_orders || 0} طلب</span>
      <span class="v2-vl-card-stat">💰 ${_money(v.total_collected_amount || 0)}</span>
      <span class="v2-vl-card-stat" title="دقة GPS">${gpsIcon} ${gpsLabel}</span>
    </div>
    ${v.status === 'active' ? '<div class="v2-vl-card-active-pulse">● جاري الآن</div>' : ''}
  </div>`;
}

function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
