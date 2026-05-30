import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { productCardHtml, bindProductCards } from '../../../runtime/components/productCard.js';

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
    container.innerHTML = `<div class="v2-page"><h1 class="v2-page-title">عرض الساعة</h1><div class="v2-pc-grid">${offers.map(o => _offerCard(o)).join('')}</div></div>`;
    const grid = container.querySelector('.v2-pc-grid');
    if (grid) bindProductCards(grid);
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>عرض الساعة غير مفعل حالياً</p></div></div>';
  }
}

function _offerCard(o) {
  const canBuy = o.runtime_status === 'active';
  return productCardHtml({
    pid: 'flash_' + o.id,
    name: o.title || 'عرض الساعة',
    code: '',
    imageUrl: o.image || '',
    price: o.price != null ? o.price : null,
    disabled: !canBuy,
    offer: { type: 'flash_offer' },
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
