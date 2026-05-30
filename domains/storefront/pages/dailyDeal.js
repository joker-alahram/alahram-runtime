import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { productCardHtml, bindProductCards } from '../../../runtime/components/productCard.js';

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
    container.innerHTML = `<div class="v2-page"><h1 class="v2-page-title">صفقة اليوم</h1><div class="v2-pc-grid">${deals.map(d => _dealCard(d)).join('')}</div></div>`;
    const grid = container.querySelector('.v2-pc-grid');
    if (grid) bindProductCards(grid);
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>صفقة اليوم غير مفعلة حالياً</p></div></div>';
  }
}

function _dealCard(d) {
  return productCardHtml({
    pid: 'deal_' + d.id,
    name: d.title || 'صفقة اليوم',
    code: '',
    imageUrl: d.image || '',
    price: d.price != null ? d.price : null,
    offer: { type: 'daily_deal' },
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
