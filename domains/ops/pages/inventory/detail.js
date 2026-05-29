import { getProductDetail, getReservations, releaseReservation, createAdjustmentMovement, MOVEMENT_LABELS } from '../../../../services/inventory/inventoryApi.js';
import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';
import { showModal, apiPatch, addStyles } from '../crudHelper.js';

function _h() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

export async function renderInventoryDetail(container, { productId }) {
  addStyles();
  if (!productId) { container.innerHTML = '<div class="v2-inv-d"><p>معرف المنتج غير موجود</p><a href="#ops/inventory">العودة</a></div>'; return; }

  container.innerHTML = '<div class="v2-inv-d"><div class="v2-inv-loading">جاري التحميل...</div></div>';

  let detail, reservations;
  try {
    [detail, reservations] = await Promise.all([
      getProductDetail(productId),
      getReservations().then(r => r.filter(x => x.product_id === productId)),
    ]);
  } catch {
    container.innerHTML = '<div class="v2-inv-d"><div class="v2-inv-error"><p>فشل تحميل تفاصيل المنتج</p><a href="#ops/inventory" class="v2-retry">العودة</a></div></div>';
    return;
  }

  const el = container.querySelector('.v2-inv-d');
  if (!el) return;
  el.innerHTML = _render(detail, reservations);

  el.querySelectorAll('[data-release]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'جاري...';
      try {
        await releaseReservation(btn.dataset.release);
        renderInventoryDetail(container, { productId });
      } catch { btn.textContent = 'فشل'; }
    });
  });

  el.querySelectorAll('[data-adj-stock]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stockId = btn.dataset.adjStock;
      const s = detail.stock.find(x => x.id === stockId);
      if (!s) return;
      showModal('تعديل المخزون', [
        { key: 'available_qty', label: 'الكمية المتاحة', type: 'number', required: true, default: s.available_qty },
        { key: 'reason', label: 'سبب التعديل', required: true },
      ], null, async vals => {
        const delta = Number(vals.available_qty) - (s.available_qty || 0);
        await apiPatch('inventory_stock', stockId, { available_qty: Number(vals.available_qty) });
        if (delta !== 0) {
          await createAdjustmentMovement({
            productId,
            delta,
            balanceAfter: Number(vals.available_qty),
            reason: vals.reason,
          });
        }
        renderInventoryDetail(container, { productId });
      });
    });
  });
}

function _render(p, reservations) {
  const totalAvail = p.stock.reduce((s, i) => s + (i.available_qty || 0), 0);
  const totalRes = p.stock.reduce((s, i) => s + (i.reserved_qty || 0), 0);

  return `<a href="#ops/inventory" class="v2-od-back">← المخزون</a>
    <div class="v2-inv-dh">
      <h2>${_e(p.product_name)}</h2>
      <span class="v2-inv-dcode">${_e(p.product_code || '')}</span>
    </div>
    <div class="v2-inv-ds">
      <div class="v2-inv-dsc"><span class="v2-inv-lbl">إجمالي المتاح:</span><span class="v2-inv-val">${_n(totalAvail)}</span></div>
      <div class="v2-inv-dsc"><span class="v2-inv-lbl">إجمالي المحجوز:</span><span class="v2-inv-val">${_n(totalRes)}</span></div>
    </div>

    <h3>المخزون حسب المستودع</h3>
    ${p.stock.length === 0 ? '<p>لا يوجد مخزون</p>' : `<table class="v2-inv-tbl"><thead><tr><th>المستودع</th><th>متاح</th><th>محجوز</th><th>الإجمالي</th><th>الحد الأدنى</th><th></th></tr></thead><tbody>${p.stock.map(s =>
      `<tr><td>${_e(s.branch?.branch_name || '—')}</td>
        <td class="v2-inv-num">${_n(s.available_qty)}</td>
        <td class="v2-inv-num">${_n(s.reserved_qty)}</td>
        <td class="v2-inv-num">${_n((s.available_qty || 0) + (s.reserved_qty || 0))}</td>
        <td class="v2-inv-num">${_n(s.minimum_qty)}</td>
        <td><button class="v2-crud-edit v2-btn-sm" data-adj-stock="${s.id}">تعديل</button></td></tr>`
    ).join('')}</tbody></table>`}

    <h3>الوحدات</h3>
    ${p.units.length === 0 ? '<p>لا توجد وحدات</p>' : `<table class="v2-inv-tbl"><thead><tr><th>الوحدة</th><th>الكود</th></tr></thead><tbody>${p.units.map(u =>
      `<tr><td>${_e(u.unit_name || '')}</td><td>${_e(u.unit_code || '')}</td></tr>`
    ).join('')}</tbody></table>`}

    <h3>حركة المخزون (آخر 50)</h3>
    ${p.movements.length === 0 ? '<p>لا توجد حركة</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>التاريخ</th><th>النوع</th><th>الكمية</th><th>الاتجاه</th><th>الرصيد بعد</th><th>ملاحظات</th></tr></thead><tbody>${p.movements.map(m =>
      `<tr><td>${_d(m.created_at)}</td>
        <td>${MOVEMENT_LABELS[m.movement_type] || m.movement_type}</td>
        <td class="v2-inv-num">${_n(m.quantity)}</td>
        <td>${m.direction === 'in' ? 'داخل' : m.direction === 'out' ? 'خارج' : '—'}</td>
        <td class="v2-inv-num">${m.balance_after != null ? _n(m.balance_after) : '—'}</td>
        <td>${_e(m.note || '')}</td></tr>`
    ).join('')}</tbody></table></div>`}

    <h3>الحجوزات النشطة</h3>
    ${reservations.length === 0 ? '<p>لا توجد حجوزات نشطة</p>' : `<table class="v2-inv-tbl"><thead><tr><th>رقم الحجز</th><th>الكمية</th><th>تاريخ الإنشاء</th><th></th></tr></thead><tbody>${reservations.map(r =>
      `<tr><td>${_e(r.reservation_number || `#${r.id}`)}</td>
        <td class="v2-inv-num">${_n(r.quantity)}</td>
        <td>${_d(r.created_at)}</td>
        <td><button class="v2-inv-act" data-release="${r.id}">إلغاء الحجز</button></td></tr>`
    ).join('')}</tbody></table>`}`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _n(v) { if (v == null) return '0'; return Number(v).toLocaleString('en-US'); }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
