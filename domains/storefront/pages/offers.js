import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

async function _fetch() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  // Try with known-working columns first; fallback if schema unknown
  try {
    const r = await fetch(readConfig().baseUrl + '/offers?select=id,title,offer_type,offer_price,description,banner_image_url,starts_at,ends_at,is_active,availability_status,show_countdown&is_active=eq.true&limit=20&order=execution_priority.asc.nullslast,created_at.desc', { headers: h });
    if (r.ok) return r.json();
  } catch { /* fallback */ }
  return [];
}

export async function renderOffersPage(container) {
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل العروض...</div></div>';
  try {
    const offers = await _fetch();
    if (!offers.length) {
      container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا توجد عروض متاحة حالياً</p></div></div>';
      return;
    }
    container.innerHTML = '<div class="v2-page"><div class="v2-offers"><h1 class="v2-page-title">العروض</h1><div class="v2-offers-grid" id="v2-offers-grid"></div></div></div>';
    const grid = container.querySelector('#v2-offers-grid');
    grid.innerHTML = offers.map(o => _card(o)).join('');
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا توجد عروض متاحة حالياً</p></div></div>';
  }
}

function _card(o) {
  const now = new Date();
  const start = o.starts_at ? new Date(o.starts_at) : null;
  const end = o.ends_at ? new Date(o.ends_at) : null;
  let badge = '';
  if (start && end && start <= now && end >= now) badge = '<span class="v2-offer-badge v2-offer-active">فعال</span>';
  else if (end && end < now) badge = '<span class="v2-offer-badge v2-offer-expired">منتهي</span>';
  else if (start && start > now) badge = '<span class="v2-offer-badge v2-offer-upcoming">قادم</span>';

  return '<div class="v2-card v2-offer-card">'
    + '<div class="v2-card-body">'
    + '<div class="v2-offer-header">'
    + '<h3 class="v2-card-title">' + _e(o.title) + '</h3>'
    + badge
    + '</div>'
    + (o.offer_price != null ? '<div class="v2-offer-discount">' + _e(o.offer_type || 'عرض') + ' · ' + _money(o.offer_price) + '</div>' : '')
    + (o.description ? '<div class="v2-offer-desc">' + _e(o.description) + '</div>' : '')
    + '<div class="v2-offer-dates">'
    + (o.starts_at ? '<span>من ' + _e(o.starts_at.slice(0, 10)) + '</span>' : '')
    + (o.ends_at ? '<span>إلى ' + _e(o.ends_at.slice(0, 10)) + '</span>' : '')
    + '</div>'
    + '</div></div>';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
