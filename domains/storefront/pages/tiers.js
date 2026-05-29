import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

async function _fetch() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  const r = await fetch(readConfig().baseUrl + '/pricing_tiers?select=id,tier_code,tier_name,priority,is_active,tier_color,notes,minimum_order_amount,minimum_monthly_target&order=priority.asc', { headers: h });
  if (!r.ok) throw new Error('فشل تحميل الشرائح السعرية');
  return r.json();
}

export async function renderTiersPage(container) {
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل الشرائح السعرية...</div></div>';
  try {
    const tiers = await _fetch();
    if (!tiers.length) {
      container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا توجد شرائح سعرية</p></div></div>';
      return;
    }
    container.innerHTML = '<div class="v2-page"><div class="v2-tiers"><h1 class="v2-page-title">الشرائح السعرية</h1><div class="v2-tiers-grid" id="v2-tiers-grid"></div></div></div>';
    const grid = container.querySelector('#v2-tiers-grid');
    grid.innerHTML = tiers.map(t => _card(t)).join('');
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>فشل تحميل الشرائح السعرية</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderTiersPage(container));
  }
}

function _card(t) {
  return '<div class="v2-card v2-tier-card">'
    + '<div class="v2-card-body">'
    + '<div class="v2-tier-header">'
    + '<h3 class="v2-card-title">' + _e(t.tier_name) + '</h3>'
    + (t.is_active ? '<span class="v2-tier-default">نشط</span>' : '')
    + '</div>'
    + (t.tier_code ? '<div class="v2-tier-code">' + _e(t.tier_code) + '</div>' : '')
    + (t.minimum_monthly_target ? '<div class="v2-tier-discount">الحد الأدنى: ' + t.minimum_monthly_target + '</div>' : '')
    + (t.notes ? '<div class="v2-tier-desc">' + _e(t.notes) + '</div>' : '')
    + '</div></div>';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
