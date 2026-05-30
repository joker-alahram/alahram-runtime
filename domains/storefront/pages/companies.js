import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  return { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
}

async function _fetchCompanies() {
  const r = await fetch(API + '/companies?select=id,company_name,company_code,company_logo_url,is_active&is_active=eq.true&order=company_name.asc', { headers: _h() });
  if (!r.ok) throw new Error('فشل تحميل الشركات');
  return r.json();
}

async function _fetchProductCounts() {
  const r = await fetch(API + '/products?select=id,company_id&is_active=eq.true&limit=0', { headers: Object.assign(_h(), { Prefer: 'count=exact' }) });
  if (!r.ok) return {};
  const cr = r.headers.get('content-range');
  return cr ? { _total: parseInt(cr.split('/')[1], 10) } : {};
}

async function _fetchCompanyOfferCounts() {
  try {
    const r = await fetch(API + '/offers?select=id,offer_type,offer_items!inner(product_id)&is_active=eq.true&offer_type=in.(daily_deal,flash_offer)&order=id.desc', { headers: _h() });
    if (!r.ok) return {};
    const offers = await r.json();
    if (!offers.length) return {};
    const productIds = new Set();
    for (const o of offers) {
      if (o.offer_items) {
        for (const item of o.offer_items) {
          if (item.product_id) productIds.add(item.product_id);
        }
      }
    }
    if (!productIds.size) return {};
    const idList = Array.from(productIds).join(',');
    const pr = await fetch(API + '/products?select=id,company_id&id=in.(' + idList + ')&is_active=eq.true', { headers: _h() });
    if (!pr.ok) return {};
    const products = await pr.json();
    const counts = {};
    for (const p of products) {
      if (p.company_id) {
        counts[p.company_id] = (counts[p.company_id] || 0) + 1;
      }
    }
    return counts;
  } catch { return {}; }
}

const companyGradients = [
  ['#0d2b6b','#1a4a9e'], ['#059669','#10b981'], ['#d97706','#f59e0b'],
  ['#7c3aed','#8b5cf6'], ['#dc2626','#ef4444'], ['#0891b2','#06b6d4'],
  ['#be185d','#ec4899'], ['#1e40af','#3b82f6'],
];

export async function renderCompaniesPage(container) {
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل الشركات...</div></div>';
  try {
    const [companies, counts, offerCounts] = await Promise.all([
      _fetchCompanies(),
      _fetchProductCounts(),
      _fetchCompanyOfferCounts(),
    ]);
    if (!companies.length) {
      container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا توجد شركات متاحة حالياً</p></div></div>';
      return;
    }
    var rows = [];
    rows.push('<div class="v2-page">');
    rows.push('<div class="v2-home-search" style="margin:1rem 1rem .5rem">');
    rows.push('<span class="v2-home-search-icon">🔍</span>');
    rows.push('<input type="text" placeholder="ابحث عن شركة..." id="v2-companies-search-input">');
    rows.push('</div>');
    rows.push('<div class="v2-companies-grid" id="v2-companies-grid">');
    rows.push(companies.map(function(c, i) { return _card(c, i, offerCounts[c.id] || 0); }).join(''));
    rows.push('</div></div>');
    container.innerHTML = rows.join('');

    container.querySelector('#v2-companies-search-input')?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var q = e.target.value.trim();
        if (q) location.hash = '#search?q=' + encodeURIComponent(q);
      }
    });

    container.querySelectorAll('[data-company]').forEach(function(el) {
      el.addEventListener('click', function() { location.hash = '#company/' + el.dataset.company; });
    });
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>فشل تحميل الشركات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', function() { renderCompaniesPage(container); });
  }
}

function _card(c, i, offerCount) {
  var img = c.company_logo_url || '';
  var initial = c.company_name ? _e(c.company_name[0]) : 'ش';
  var g = companyGradients[i % companyGradients.length];
  var offerBadge = offerCount > 0
    ? '<div class="v2-company-offer-badge">🔥 ' + offerCount + '</div>'
    : '';
  return '<div class="v2-company-card-pro" data-company="' + c.id + '" tabindex="0" role="button">'
    + '<div class="v2-company-card-header" style="background:linear-gradient(135deg, ' + g[0] + ' 0%, ' + g[1] + ' 100%)">'
    + offerBadge
    + '<div class="v2-company-card-logo" style="background:rgba(255,255,255,.25)">'
    + (img ? '<img src="' + _e(img) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">' : '<span style="color:#fff">' + initial + '</span>')
    + '</div>'
    + '<div class="v2-company-card-name" style="color:#fff">' + _e(c.company_name) + '</div>'
    + (c.company_code ? '<div class="v2-company-card-code" style="color:rgba(255,255,255,.7)">' + _e(c.company_code) + '</div>' : '')
    + '</div>'
    + '<div class="v2-company-card-stats">'
    + '<div class="v2-company-card-stat"><div class="v2-company-card-stat-num">—</div><div class="v2-company-card-stat-lbl">منتجات</div></div>'
    + '<div class="v2-company-card-stat"><div class="v2-company-card-stat-num">' + (offerCount > 0 ? offerCount : '—') + '</div><div class="v2-company-card-stat-lbl">عروض</div></div>'
    + '</div></div>';
}

function _e(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
