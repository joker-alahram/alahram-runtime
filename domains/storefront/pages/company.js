import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

async function _fetchCompany(id) {
  const r = await fetch(readConfig().baseUrl + '/companies?select=id,company_name,company_code,company_logo_url,is_active&id=eq.' + id, { headers: _headers() });
  if (!r.ok) return null;
  const arr = await r.json();
  return arr.length ? arr[0] : null;
}

async function _fetchProducts(companyId) {
  const r = await fetch(readConfig().baseUrl + '/products?select=id,product_name,product_code,product_image_url,category,is_active&is_active=eq.true&company_id=eq.' + companyId + '&order=product_name.asc', { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

export async function renderCompanyPage(container, params) {
  const companyId = params?.companyId || params?.id || '';
  if (!companyId) {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>الشركة غير موجودة</p><a href="#companies" class="v2-btn v2-btn-p">عودة للشركات</a></div></div>';
    return;
  }
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل بيانات الشركة...</div></div>';
  try {
    const [company, products] = await Promise.all([_fetchCompany(companyId), _fetchProducts(companyId)]);
    if (!company) {
      container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>الشركة غير موجودة</p><a href="#companies" class="v2-btn v2-btn-p">عودة للشركات</a></div></div>';
      return;
    }
    _render(container, company, products);
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>فشل تحميل بيانات الشركة</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderCompanyPage(container, params));
  }
}

function _render(container, company, products) {
  const img = company.company_logo_url || '';
  const parts = [];
  parts.push('<div class="v2-page"><nav class="v2-back-nav"><a href="#companies" class="v2-back-link">← العودة للشركات</a></nav>');
  parts.push('<div class="v2-company-header">');
  if (img) {
    parts.push('<div class="v2-company-logo"><img src="' + _e(img) + '" alt=""></div>');
  } else {
    const initial = company.company_name ? _e(company.company_name[0]) : 'ش';
    parts.push('<div class="v2-company-logo v2-company-initial v2-company-logo-initial">' + initial + '</div>');
  }
  parts.push('<div class="v2-company-info">');
  parts.push('<h1 class="v2-page-title">' + _e(company.company_name) + '</h1>');
  if (company.company_code) parts.push('<div class="v2-company-code">' + _e(company.company_code) + '</div>');
  parts.push('</div></div>');

  parts.push('<div class="v2-company-products"><h2>المنتجات</h2>');
  if (!products.length) {
    parts.push('<div class="v2-empty"><p>لا توجد منتجات متاحة لهذه الشركة</p></div>');
  } else {
    parts.push('<div class="v2-products-grid">');
    parts.push(products.map(p => _productCard(p)).join(''));
    parts.push('</div>');
  }
  parts.push('</div></div>');
  container.innerHTML = parts.join('');
}

function _productCard(p) {
  const img = p.product_image_url || '';
  return '<a href="#products/' + p.id + '" class="v2-card v2-product-card">'
    + (img ? '<div class="v2-card-img"><img src="' + _e(img) + '" alt=""></div>' : '<div class="v2-card-img v2-card-img-placeholder">منتج</div>')
    + '<div class="v2-card-body">'
    + '<h3 class="v2-card-title">' + _e(p.product_name) + '</h3>'
    + (p.product_code ? '<div class="v2-card-code">' + _e(p.product_code) + '</div>' : '')
    + (p.category ? '<div class="v2-card-desc">' + _e(p.category) + '</div>' : '')
    + '</div></a>';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
