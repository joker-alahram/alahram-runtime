import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

async function _fetch() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  const r = await fetch(readConfig().baseUrl + '/companies?select=id,company_name,company_code,company_logo_url,is_active&is_active=eq.true&order=company_name.asc', { headers: h });
  if (!r.ok) throw new Error('فشل تحميل الشركات');
  return r.json();
}

async function _fetchCounts() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Prefer: 'count=exact' };

  const r = await fetch(readConfig().baseUrl + '/products?select=id&limit=0', { headers: h });
  if (!r.ok) return 0;
  const cr = r.headers.get('content-range');
  return cr ? parseInt(cr.split('/')[1], 10) : 0;
}

const companyGradients = [
  ['#0d2b6b','#1a4a9e'], ['#059669','#10b981'], ['#d97706','#f59e0b'],
  ['#7c3aed','#8b5cf6'], ['#dc2626','#ef4444'], ['#0891b2','#06b6d4'],
  ['#be185d','#ec4899'], ['#1e40af','#3b82f6'],
];

export async function renderCompaniesPage(container) {
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل الشركات...</div></div>';
  try {
    const [companies, totalProducts] = await Promise.all([_fetch(), _fetchCounts()]);
    if (!companies.length) {
      container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا توجد شركات متاحة حالياً</p></div></div>';
      return;
    }
    container.innerHTML = `<div class="v2-page"><h1 class="v2-page-title">الشركات</h1><div class="v2-companies-grid" id="v2-companies-grid"></div></div>`;
    const grid = container.querySelector('#v2-companies-grid');
    grid.innerHTML = companies.map((c, i) => _card(c, i, totalProducts)).join('');

    grid.querySelectorAll('[data-company]').forEach(el => {
      el.addEventListener('click', () => { location.hash = '#company/' + el.dataset.company; });
    });
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>فشل تحميل الشركات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderCompaniesPage(container));
  }
}

function _card(c, i, totalProducts) {
  const img = c.company_logo_url || '';
  const initial = c.company_name ? _e(c.company_name[0]) : 'ش';
  const g = companyGradients[i % companyGradients.length];
  return `<div class="v2-company-card-pro" data-company="${c.id}" tabindex="0" role="button">
    <div class="v2-company-card-header" style="background:linear-gradient(135deg, ${g[0]} 0%, ${g[1]} 100%)">
      <div class="v2-company-card-logo" style="background:rgba(255,255,255,.25)">
        ${img ? `<img src="${_e(img)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<span style="color:#fff">${initial}</span>`}
      </div>
      <div class="v2-company-card-name" style="color:#fff">${_e(c.company_name)}</div>
      ${c.company_code ? `<div class="v2-company-card-code" style="color:rgba(255,255,255,.7)">${_e(c.company_code)}</div>` : ''}
    </div>
    <div class="v2-company-card-stats">
      <div class="v2-company-card-stat"><div class="v2-company-card-stat-num">${_n(totalProducts)}</div><div class="v2-company-card-stat-lbl">منتجات</div></div>
      <div class="v2-company-card-stat"><div class="v2-company-card-stat-num">—</div><div class="v2-company-card-stat-lbl">عروض</div></div>
    </div>
  </div>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _n(v) { if (v == null) return '0'; return Number(v).toLocaleString('en-US'); }
