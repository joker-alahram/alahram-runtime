import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

export async function renderFlashOfferPage(container) {
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل عروض الساعة...</div></div>';
  try {
    const r = await fetch(`${API}/v_flash_offers_runtime?select=*&order=start_time.desc`, { headers: _h() });
    if (!r.ok) throw new Error('not_found');
    const offers = await r.json();
    if (!offers.length) {
      container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا توجد عروض ساعة حالياً</p></div></div>';
      return;
    }
    container.innerHTML = `<div class="v2-page"><h1 class="v2-page-title">عرض الساعة</h1><div class="v2-deals-grid">${offers.map(o => `
      <div class="v2-deal-card v2-flash-card">
        <div class="v2-flash-header">⏰ عرض الساعة</div>
        ${o.image ? `<img src="${_e(o.image)}" alt="${_e(o.title)}" class="v2-deal-img">` : '<div class="v2-deal-img-placeholder">⏰</div>'}
        <div class="v2-deal-body">
          <h3>${_e(o.title)}</h3>
          ${o.description ? `<p>${_e(o.description)}</p>` : ''}
          <div class="v2-deal-price">${_money(o.price)}</div>
          <div class="v2-flash-status">الحالة: ${o.runtime_status === 'active' ? 'متاح' : o.runtime_status === 'scheduled' ? 'قريباً' : 'منتهي'}</div>
          <button class="v2-btn v2-btn-p" style="border-radius:12px;width:100%" ${o.runtime_status !== 'active' ? 'disabled' : ''}>${o.runtime_status === 'active' ? 'شراء الآن' : 'غير متاح'}</button>
        </div>
      </div>
    `).join('')}</div></div>`;
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>عرض الساعة غير مفعل حالياً</p></div></div>';
  }
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
