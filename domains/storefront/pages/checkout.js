import { getCartRaw, hydrateCart, computeTotals, validateCart, clearCart, acquireCheckoutLock, releaseCheckoutLock, getCartMachineState, CART_STATE, isEditMode, getEditOrderId, clearEditOrderId } from '../../../services/storefront/cartApi.js';
import { createInvoiceRuntime, updateInvoiceRuntime, clearGeoCache } from '../../../services/storefront/invoiceRuntime.js';
import { buildWhatsAppMessage, openWhatsApp } from '../../../services/storefront/transportRuntime.js';
import { getSession } from '../../../auth/sessionService.js';
import { logError } from '../../../utils/logger.js';
import { renderGuidanceCard, toast } from '../../../runtime/guidance.js';
import { formatStatus } from '../../../services/storefront/invoicesApi.js';

let _hydrated = [];

export async function renderCheckoutPage(container) {
  const raw = getCartRaw();
  if (!raw.length) {
    container.innerHTML = '<div class="v2-co"><div class="v2-co-empty"><p>السلة فارغة</p><a href="#products" class="v2-btn v2-btn-p">تصفح المنتجات</a></div></div>';
    return;
  }

  container.innerHTML = '<div class="v2-co"><div class="v2-co-loading">جاري تجهيز الطلب...</div></div>';

  try {
    _hydrated = await hydrateCart();
    const errors = validateCart(_hydrated);
    const barrier = _checkBarrier(_hydrated, errors);
    _render(container, _hydrated, barrier);
  } catch {
    container.innerHTML = '<div class="v2-co"><div class="v2-co-error"><p>فشل تجهيز الطلب</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderCheckoutPage(container));
  }
}

function _checkBarrier(hydrated, errors) {
  const reasons = [];
  const state = getCartMachineState();
  if (state === CART_STATE.STALE) reasons.push({ code: 'STALE_TIER', severity: 'critical', msg: 'تغيرت الشريحة السعرية. الرجاء العودة للسلة وتحديث الأسعار.' });
  if (state === CART_STATE.INVALID) reasons.push({ code: 'INVALID_CART', severity: 'critical', msg: 'السلة تحتوي على أصناف غير متاحة. الرجاء مراجعة السلة.' });
  for (const item of hydrated) {
    const name = item.product?.product_name || item.code || 'منتج غير معروف';
    if (!item.product) reasons.push({ code: 'PRODUCT_MISSING', severity: 'critical', item_id: item.pid, msg: `${name}: المنتج غير متاح` });
    else if (!item.unit) reasons.push({ code: 'UNIT_MISSING', severity: 'critical', item_id: item.pid, msg: `${name}: الوحدة غير متاحة` });
    else if (!item.price?.found) reasons.push({ code: 'PRICE_MISSING', severity: 'critical', item_id: item.pid, msg: `${name}: السعر غير متاح` });
    else if (item.stock !== null && item.qty > item.stock) reasons.push({ code: 'OUT_OF_STOCK', severity: 'critical', item_id: item.pid, current_qty: item.qty, available: item.stock, msg: `${name}: الكمية (${item.qty}) تتجاوز المتاح (${item.stock})` });
  }
  const criticals = reasons.filter(r => r.severity === 'critical');
  return { valid: criticals.length === 0, reasons, blocked: criticals.length > 0 };
}

function _render(container, hydrated, barrier) {
  const ses = getSession();
  const totals = computeTotals(hydrated);
  const blocked = barrier.blocked;
  const edit = isEditMode();

  container.innerHTML = `<div class="v2-co">
    <nav class="v2-co-nav"><a href="#cart" class="v2-co-back">← ${edit ? 'العودة' : 'العودة للسلة'}</a></nav>
    <h1 class="v2-co-title">${edit ? 'تعديل الطلب' : 'مراجعة الطلب'}</h1>
    <p class="v2-co-subtitle">${edit ? 'سيتم تحديث الفاتورة وإرسالها عبر واتساب' : 'سيتم إنشاء الفاتورة وإرسالها عبر واتساب'}</p>

    <div class="v2-co-guidance" id="v2-co-guidance"></div>

    <div class="v2-co-card">
      <div class="v2-co-ch">معلومات المُرسل</div>
      <div class="v2-co-body">
        <div class="v2-co-row"><span>الاسم</span><span>${_e(ses?.actor?.fullName || 'غير معروف')}</span></div>
        ${ses?.actor?.phone ? `<div class="v2-co-row"><span>الهاتف</span><span>${_e(ses.actor.phone)}</span></div>` : ''}
        ${ses?.actor?.address ? `<div class="v2-co-row"><span>العنوان</span><span>${_e(ses.actor.address)}</span></div>` : ''}
        ${ses?.role?.roleName ? `<div class="v2-co-row"><span>الشريحة</span><span>${_e(ses.role.roleName)}</span></div>` : ''}
        ${ses?.actor?.branchName ? `<div class="v2-co-row"><span>الفرع</span><span>${_e(ses.actor.branchName)}</span></div>` : ''}
      </div>
    </div>

    <div class="v2-co-card">
      <div class="v2-co-ch">الأصناف (${hydrated.length})</div>
      <div class="v2-co-body" style="padding:0">
        <table class="v2-co-table">
          <thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
          <tbody>${hydrated.map(item => _itemRow(item)).join('')}</tbody>
          <tfoot><tr class="v2-co-grand"><td colspan="4" style="text-align:left;">إجمالي الفاتورة</td><td>${_money(totals.grand)}</td></tr></tfoot>
        </table>
      </div>
    </div>

    <div class="v2-co-card">
      <div class="v2-co-ch">ملاحظات (اختياري)</div>
      <div class="v2-co-body">
        <textarea class="v2-co-note" id="v2-co-note" placeholder="أي ملاحظات إضافية..." rows="3"></textarea>
      </div>
    </div>

    <div class="v2-co-actions">
      <button class="v2-btn v2-btn-p v2-btn-b v2-co-submit" id="v2-co-submit" ${blocked ? 'disabled' : ''} style="border-radius:12px;padding:.75rem;font-size:.9375rem;min-height:48px">
        ${blocked ? '⚠️ يوجد موانع للإرسال' : edit ? '✏️ تحديث الطلب وإرسال واتساب' : '💳 إنشاء الفاتورة وإرسالها'}
      </button>
    </div>
  </div>`;

  const guidanceEl = container.querySelector('#v2-co-guidance');
  if (guidanceEl && barrier.reasons.length) {
    for (const reason of barrier.reasons) {
      const ctx = { item_id: reason.item_id || '', current_qty: reason.current_qty, available: reason.available };
      renderGuidanceCard(guidanceEl, reason.code, ctx);
    }
  }

  if (!blocked) {
    container.querySelector('#v2-co-submit')?.addEventListener('click', () => _handleSubmit(container, hydrated));
  }
}

async function _handleSubmit(container, hydrated) {
  if (!acquireCheckoutLock()) return;

  const btn = container.querySelector('#v2-co-submit');
  const noteEl = container.querySelector('#v2-co-note');
  const edit = isEditMode();

  btn.classList.add('v2-co-submit-loading');
  btn.disabled = true;
  btn.textContent = edit ? 'جارٍ تحديث الفاتورة...' : 'جارٍ إنشاء الفاتورة...';

  try {
    const notes = noteEl?.value?.trim() || '';
    const ses = getSession();
    clearGeoCache();
    const totals = computeTotals(hydrated);

    let result;
    if (edit) {
      const editOrderId = getEditOrderId();
      result = await updateInvoiceRuntime(editOrderId, hydrated, notes);
    } else {
      result = await createInvoiceRuntime(hydrated, notes);
    }

    const { order, items: savedItems, viewModel, geoGuidance } = result;

    viewModel.invoice.total = totals.grand;
    const whatsappUrl = buildWhatsAppMessage(viewModel);

    openWhatsApp(whatsappUrl);
    clearCart();
    if (edit) clearEditOrderId();

    const orderNumber = order.order_number || '';
    const statusLabel = formatStatus(order.order_status || 'pending');
    const successTitle = edit ? 'تم تحديث الفاتورة بنجاح' : 'تم إنشاء الفاتورة بنجاح';

    container.innerHTML = `<div class="v2-co">
      <div class="v2-co-success-screen">
        <div class="v2-co-success-anim">✅</div>
        <h2>${successTitle}</h2>
        <div class="v2-co-invoice-num">${_e(String(orderNumber))}</div>
        <div class="v2-co-invoice-status"><span class="v2-badge v2-badge-ok" style="font-size:.8125rem;padding:.25rem .75rem;border-radius:20px">${statusLabel}</span></div>
        <p style="color:var(--v2-text2);font-size:.875rem;margin-top:.5rem">تم فتح واتساب لإتمام الإرسال</p>

        <div class="v2-co-invoice-summary">
          <div class="v2-co-invoice-summary-row"><span>عدد الأصناف</span><span>${hydrated.length}</span></div>
          <div class="v2-co-invoice-summary-row"><span>الإجمالي</span><span>${_money(totals.grand)}</span></div>
        </div>

        ${geoGuidance ? `<div style="margin-top:1rem;font-size:.8125rem;color:var(--v2-text2);background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:.75rem;max-width:360px;margin-left:auto;margin-right:auto">⚠️ ${geoGuidance}</div>` : ''}

        <div class="v2-co-success-actions">
          <a href="#invoices/${order.id}" class="v2-btn v2-btn-p" style="border-radius:12px">📄 عرض الفاتورة</a>
          <button class="v2-btn v2-btn-wa" id="v2-co-success-wa" style="border-radius:12px">📱 إعادة فتح واتساب</button>
          <a href="#invoices" class="v2-btn" style="border-radius:12px;border:1px solid var(--v2-border);background:var(--v2-surface)">📋 فواتيري</a>
          <a href="#products" class="v2-btn" style="border-radius:12px;border:1px solid var(--v2-border);background:var(--v2-surface)">🛍️ متابعة التسوق</a>
        </div>
      </div>
    </div>`;

    container.querySelector('#v2-co-success-wa')?.addEventListener('click', () => {
      const url = buildWhatsAppMessage(viewModel);
      if (url) openWhatsApp(url);
    });

    toast(edit ? 'ORDER_UPDATED' : 'ORDER_CREATED');
  } catch (err) {
    logError('checkout submit', err);
    btn.classList.remove('v2-co-submit-loading');
    btn.disabled = false;
    btn.textContent = edit ? '✏️ تحديث الطلب وإرسال واتساب' : '💳 إنشاء الفاتورة وإرسالها';

    if (err.message?.includes('network') || err.message?.includes('fetch')) {
      toast('NETWORK_ERROR');
    } else {
      toast('GENERIC_ERROR');
    }
  } finally {
    releaseCheckoutLock();
  }
}

function _itemRow(item) {
  const p = item.product;
  const code = p?.product_code || item.code || '';
  return `<tr>
    <td>${_e(p?.product_name || '')}${code ? `<br><small style="color:var(--v2-text2);font-size:.75rem">${_e(code)}</small>` : ''}</td>
    <td>${_e(item.unitName || item.unitCode || '')}</td>
    <td>${item.qty}</td>
    <td>${item.price?.found ? _money(item.price.final_price) : '—'}</td>
    <td>${item.price?.found ? _money(item.price.final_price * item.qty) : '—'}</td>
  </tr>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
