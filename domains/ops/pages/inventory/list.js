import { getAllStock, getLowStock, getReservations, getProductMovements, releaseReservation, createAdjustmentMovement, MOVEMENT_LABELS } from '../../../../services/inventory/inventoryApi.js';
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

const TABS = [
  { k: 'stock', l: 'المخزون' }, { k: 'low', l: 'منخفض' },
  { k: 'reservations', l: 'حجوزات' }, { k: 'movements', l: 'الحركة' },
];
let _activeTab = 'stock';

export async function renderInventoryList(container) {
  addStyles();
  container.innerHTML = '<div class="v2-inv"><div class="v2-inv-loading">جاري التحميل...</div></div>';
  try { await _render(container); } catch {
    container.innerHTML = '<div class="v2-inv"><div class="v2-inv-error"><p>فشل التحميل</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderInventoryList(container));
  }
}

async function _render(container) {
  const t = _activeTab;
  container.innerHTML = `<div class="v2-inv">${_tabs(t)}<div class="v2-inv-loading">جاري التحميل...</div></div>`;
  const el = container.querySelector('.v2-inv');

  try {
    if (t === 'stock') await _renderStock(el);
    else if (t === 'low') await _renderLow(el);
    else if (t === 'reservations') await _renderReservations(el);
    else if (t === 'movements') await _renderMovements(el);
  } catch {
    el.innerHTML = _tabs(t) + '<div class="v2-inv-error"><p>فشل التحميل</p><button class="v2-retry">إعادة المحاولة</button></div>';
    el.querySelector('.v2-retry')?.addEventListener('click', () => _render(container));
    return;
  }

  el.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => { _activeTab = btn.dataset.tab; _render(container); });
  });
}

async function _renderStock(el) {
  const data = await getAllStock();
  el.innerHTML = _tabs('stock') + (data.length === 0
    ? '<div class="v2-inv-empty">لا توجد منتجات في المخزون</div>'
    : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>المنتج</th><th>الوحدة</th><th>المستودع</th><th>متاح</th><th>محجوز</th><th>الإجمالي</th><th></th></tr></thead><tbody>${data.map(s => `<tr>
      <td><a href="#ops/inventory/${s.product_id}">${_e(s.product?.product_name || s.product_id)}</a></td>
      <td>${_e(s.unit_id?.slice(0, 8))}</td>
      <td>${_e(s.branch?.branch_name || '—')}</td>
      <td class="v2-inv-num">${_n(s.available_qty)}</td>
      <td class="v2-inv-num">${_n(s.reserved_qty)}</td>
      <td class="v2-inv-num">${_n((s.available_qty || 0) + (s.reserved_qty || 0))}</td>
      <td><button class="v2-crud-edit v2-btn-sm" data-id="${s.id}">تعديل</button></td>
    </tr>`).join('')}</tbody></table></div>`);

  el.querySelectorAll('.v2-crud-edit').forEach(b => {
    const s = data.find(x => x.id === b.dataset.id);
    if (s) b.addEventListener('click', () => {
      showModal('تعديل المخزون', [
        { key: 'available_qty', label: 'الكمية المتاحة', type: 'number', required: true, default: s.available_qty },
        { key: 'reason', label: 'سبب التعديل', required: true },
      ], null, async vals => {
        const delta = Number(vals.available_qty) - (s.available_qty || 0);
        await apiPatch('inventory_stock', s.id, { available_qty: Number(vals.available_qty) });
        if (delta !== 0) {
          await createAdjustmentMovement({
            productId: s.product_id,
            delta,
            balanceAfter: Number(vals.available_qty),
            reason: vals.reason,
          });
        }
        _renderStock(el);
      });
    });
  });
}

async function _renderLow(el) {
  const data = await getLowStock();
  el.innerHTML = _tabs('low') + (data.length === 0
    ? '<div class="v2-inv-empty">لا توجد منتجات منخفضة المخزون</div>'
    : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>المنتج</th><th>متاح</th><th>الحد الأدنى</th><th>الحالة</th></tr></thead><tbody>${data.map(s => {
      const critical = s.available_qty <= 0;
      return `<tr style="background:${critical ? '#fef2f2' : '#fffbeb'}">
        <td><a href="#ops/inventory/${s.product_id}">${_e(s.product?.product_name || s.product_id)}</a></td>
        <td class="v2-inv-num" style="color:${critical ? '#dc2626' : '#d97706'}">${_n(s.available_qty)}</td>
        <td class="v2-inv-num">${_n(s.minimum_qty)}</td>
        <td>${critical ? '⚠️ حرج' : '⚡ منخفض'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`);
}

async function _renderReservations(el) {
  const data = await getReservations();
  el.innerHTML = _tabs('reservations') + (data.length === 0
    ? '<div class="v2-inv-empty">لا توجد حجوزات نشطة</div>'
    : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>رقم الحجز</th><th>المنتج</th><th>الكمية</th><th>تاريخ الإنشاء</th><th></th></tr></thead><tbody>${data.map(r => `<tr>
      <td>${_e(r.reservation_number || `#${r.id}`)}</td>
      <td>${_e(r.product_code_snapshot || r.product_name_snapshot || r.product_name || '—')}</td>
      <td class="v2-inv-num">${_n(r.quantity)}</td>
      <td>${_d(r.created_at)}</td>
      <td><button class="v2-inv-act" data-release="${r.id}">إلغاء الحجز</button></td>
    </tr>`).join('')}</tbody></table></div>`);

  el.querySelectorAll('[data-release]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'جاري...';
      try {
        await releaseReservation(btn.dataset.release);
        _renderReservations(el);
      } catch { btn.textContent = 'فشل'; }
    });
  });
}

async function _renderMovements(el) {
  const r = await import('../../../../services/inventory/inventoryApi.js').then(m => m.getRecentMovements());
  el.innerHTML = _tabs('movements') + (r.length === 0
    ? '<div class="v2-inv-empty">لا توجد حركة مخزون حديثة</div>'
    : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>التاريخ</th><th>النوع</th><th>الكمية</th><th>الاتجاه</th><th>الرصيد بعد</th></tr></thead><tbody>${r.map(m => `<tr>
      <td>${_d(m.created_at)}</td>
      <td>${MOVEMENT_LABELS[m.movement_type] || m.movement_type}</td>
      <td class="v2-inv-num">${_n(m.quantity)}</td>
      <td>${m.direction === 'in' ? 'داخل' : m.direction === 'out' ? 'خارج' : '—'}</td>
      <td class="v2-inv-num">${m.balance_after != null ? _n(m.balance_after) : '—'}</td>
    </tr>`).join('')}</tbody></table></div>`);
}

function _tabs(active) {
  return `<div class="v2-inv-tabs">${TABS.map(t =>
    `<button class="v2-inv-tab${t.k === active ? ' v2-inv-ta' : ''}" data-tab="${t.k}">${t.l}</button>`
  ).join('')}</div>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _n(v) { if (v == null) return '0'; return Number(v).toLocaleString('en-US'); }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
