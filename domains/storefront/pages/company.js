import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { getProductPricesBatch, getProductStock } from '../../../services/storefront/productsApi.js';
import { productCardHtml, bindProductCards, setCardPrice, setCardUnit } from '../../../runtime/components/productCard.js';

var API = readConfig().baseUrl;

function _h() {
  var s = getSession();
  return { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
}

async function _fetchCompany(id) {
  var r = await fetch(API + '/companies?select=id,company_name,company_code,company_logo_url,is_active&id=eq.' + id, { headers: _h() });
  if (!r.ok) return null;
  var arr = await r.json();
  return arr.length ? arr[0] : null;
}

async function _fetchProducts(companyId) {
  var r = await fetch(API + '/products?select=id,product_name,product_code,product_image_url,category,company_name_snapshot,is_active&is_active=eq.true&company_id=eq.' + companyId + '&order=product_name.asc', { headers: _h() });
  if (!r.ok) return [];
  return r.json();
}

export async function renderCompanyPage(container, params) {
  var companyId = params && (params.companyId || params.id);
  if (!companyId || companyId === '') {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>الشركة غير موجودة</p><a href="#companies" class="v2-btn v2-btn-p">عودة للشركات</a></div></div>';
    return;
  }
  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل بيانات الشركة...</div></div>';
  try {
    var results = await Promise.all([_fetchCompany(companyId), _fetchProducts(companyId)]);
    var company = results[0], products = results[1];
    if (!company) {
      container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>الشركة غير موجودة</p><a href="#companies" class="v2-btn v2-btn-p">عودة للشركات</a></div></div>';
      return;
    }
    _render(container, company, products);
  } catch (e) {
    container.innerHTML = '<div class="v2-page"><div class="v2-error"><p>فشل تحميل بيانات الشركة</p><button class="v2-retry" id="v2-company-retry">إعادة المحاولة</button></div></div>';
    var btn = container.querySelector('#v2-company-retry');
    if (btn) btn.addEventListener('click', function() { renderCompanyPage(container, params); });
  }
}

function _render(container, company, products) {
  var img = company.company_logo_url || '';
  var initial = company.company_name ? _e(company.company_name[0]) : 'ش';
  var logoHtml = img
    ? '<div class="v2-company-logo"><img src="' + _e(img) + '" alt=""></div>'
    : '<div class="v2-company-logo v2-company-logo-initial">' + initial + '</div>';

  var categories = [];
  var seen = {};
  for (var pi = 0; pi < products.length; pi++) {
    var cat = products[pi].category;
    if (cat && !seen[cat]) { seen[cat] = true; categories.push(cat); }
  }
  categories.sort();

  var pillsHtml = '';
  if (categories.length > 0) {
    pillsHtml = '<div class="v2-company-pills" id="v2-company-pills">'
      + '<button class="v2-pill v2-pill-active" data-cat="">الكل</button>';
    for (var ci = 0; ci < categories.length; ci++) {
      pillsHtml += '<button class="v2-pill" data-cat="' + _e(categories[ci]) + '">' + _e(categories[ci]) + '</button>';
    }
    pillsHtml += '</div>';
  }

  var parts = [];
  parts.push('<div class="v2-page">');
  parts.push('<nav class="v2-back-nav"><a href="#companies" class="v2-back-link">← العودة للشركات</a></nav>');
  parts.push('<div class="v2-company-header">' + logoHtml + '<div class="v2-company-info">');
  parts.push('<h1 class="v2-page-title">' + _e(company.company_name) + '</h1>');
  if (company.company_code) parts.push('<div class="v2-company-code">' + _e(company.company_code) + '</div>');
  parts.push('</div></div>');

  parts.push('<div class="v2-home-search" style="margin:.75rem 1rem">');
  parts.push('<span class="v2-home-search-icon">🔍</span>');
  parts.push('<input type="text" placeholder="ابحث في منتجات ' + _e(company.company_name) + '..." id="v2-company-search-input">');
  parts.push('</div>');

  parts.push(pillsHtml);

  parts.push('<div class="v2-company-products">');
  if (!products.length) {
    parts.push('<div class="v2-empty"><p>لا توجد منتجات متاحة لهذه الشركة</p></div>');
  } else {
    parts.push('<div class="v2-pc-grid" id="v2-company-prod-grid">');
    parts.push(products.map(function(p) { return _productCard(p); }).join(''));
    parts.push('</div>');
  }
  parts.push('</div></div>');
  container.innerHTML = parts.join('');

  if (products.length) {
    var grid = container.querySelector('#v2-company-prod-grid');
    if (grid) {
      var ids = products.map(function(p) { return p.id; });
      _lazyPrices(grid, ids);
      _lazyUnits(grid, ids);
      bindProductCards(grid);

      var searchInput = container.querySelector('#v2-company-search-input');
      var allCards = Array.from(grid.querySelectorAll('[data-pid]'));
      function _filter() {
        var q = searchInput ? searchInput.value.trim().toLowerCase() : '';
        var activeCat = '';
        var activePill = container.querySelector('.v2-pill-active');
        if (activePill) activeCat = (activePill.getAttribute('data-cat') || '').toLowerCase();
        for (var fi = 0; fi < allCards.length; fi++) {
          var card = allCards[fi];
          var name = (card.getAttribute('data-name') || '').toLowerCase();
          var code = (card.getAttribute('data-code') || '').toLowerCase();
          var catVal = (card.getAttribute('data-category') || '').toLowerCase();
          var matchSearch = !q || name.indexOf(q) !== -1 || code.indexOf(q) !== -1;
          var matchCat = !activeCat || catVal.indexOf(activeCat) !== -1;
          card.style.display = (matchSearch && matchCat) ? '' : 'none';
        }
      }

      if (searchInput) {
        searchInput.addEventListener('input', _filter);
      }

      var pills = container.querySelectorAll('.v2-pill');
      for (var pj = 0; pj < pills.length; pj++) {
        (function(pill) {
          pill.addEventListener('click', function() {
            container.querySelectorAll('.v2-pill').forEach(function(pp) { pp.classList.remove('v2-pill-active'); });
            pill.classList.add('v2-pill-active');
            _filter();
          });
        })(pills[pj]);
      }
    }
  }
}

function _productCard(p) {
  return productCardHtml({
    pid: p.id,
    name: p.product_name || '',
    code: p.product_code || '',
    imageUrl: p.product_image_url || '',
    companyName: p.company_name_snapshot || '',
    category: p.category || '',
  });
}

async function _lazyPrices(grid, ids) {
  var prices = await getProductPricesBatch(ids);
  if (!prices || !prices.length) return;
  var best = {};
  for (var pi = 0; pi < prices.length; pi++) {
    var p = prices[pi];
    if (!best[p.product_id]) best[p.product_id] = p;
  }
  for (var pid in best) {
    var card = grid.querySelector('[data-pid="' + pid + '"]');
    if (card) setCardPrice(card, best[pid]);
  }
}

async function _lazyUnits(grid, ids) {
  if (!ids || !ids.length) return;
  var idList = ids.join(',');
  try {
    var r = await fetch(API + '/product_units?product_id=in.(' + idList + ')&is_active=eq.true&is_sellable=eq.true&select=id,product_id,unit_code,unit_name&order=display_order.asc', { headers: _h() });
    if (!r.ok) return;
    var units = await r.json();
    var first = {};
    for (var ui = 0; ui < units.length; ui++) {
      var u = units[ui];
      if (!first[u.product_id]) first[u.product_id] = u;
    }
    for (var pid2 in first) {
      var card2 = grid.querySelector('[data-pid="' + pid2 + '"]');
      if (card2) setCardUnit(card2, first[pid2].id, first[pid2].unit_name || first[pid2].unit_code || '');
    }
  } catch (e) { /* units unavailable */ }
}

function _e(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
