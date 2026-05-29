import { getProductDetail, getProductPrice } from '../../../../services/storefront/productsApi.js';
import { addItem, getCartRaw, requireCustomer, consumeCustomerJustSelected } from '../../../../services/storefront/cartApi.js';
import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';
import { _addToRecentlyViewed as _trackRV } from '../home.js';

export async function renderProductDetail(container, params) {
  const pid = params.productId;
  if (!pid) { container.innerHTML = '<div class="v2-pd"><p class="v2-pd-error">معرف المنتج غير صالح</p></div>'; return; }
  container.innerHTML = '<div class="v2-pd"><div class="v2-pd-loading">جاري تحميل تفاصيل المنتج...</div></div>';

  try {
    const { product, units, prices, stock } = await getProductDetail(pid);
    _trackRV(product);
    _render(container, product, units, prices, stock);
  } catch {
    container.innerHTML = '<div class="v2-pd"><div class="v2-pd-error"><p>فشل تحميل تفاصيل المنتج</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderProductDetail(container, params));
  }
}

function _render(container, product, units, prices, stock) {
  const sellableUnits = units.filter(u => u.is_sellable && u.is_active);
  const defaultUnit = sellableUnits.find(u => u.is_base_unit) || sellableUnits[0];

  const initialCart = getCartRaw();
  const inCart = initialCart.find(i => i.pid === product.id && i.puid === (defaultUnit?.id || sellableUnits[0]?.id));
  const justSelected = consumeCustomerJustSelected();

  container.innerHTML = `<div class="v2-pd">
    ${justSelected ? `<div class="v2-pd-cust-banner">✅ الآن يمكنك الشراء 👤 ${_e(justSelected)}</div>` : ''}
    <nav class="v2-pd-nav"><a href="#products" class="v2-pd-back">← العودة للمنتجات</a></nav>
    <div class="v2-pd-main">
      <div class="v2-pd-gallery"><div class="v2-pd-gallery-inner">${_img(product)}</div></div>
      <div class="v2-pd-info">
        <h1 class="v2-pd-title">${_e(product.product_name)}</h1>
        <div class="v2-pd-meta">
          <span class="v2-pd-company">${_e(product.company_name_snapshot || '')}</span>
          ${product.category ? `<span class="v2-pd-category-badge">${_e(product.category)}</span>` : ''}
        </div>
        ${product.product_code ? `<div class="v2-pd-code">كود: ${_e(product.product_code)}</div>` : ''}
        ${product.barcode ? `<div class="v2-pd-barcode">باركود: ${_e(product.barcode)}</div>` : ''}
        <div class="v2-pd-units" id="v2-pd-units">
          <label class="v2-pd-ul">الوحدة:</label>
          <div class="v2-pd-uo">${sellableUnits.map(u => _unitOpt(u, u.id === defaultUnit?.id, stock)).join('')}</div>
        </div>
        <div class="v2-pd-price-box" id="v2-pd-price-box">
          <div class="v2-pd-price-loading">جاري تحميل السعر...</div>
        </div>
        <div class="v2-pd-stock-box" id="v2-pd-stock-box">
          <div class="v2-pd-stock-loading">جاري تحميل المخزون...</div>
        </div>
        <div class="v2-pd-qty-selector" id="v2-pd-qty-selector" style="display:none">
          <label class="v2-pd-ul">الكمية:</label>
          <div class="v2-pd-qty-controls">
            <button class="v2-pd-qty-btn" id="v2-pd-qty-dec">−</button>
            <span class="v2-pd-qty-val" id="v2-pd-qty-val">1</span>
            <button class="v2-pd-qty-btn" id="v2-pd-qty-inc">+</button>
          </div>
        </div>
        <button class="v2-btn v2-btn-p v2-btn-b v2-pd-atc" disabled style="border-radius:12px;padding:.75rem;min-height:48px;margin-top:.5rem">
          أضف إلى السلة
          <span class="v2-pd-cart-badge"${inCart && inCart.qty > 0 ? '' : ' style="display:none"'}>${inCart ? inCart.qty : 0}</span>
        </button>
      </div>
    </div>
    <div class="v2-pd-related" id="v2-pd-related"></div>
  </div>`;

  const unitsEl = container.querySelector('#v2-pd-units');
  const priceBox = container.querySelector('#v2-pd-price-box');
  const stockBox = container.querySelector('#v2-pd-stock-box');
  const qtySelector = container.querySelector('#v2-pd-qty-selector');
  const qtyVal = container.querySelector('#v2-pd-qty-val');

  let currentUnitId = defaultUnit?.id || (sellableUnits[0]?.id);
  let currentQty = 1;

  async function refreshPrice(unitId) {
    priceBox.innerHTML = '<div class="v2-pd-price-loading">جاري تحميل السعر...</div>';
    try {
      const price = await getProductPrice(product.id, unitId);
      if (price?.found) {
        let html = `<div class="v2-pd-price">${_money(price.final_price)}</div>`;
        if (price.base_price && price.base_price !== price.final_price) {
          html += `<div class="v2-pd-price-original"><s>${_money(price.base_price)}</s></div>`;
        }
        if (price.tier_name) {
          html += `<div class="v2-pd-tier-badge">🏷️ سعر شريحة ${_e(price.tier_name)}</div>`;
        }
        if (price.discount_percent > 0) {
          html += `<div class="v2-pd-discount-badge">🔥 خصم ${price.discount_percent}%</div>`;
        }
        priceBox.innerHTML = html;
        container.querySelector('.v2-pd-atc').disabled = false;
        qtySelector.style.display = '';
      } else {
        priceBox.innerHTML = '<div class="v2-pd-price-na">السعر غير متاح</div>';
        container.querySelector('.v2-pd-atc').disabled = true;
        qtySelector.style.display = 'none';
      }
    } catch {
      priceBox.innerHTML = '<div class="v2-pd-price-na">فشل تحميل السعر</div>';
    }
  }

  function refreshStock(unitId) {
    const s = stock.filter(r => r.product_unit_id === unitId);
    const totalAvail = s.reduce((sum, r) => sum + (r.available_qty || 0), 0);
    const warehouseBreakdown = s.filter(r => (r.available_qty || 0) > 0)
      .map(r => `  ${_e(r.warehouse_name || r.warehouse_code || 'مستودع')}: ${r.available_qty}`).join('\n');
    if (!s.length || totalAvail <= 0) {
      stockBox.innerHTML = '<div class="v2-pd-stock v2-pd-stock-out">غير متوفر</div>';
    } else if (totalAvail < 10) {
      stockBox.innerHTML = `<div class="v2-pd-stock v2-pd-stock-low">متبقي ${totalAvail} وحدة فقط</div>`;
      if (warehouseBreakdown) {
        stockBox.innerHTML += `<div class="v2-pd-stock-breakdown" title="${_e(warehouseBreakdown)}">توزيع المخزون ⓘ</div>`;
      }
    } else {
      stockBox.innerHTML = `<div class="v2-pd-stock v2-pd-stock-ok">متوفر (${totalAvail} وحدة)</div>`;
      if (warehouseBreakdown) {
        stockBox.innerHTML += `<div class="v2-pd-stock-breakdown" title="${_e(warehouseBreakdown)}">توزيع المخزون ⓘ</div>`;
      }
    }
  }

  refreshPrice(currentUnitId);
  refreshStock(currentUnitId);

  function _updateCartBadge() {
    const items = getCartRaw();
    const existing = items.find(i => i.pid === product.id && i.puid === currentUnitId);
    const badge = container.querySelector('.v2-pd-cart-badge');
    if (!badge) return;
    if (existing && existing.qty > 0) {
      badge.textContent = existing.qty;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  container.querySelector('.v2-pd-atc').addEventListener('click', () => {
    if (!requireCustomer()) return;
    const unitName = sellableUnits.find(u => u.id === currentUnitId)?.unit_name || '';
    addItem(product.id, currentUnitId, currentQty, { name: product.product_name, unitName, img: product.product_image_url || '', code: product.product_code || '' });
    const btn = container.querySelector('.v2-pd-atc');
    btn.textContent = `✓ تمت إضافة ${currentQty} قطعة`;
    setTimeout(() => { btn.textContent = 'أضف إلى السلة'; _updateCartBadge(); }, 1500);
    _updateCartBadge();
    const badge = document.querySelector('.v2-sf-nb');
    if (badge) {
      const c = parseInt(badge.textContent, 10) || 0;
      badge.textContent = c + currentQty;
    }
  });

  container.querySelector('#v2-pd-qty-inc')?.addEventListener('click', () => {
    currentQty = Math.min(99, currentQty + 1);
    qtyVal.textContent = currentQty;
  });
  container.querySelector('#v2-pd-qty-dec')?.addEventListener('click', () => {
    currentQty = Math.max(1, currentQty - 1);
    qtyVal.textContent = currentQty;
  });

  _updateCartBadge();
  _renderRelated(container, product.company_id, product.id);

  unitsEl.querySelectorAll('[data-unit]').forEach(el => {
    el.addEventListener('click', () => {
      const unitId = el.dataset.unit;
      if (unitId === currentUnitId) return;
      currentUnitId = unitId;
      currentQty = 1;
      qtyVal.textContent = '1';
      unitsEl.querySelectorAll('[data-unit]').forEach(x => x.classList.remove('v2-pd-u-active'));
      el.classList.add('v2-pd-u-active');
      refreshPrice(unitId);
      refreshStock(unitId);
    });
  });
}

function _img(product) {
  const url = product.product_image_url;
  if (url) return `<img src="${_e(url)}" alt="${_e(product.product_name)}" class="v2-pd-img">`;
  return '<div class="v2-pd-img-ph">📦</div>';
}

function _unitOpt(u, active, stock) {
  const s = stock.filter(r => r.product_unit_id === u.id);
  const avail = s.reduce((sum, r) => sum + (r.available_qty || 0), 0);
  const stockClass = avail <= 0 ? ' v2-pd-u-out' : avail < 10 ? ' v2-pd-u-low' : '';
  return `<button class="v2-pd-u${active ? ' v2-pd-u-active' : ''}${stockClass}" data-unit="${u.id}">
    <span class="v2-pd-un">${_e(u.unit_name)}</span>
    <span class="v2-pd-uc">${_e(u.unit_code)}${avail > 0 ? ` · ${avail}` : ' · غير متوفر'}</span>
  </button>`;
}

async function _fetchRelated(companyId, excludeId) {
  if (!companyId) return [];
  const r = await fetch(readConfig().baseUrl + '/products?select=id,product_name,product_image_url,company_name_snapshot&is_active=eq.true&company_id=eq.' + companyId + '&id=neq.' + excludeId + '&limit=6&order=product_name.asc', { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

async function _renderRelated(container, companyId, excludeId) {
  const relEl = container.querySelector('#v2-pd-related');
  if (!companyId || !relEl) return;
  try {
    const products = await _fetchRelated(companyId, excludeId);
    if (!products.length) return;
    relEl.innerHTML = '<h3 class="v2-pd-rel-title">منتجات أخرى من ' + _e(products[0]?.company_name_snapshot || '') + '</h3><div class="v2-pd-rel-grid">'
      + products.map(p => '<a href="#products/' + p.id + '" class="v2-pd-rel-card">'
        + (p.product_image_url ? '<div class="v2-pd-rel-img"><img src="' + _e(p.product_image_url) + '" alt=""></div>'
          : '<div class="v2-pd-rel-img v2-pd-rel-img-ph">' + _e((p.product_name || '')[0]) + '</div>')
        + '<div class="v2-pd-rel-name">' + _e(p.product_name) + '</div>'
        + '</a>').join('') + '</div>';
  } catch { /* ignore */ }
}

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  return h;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
