import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { getCartRaw } from '../../../services/storefront/cartApi.js';

const API = readConfig().baseUrl;
const RV_KEY = 'v2_recently_viewed';

const STATUS_LABELS = { submitted: 'تم الإرسال', reserved: 'تم التأكيد', pending: 'قيد الانتظار', reviewing: 'قيد المراجعة', approved: 'معتمد', preparing: 'قيد التجهيز', dispatched: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي' };
const COMPANY_GRADIENTS = ['#0d2b6b','#1a4a9e','#2563eb','#059669','#d97706','#7c3aed','#dc2626','#0891b2'];
const STATUS_FILTERS = { daily_deal: { offer_type: 'eq.daily_deal' }, flash_offer: { offer_type: 'eq.flash_offer' }, regular: { offer_type: 'eq.regular' } };

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  return h;
}

function _fetch(url) {
  return fetch(`${API}/${url}`, { headers: _h() }).then(r => r.ok ? r.json() : []);
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
function _n(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US'); }

function _recentlyViewed() {
  try { return JSON.parse(localStorage.getItem(RV_KEY)) || []; } catch { return []; }
}

function _addToRecentlyViewed(product) {
  if (!product?.id) return;
  try {
    let rv = _recentlyViewed().filter(p => p.id !== product.id);
    rv.unshift({ id: product.id, name: product.product_name, img: product.product_image_url, code: product.product_code });
    if (rv.length > 20) rv = rv.slice(0, 20);
    localStorage.setItem(RV_KEY, JSON.stringify(rv));
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

export { _addToRecentlyViewed };

export async function renderHome(contentEl) {
  const ses = getSession();
  const raw = getCartRaw();
  const count = raw.reduce((s, i) => s + i.qty, 0);
  const isAuth = ses?.status === 'authenticated';

  let companies = [], products = [], dailyDeal = [], flashOffer = [], specialOffers = [], mostRequested = [];

  try {
    const results = await Promise.all([
      _fetch('companies?select=id,company_name,company_code,company_logo_url&is_active=eq.true&limit=20').catch(() => []),
      _fetch('products?select=id,product_name,product_code,product_image_url,company_name_snapshot&is_active=eq.true&limit=12&order=created_at.desc').catch(() => []),
      isAuth ? _fetch('offers?select=id,title,offer_type,offer_price,description,banner_image_url,starts_at,ends_at,show_countdown&is_active=eq.true&offer_type=eq.daily_deal&limit=3').catch(() => []) : Promise.resolve([]),
      isAuth ? _fetch('offers?select=id,title,offer_type,offer_price,description,banner_image_url,starts_at,ends_at,show_countdown&is_active=eq.true&offer_type=eq.flash_offer&limit=3').catch(() => []) : Promise.resolve([]),
      isAuth ? _fetch('offers?select=id,title,offer_type,offer_price,description,banner_image_url,starts_at,ends_at,show_countdown&is_active=eq.true&offer_type=eq.regular&limit=6').catch(() => []) : Promise.resolve([]),
      _fetch('order_items?select=product_id,product_name_snapshot&limit=100&order=created_at.desc').catch(() => []),
    ]);
    companies = results[0]; products = results[1]; dailyDeal = results[2]; flashOffer = results[3]; specialOffers = results[4];
    {
      const agg = {};
      for (const item of results[5]) {
        if (!item.product_id) continue;
        if (!agg[item.product_id]) agg[item.product_id] = { product_id: item.product_id, product_name_snapshot: item.product_name_snapshot, count: 0 };
        agg[item.product_id].count++;
        if (item.product_name_snapshot) agg[item.product_id].product_name_snapshot = item.product_name_snapshot;
      }
      mostRequested = Object.values(agg).sort((a, b) => b.count - a.count).slice(0, 10);
    }
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }

  const rv = _recentlyViewed();

  contentEl.innerHTML = `<div class="v2-storefront">
    <div class="v2-home-hero">
      <h1>متجر الأهرام</h1>
      <p>${isAuth ? `مرحباً ${_e(ses.actor?.fullName || '')}` : 'مرحباً بكم في متجر الأهرام'}</p>
      <div class="v2-home-search">
        <span class="v2-home-search-icon">🔍</span>
        <input type="text" placeholder="ابحث عن المنتجات..." id="v2-home-search-input">
      </div>
    </div>

    <div class="v2-home-quick-actions">
      ${isAuth ? '<a href="#customers" class="v2-home-qa"><span>👥</span>عملائي</a>' : ''}
      ${isAuth ? '<a href="#invoices" class="v2-home-qa"><span>📄</span>فواتيري</a>' : ''}
      ${isAuth ? '<a href="#offers" class="v2-home-qa"><span>🏷️</span>العروض</a>' : ''}
      <a href="#products" class="v2-home-qa"><span>📦</span>المنتجات</a>
      <a href="#cart" class="v2-home-qa"><span>🛒</span>السلة${count ? ` (${count})` : ''}</a>
    </div>

    ${dailyDeal.length ? `<div class="v2-home-section">
      <div class="v2-home-section-header"><h2>🔥 عروض اليوم</h2><a href="#dailydeal">عرض الكل</a></div>
      <div class="v2-home-hscroll">${dailyDeal.map(o => `<a href="#dailydeal" class="v2-home-offer-card" style="border-color:#ef4444;background:#fef2f2">
        <span style="font-size:1.75rem">🔥</span>
        <div class="v2-home-offer-title">${_e(o.title)}</div>
        ${o.offer_price != null ? `<div class="v2-home-offer-price">${_money(o.offer_price)}</div>` : ''}
        ${o.ends_at ? `<div class="v2-home-offer-timer" data-ends="${o.ends_at}">حتى ${_d(o.ends_at)}</div>` : ''}
      </a>`).join('')}</div>
    </div>` : ''}

    ${flashOffer.length ? `<div class="v2-home-section">
      <div class="v2-home-section-header"><h2>⚡ عروض فلاش</h2><a href="#flashoffer">عرض الكل</a></div>
      <div class="v2-home-hscroll">${flashOffer.map(o => `<a href="#flashoffer" class="v2-home-offer-card" style="border-color:#f59e0b;background:#fffbeb">
        <span style="font-size:1.75rem">⚡</span>
        <div class="v2-home-offer-title">${_e(o.title)}</div>
        ${o.offer_price != null ? `<div class="v2-home-offer-price">${_money(o.offer_price)}</div>` : ''}
        ${o.starts_at && o.ends_at ? `<div class="v2-home-offer-timer">${_d(o.starts_at)} — ${_d(o.ends_at)}</div>` : ''}
      </a>`).join('')}</div>
    </div>` : ''}

    ${companies.length ? `<div class="v2-home-section">
      <div class="v2-home-section-header"><h2>الشركات</h2><a href="#companies">عرض الكل</a></div>
      <div class="v2-home-hscroll">${companies.map((c, i) => {
        const initial = c.company_name ? _e(c.company_name[0]) : 'ش';
        return `<a href="#company/${c.id}" class="v2-home-company-card">
          <div class="v2-home-company-logo" style="background:${COMPANY_GRADIENTS[i % COMPANY_GRADIENTS.length]}">${initial}</div>
          <div class="v2-home-company-name">${_e(c.company_name)}</div>
          ${c.company_code ? `<div class="v2-home-company-count">${_e(c.company_code)}</div>` : ''}
        </a>`;
      }).join('')}</div>
    </div>` : ''}

    ${mostRequested.length ? `<div class="v2-home-section">
      <div class="v2-home-section-header"><h2>الأكثر طلباً</h2><a href="#products">عرض الكل</a></div>
      <div class="v2-home-grid">${mostRequested.slice(0, 6).map(p => `<a href="#products/${p.product_id}" class="v2-home-product-card v2-home-product-card-sm">
        <div class="v2-home-product-body">
          <div class="v2-home-product-name" style="font-size:.8125rem">${_e(p.product_name_snapshot || 'منتج')}</div>
          <div class="v2-home-product-price">${_n(p.count || 0)} طلب</div>
        </div>
      </a>`).join('')}</div>
    </div>` : ''}

    ${products.length ? `<div class="v2-home-section">
      <div class="v2-home-section-header"><h2>🆕 أحدث المنتجات</h2><a href="#products">عرض الكل</a></div>
      <div class="v2-home-grid">${products.map(p => {
        const img = p.product_image_url || '';
        const initial = p.product_name ? _e(p.product_name[0]) : 'ش';
        return `<a href="#products/${p.id}" class="v2-home-product-card">
          <div class="v2-home-product-img">${img ? `<img src="${_e(img)}" alt="${_e(p.product_name)}" loading="lazy">` : `<span style="font-size:2rem;opacity:.3">${initial}</span>`}</div>
          <div class="v2-home-product-body">
            <div class="v2-home-product-name">${_e(p.product_name)}</div>
            ${p.company_name_snapshot ? `<div style="font-size:.6875rem;color:var(--v2-text2);margin-top:.125rem">${_e(p.company_name_snapshot)}</div>` : ''}
            <div class="v2-home-product-price v2-pc-price-loading">—</div>
          </div>
        </a>`;
      }).join('')}</div>
    </div>` : ''}

    ${specialOffers.length ? `<div class="v2-home-section">
      <div class="v2-home-section-header"><h2>عروض خاصة</h2><a href="#offers">عرض الكل</a></div>
      <div class="v2-home-hscroll">${specialOffers.map(o => `<a href="#offers" class="v2-home-offer-card" style="border-color:#8b5cf6;background:#f5f3ff">
        <span style="font-size:1.75rem">🏷️</span>
        <div class="v2-home-offer-title">${_e(o.title)}</div>
        ${o.offer_price != null ? `<div class="v2-home-offer-price">${_money(o.offer_price)}</div>` : ''}
        ${o.description ? `<div style="font-size:.6875rem;color:var(--v2-text2)">${_e(o.description.slice(0, 40))}</div>` : ''}
      </a>`).join('')}</div>
    </div>` : ''}

    ${rv.length ? `<div class="v2-home-section">
      <div class="v2-home-section-header"><h2>🕒 تم التصفح مؤخراً</h2></div>
      <div class="v2-home-hscroll">${rv.slice(0, 8).map(p => `<a href="#products/${p.id}" class="v2-home-company-card" style="min-width:80px">
        <div style="font-size:1.25rem;margin-bottom:.25rem;text-align:center">📦</div>
        <div class="v2-home-company-name" style="font-size:.75rem">${_e(p.name || '')}</div>
      </a>`).join('')}</div>
    </div>` : ''}

    ${!isAuth ? `<div class="v2-home-section" style="text-align:center;padding:2rem 1rem">
      <p style="margin-bottom:1rem;color:var(--v2-text2)">سجل الدخول للاستفادة من العروض الحصرية والمتابعة</p>
      <a href="#login" class="v2-btn v2-btn-p" style="border-radius:12px;padding:.75rem 2rem;font-size:.9375rem">تسجيل الدخول</a>
      <a href="#register" class="v2-btn" style="border-radius:12px;padding:.75rem 2rem;font-size:.9375rem;margin-top:.5rem;display:inline-block;border:1px solid var(--v2-border);background:var(--v2-surface)">إنشاء حساب</a>
    </div>` : ''}

    <div style="height:5rem"></div>
    ${count > 0 ? `<button class="v2-home-cart-fab" onclick="location.hash='#cart'"><span>🛒</span><span class="v2-home-cart-fab-badge">${count > 99 ? '99+' : count}</span></button>` : ''}
  </div>`;

  contentEl.querySelector('#v2-home-search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      if (q) location.hash = `#search?q=${encodeURIComponent(q)}`;
    }
  });

  _lazyHomePrices(contentEl, products);
}

async function _lazyHomePrices(el, products) {
  if (!products.length) return;
  try {
    const ids = products.map(p => p.id);
    const r = await fetch(`${API}/rpc/resolve_product_prices_batch`, {
      method: 'POST',
      headers: _h(),
      body: JSON.stringify({ p_product_ids: ids, p_customer_id: null }),
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        _applyHomePrices(el, data);
        return;
      }
    }
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }

  try {
    const r = await fetch(`${API}/runtime_product_prices?product_id=in.(${products.map(p => p.id).join(',')})&select=product_id,final_price&limit=50`, { headers: _h() });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        _applyHomePrices(el, data);
        return;
      }
    }
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

function _applyHomePrices(el, data) {
  const byProduct = {};
  for (const p of data) {
    if (!byProduct[p.product_id]) byProduct[p.product_id] = { min: Infinity, max: 0 };
    const price = p.final_price ?? p.finalPrice ?? 0;
    if (price < byProduct[p.product_id].min) byProduct[p.product_id].min = price;
    if (price > byProduct[p.product_id].max) byProduct[p.product_id].max = price;
  }
  for (const [pid, range] of Object.entries(byProduct)) {
    const priceEl = el.querySelector(`a[href="#products/${pid}"] .v2-home-product-price`);
    if (!priceEl) continue;
    priceEl.textContent = range.min === range.max ? _money(range.min) : `من ${_money(range.min)}`;
    priceEl.className = 'v2-home-product-price';
  }
}
