import { getCartRaw, addItem, removeItem, updateQuantity, requireCustomer } from '../../services/storefront/cartApi.js';

export function productCardHtml(p) {
  const img = p.imageUrl || '';
  const initial = p.name ? p.name.charAt(0) : 'ص';
  const raw = getCartRaw();
  const cartItem = raw.find(i => i.pid === p.pid && (!p.unitId || i.puid === p.unitId));
  const inCart = !!cartItem;
  const cartQty = cartItem?.qty || 0;
  const disabled = p.disabled === true;

  const offerRibbon = p.offer?.type ? _offerRibbon(p.offer.type) : '';
  const isOffer = !!p.offer?.type;
  const isStandard = !isOffer;

  const codeHtml = p.code ? `<div class="v2-pc-code">${_e(p.code)}</div>` : '';
  const companyHtml = p.companyName ? `<div class="v2-pc-company">${_e(p.companyName)}</div>` : '';

  const unitId = p.unitId || '';
  const unitHtml = isOffer
    ? ''
    : (p.unitName
      ? `<div class="v2-pc-unit" data-puid="${unitId}">${_e(p.unitName)}</div>`
      : `<div class="v2-pc-unit" data-puid=""></div>`);

  const priceHtml = _priceArea(p);
  const qtyHtml = inCart ? _qtyControl(cartQty) : '';
  const statusHtml = inCart ? '<div class="v2-pc-cart-status">✓ موجود في الطلب</div>' : '';
  const disabledCls = disabled ? ' v2-pc-disabled' : '';

  const dataName = p.name ? ' data-name="' + _e(p.name) + '"' : '';
  const dataCode = p.code ? ' data-code="' + _e(p.code) + '"' : '';
  const dataCat = p.category ? ' data-category="' + _e(p.category) + '"' : '';

  return `<div class="v2-pc-card v2-pc-card-pro${disabledCls}" data-pid="${p.pid}" data-unit="${unitId}"${dataName}${dataCode}${dataCat}${inCart ? ' data-in-cart="1"' : ''}${isOffer ? ' data-offer="1"' : ''}>
    <div class="v2-pc-img">
      ${img ? `<img src="${_e(img)}" alt="${_e(p.name)}" loading="lazy">` : `<span class="v2-pc-img-ph v2-pc-initial">${initial}</span>`}
      ${offerRibbon}
    </div>
    <div class="v2-pc-card-body">
      ${codeHtml}
      <div class="v2-pc-name">${_e(p.name)}</div>
      ${companyHtml}
      ${unitHtml}
      ${priceHtml}
      ${statusHtml}
      <div class="v2-pc-qty-area"${inCart ? '' : ' style="display:none"'}>
        ${qtyHtml}
      </div>
      <div class="v2-pc-card-atc">${_actionButton(inCart, cartQty, disabled)}</div>
    </div>
  </div>`;
}

function _offerRibbon(type) {
  if (type === 'daily_deal') return '<span class="v2-pc-offer-ribbon">🔥 صفقة اليوم</span>';
  if (type === 'flash_offer') return '<span class="v2-pc-offer-ribbon">⚡ عرض الساعة</span>';
  return '';
}

function _priceArea(p) {
  let srcLabel = '';
  if (p.offer?.type === 'daily_deal') srcLabel = '🔥 صفقة اليوم';
  else if (p.offer?.type === 'flash_offer') srcLabel = '⚡ عرض الساعة';
  else if (p.price?.tierName || p._tierName) srcLabel = '🏅 خصم شريحة';

  if (p.price?.basePrice != null && p.price?.finalPrice != null) {
    const bp = p.price.basePrice;
    const fp = p.price.finalPrice;
    const hasDiscount = bp !== fp;
    const savings = hasDiscount ? bp - fp : 0;

    if (hasDiscount) {
      return `<div class="v2-pc-price-area">
        <div class="v2-pc-price-row">
          <span class="v2-pc-price-base">${_money(bp)}</span>
          <span class="v2-pc-price-final">${_money(fp)}</span>
        </div>
        <div class="v2-pc-savings">توفير ${_money(savings)}</div>
        ${srcLabel ? `<div class="v2-pc-src">${srcLabel}</div>` : ''}
      </div>`;
    }
    return `<div class="v2-pc-price-area">
      <div class="v2-pc-price">${_money(fp)}</div>
    </div>`;
  }

  if (p.price) {
    return `<div class="v2-pc-price-area">
      <div class="v2-pc-price v2-pc-price-loading">${_money(p.price)}</div>
    </div>`;
  }

  return `<div class="v2-pc-price-area">
    <div class="v2-pc-price v2-pc-price-loading">—</div>
  </div>`;
}

function _qtyControl(qty) {
  const v = qty || 0;
  return `<div class="v2-pc-qty">
    <button class="v2-pc-qty-btn v2-pc-qty-dec" type="button"${v <= 1 ? ' disabled' : ''}>−</button>
    <input class="v2-pc-qty-input" type="text" inputmode="numeric" value="${v}" data-v2-pc-qty="1">
    <button class="v2-pc-qty-btn v2-pc-qty-inc" type="button">+</button>
  </div>`;
}

function _actionButton(inCart, qty, disabled) {
  if (disabled) {
    return `<button class="v2-pc-atc v2-pc-atc-disabled" type="button" disabled>غير متاح</button>`;
  }
  if (inCart && qty > 0) {
    return `<button class="v2-pc-atc v2-pc-atc-remove" type="button" data-action="remove">إزالة</button>`;
  }
  return `<button class="v2-pc-atc v2-pc-atc-buy" type="button" data-action="buy">شراء</button>`;
}

export function bindProductCards(container) {
  if (!container) return;

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.v2-pc-card-pro');
    if (!card) return;
    const pid = card.dataset.pid;
    const unitId = card.dataset.unit;

    // Quantity buttons
    if (e.target.closest('.v2-pc-qty-dec')) {
      e.stopPropagation();
      _adjustQty(card, pid, unitId, -1);
      return;
    }
    if (e.target.closest('.v2-pc-qty-inc')) {
      e.stopPropagation();
      _adjustQty(card, pid, unitId, 1);
      return;
    }

    // Action button
    const actionBtn = e.target.closest('.v2-pc-atc');
    if (actionBtn) {
      e.stopPropagation();
      if (actionBtn.dataset.action === 'buy') {
        _doBuy(card, pid, unitId, actionBtn);
      } else if (actionBtn.dataset.action === 'remove') {
        _doRemove(card, pid, unitId);
      }
      return;
    }

    // Card click → product detail (skip for offer cards)
    const link = e.target.closest('a');
    if (!link && !card.dataset.offer) {
      location.hash = '#products/' + pid;
    }
  });

  container.addEventListener('change', (e) => {
    const input = e.target.closest('.v2-pc-qty-input');
    if (!input) return;
    const card = input.closest('.v2-pc-card-pro');
    if (!card) return;
    const pid = card.dataset.pid;
    const unitId = card.dataset.unit;
    e.stopPropagation();
    let v = parseInt(input.value, 10);
    if (isNaN(v) || v < 0) v = 1;
    if (v === 0) {
      _doRemove(card, pid, unitId);
      return;
    }
    if (!requireCustomer()) return;
    const raw = getCartRaw();
    const item = raw.find(i => i.pid === pid && (!unitId || i.puid === unitId));
    if (item) {
      updateQuantity(pid, unitId || item.puid, v);
    } else {
      addItem(pid, unitId, v);
    }
    _syncCard(card, pid, unitId);
  });

  container.addEventListener('focusout', (e) => {
    const input = e.target.closest('.v2-pc-qty-input');
    if (!input) return;
    const card = input.closest('.v2-pc-card-pro');
    if (!card) return;
    const v = parseInt(input.value, 10);
    if (isNaN(v) || v < 1) input.value = '1';
  });
}

function _adjustQty(card, pid, unitId, delta) {
  const raw = getCartRaw();
  const item = raw.find(i => i.pid === pid && (!unitId || i.puid === unitId));
  if (!item) return;
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    _doRemove(card, pid, unitId);
    return;
  }
  if (!requireCustomer()) return;
  updateQuantity(pid, unitId || item.puid, newQty);
  _syncCard(card, pid, unitId);
}

function _doBuy(card, pid, unitId, btn) {
  if (!requireCustomer()) return;
  const raw = getCartRaw();
  const item = raw.find(i => i.pid === pid && (!unitId || i.puid === unitId));
  if (item) return;
  const qtyInput = card.querySelector('.v2-pc-qty-input');
  const qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
  addItem(pid, unitId, qty);
  _syncCard(card, pid, unitId);
  const feedback = document.createElement('div');
  feedback.className = 'v2-pc-atc-feedback';
  feedback.textContent = '✓ أضيف إلى السلة';
  const rect = (btn || card.querySelector('.v2-pc-atc')).getBoundingClientRect();
  feedback.style.left = (rect.left + rect.width / 2 - 60) + 'px';
  feedback.style.top = (rect.top - 10) + 'px';
  document.body.appendChild(feedback);
  setTimeout(() => feedback.remove(), 600);
}

function _doRemove(card, pid, unitId) {
  if (!requireCustomer()) return;
  const raw = getCartRaw();
  const item = raw.find(i => i.pid === pid && (!unitId || i.puid === unitId));
  if (!item) return;
  removeItem(pid, unitId || item.puid);
  _syncCard(card, pid, unitId);
}

function _syncCard(card, pid, unitId) {
  if (!card) return;
  const raw = getCartRaw();
  const item = raw.find(i => i.pid === pid && (!unitId || i.puid === unitId));
  const inCart = !!item;
  const qty = item?.qty || 0;
  if (inCart) card.dataset.inCart = '1'; else delete card.dataset.inCart;

  const qtyArea = card.querySelector('.v2-pc-qty-area');
  if (qtyArea) qtyArea.style.display = inCart ? '' : 'none';

  const qtyHtml = _qtyControl(qty);
  const existingQty = card.querySelector('.v2-pc-qty');
  if (existingQty) existingQty.outerHTML = qtyHtml;

  const actionHtml = _actionButton(inCart, qty);
  const existingAtc = card.querySelector('.v2-pc-atc');
  if (existingAtc) existingAtc.outerHTML = actionHtml;

  const existingStatus = card.querySelector('.v2-pc-cart-status');
  if (inCart && !existingStatus) {
    const body = card.querySelector('.v2-pc-card-body');
    const priceArea = card.querySelector('.v2-pc-price-area');
    if (priceArea?.nextElementSibling?.classList?.contains('v2-pc-card-atc')) {
      priceArea.insertAdjacentHTML('afterend', '<div class="v2-pc-cart-status">✓ موجود في الطلب</div>');
    } else if (priceArea) {
      priceArea.insertAdjacentHTML('afterend', '<div class="v2-pc-cart-status">✓ موجود في الطلب</div>');
    }
  } else if (!inCart && existingStatus) {
    existingStatus.remove();
  }
}

export function syncCartCards(container) {
  if (!container) return;
  const raw = getCartRaw();
  container.querySelectorAll('.v2-pc-card-pro').forEach(card => {
    const pid = card.dataset.pid;
    const unitId = card.dataset.unit;
    const item = raw.find(i => i.pid === pid && (!unitId || i.puid === unitId));
    const wasInCart = card.dataset.inCart === '1';
    const nowInCart = !!item;
    if (wasInCart !== nowInCart) _syncCard(card, pid, unitId);
  });
}

export function setCardPrice(card, priceData) {
  if (!card || !priceData) return;
  const pid = card.dataset.pid;
  const area = card.querySelector('.v2-pc-price-area');
  if (!area) return;
  const p = {
    pid,
    price: {
      basePrice: priceData.base_price ?? priceData.basePrice ?? priceData.final_price ?? 0,
      finalPrice: priceData.final_price ?? priceData.finalPrice ?? priceData.base_price ?? 0,
      discountPercent: priceData.discount_percent ?? priceData.discountPercent ?? 0,
      tierName: priceData.tier_name ?? priceData.tierName ?? null,
    },
    _tierName: priceData.tier_name ?? priceData.tierName ?? null,
  };
  area.outerHTML = _priceArea(p);
}

export function setCardUnit(card, unitId, unitName) {
  if (!card) return;
  const el = card.querySelector('.v2-pc-unit');
  if (el) {
    el.dataset.puid = unitId || '';
    el.textContent = unitName || '';
  }
  card.dataset.unit = unitId || '';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '—'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
