import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

export async function renderDailyDealPage(container) {
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل صفقة اليوم...</div></div>';
  try {
    const r = await fetch(`${API}/v_daily_deals?select=*&order=id.desc`, { headers: _h() });
    if (!r.ok) throw new Error('not_found');
    const deals = await r.json();
    if (!deals.length) {
      container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا توجد صفقات اليوم</p></div></div>';
      return;
    }
    container.innerHTML = `<div class="v2-page"><h1 class="v2-page-title">صفقة اليوم</h1><div class="v2-deals-grid">${deals.map(d => `
      <div class="v2-deal-card">
        ${d.image ? `<img src="${_e(d.image)}" alt="${_e(d.title)}" class="v2-deal-img">` : '<div class="v2-deal-img-placeholder">🎯</div>'}
        <div class="v2-deal-body">
          <h3>${_e(d.title)}</h3>
          ${d.description ? `<p>${_e(d.description)}</p>` : ''}
          <div class="v2-deal-price">${_money(d.price)}</div>
          <button class="v2-btn v2-btn-p" style="border-radius:12px;width:100%">شراء</button>
        </div>
      </div>
    `).join('')}</div></div>`;
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>صفقة اليوم غير مفعلة حالياً</p></div></div>';
  }
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
