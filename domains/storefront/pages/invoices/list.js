import { getMyInvoices, formatStatus, getOrderItemsForEdit } from '../../../../services/storefront/invoicesApi.js';
import { getSession } from '../../../../auth/sessionService.js';
import { setSelectedCustomer, restoreCartFromOrder, setEditOrderId } from '../../../../services/storefront/cartApi.js';

const PAGE_SIZE = 20;

export async function renderInvoicesList(container) {
  const hash = (location.hash || '').replace(/^#/, '');
  const qIdx = hash.indexOf('?');
  const qs = qIdx >= 0 ? new URLSearchParams(hash.slice(qIdx + 1)) : new URLSearchParams();
  const customerId = qs.get('customer') || '';

  container.innerHTML = '<div class="v2-il"><div class="v2-il-loading">جاري تحميل الفواتير...</div></div>';
  try {
    await _render(container, 0, customerId);
  } catch { _error(container); }
}

async function _render(container, offset, customerId) {
  container.innerHTML = `<div class="v2-il"><div class="v2-il-grid"></div><div class="v2-il-foot"></div></div>`;
  const grid = container.querySelector('.v2-il-grid');
  const foot = container.querySelector('.v2-il-foot');
  grid.innerHTML = '<div class="v2-il-loading">جاري التحميل...</div>';

  let result;
  try {
    result = await getMyInvoices({ limit: PAGE_SIZE, offset, customerId: customerId || undefined });
  } catch {
    grid.innerHTML = '<div class="v2-il-error"><p>فشل تحميل الفواتير</p><button class="v2-retry">إعادة المحاولة</button></div>';
    grid.querySelector('.v2-retry')?.addEventListener('click', () => _render(container, offset, customerId));
    return;
  }

  if (!result.data.length) {
    grid.innerHTML = '<div class="v2-il-empty"><p>لا توجد فواتير بعد</p><p class="v2-il-hint">عند إنشاء طلب جديد ستظهر فواتيرك هنا</p></div>';
    return;
  }

  const actor = getSession()?.actor;
  grid.innerHTML = `<div class="v2-il-items">${result.data.map(inv => _card(inv, actor)).join('')}</div>`;

  const total = result.count;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  foot.innerHTML = _pagination(totalPages, currentPage, total);

  foot.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pg = parseInt(btn.dataset.page, 10);
      if (pg !== currentPage) _render(container, (pg - 1) * PAGE_SIZE, customerId);
    });
  });

  grid.querySelectorAll('[data-link]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const href = el.dataset.link;
      if (href) location.hash = href;
    });
  });

  grid.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      btn.textContent = 'جاري...';
      try {
        await _handleEdit(e);
      } catch { btn.disabled = false; btn.textContent = 'تعديل الطلب'; }
    });
  });
}

function _card(inv, actor) {
  const created = new Date(inv.created_at || Date.now());
  const dateStr = created.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
  const num = inv.order_number || inv.invoice_number || '—';
  const customerName = inv.customer_name_snapshot || '';
  const customerPhone = inv.customer_phone_snapshot || '';
  const customerAddress = inv.customer_address_snapshot || '';
  const ownerName = inv.owner_name_snapshot || '';
  const repName = inv.created_by_name_snapshot || '';
  const repPhone = inv.created_by_phone_snapshot || '';
  const status = inv.order_status || inv.workflow_status || 'pending';
  const badgeClass = _badgeClass(status);
  const docType = _docTitle(status);
  const custInfo = customerName + (customerPhone ? ' - ' + customerPhone : '');
  const namesHtml = `<div class="v2-il-customer">👤 ${_e(custInfo)}</div>`
    + (customerAddress ? `<div class="v2-il-owner">📍 ${_e(customerAddress)}</div>` : '')
    + (repName ? `<div class="v2-il-owner">🧑‍💼 ${_e(repName)}${repPhone ? ' - ' + _e(repPhone) : ''}</div>` : '');
  const canEdit = actor?.type === 'employee' && String(inv.created_by_employee_id) === String(actor?.id) && ['submitted','pending','reviewing'].includes(status);
  return `<div class="v2-il-card" data-link="#invoices/${inv.id}" tabindex="0" role="button">
    <div class="v2-il-card-inner">
      <div class="v2-il-top">
        <span class="v2-il-num"># ${_e(String(num))}</span>
        <span class="v2-il-badge ${badgeClass}">${formatStatus(status)}</span>
      </div>
      ${namesHtml}
      <div class="v2-il-bottom">
        <span class="v2-il-date">${dateStr}</span>
        <span class="v2-il-amount">${_money(inv.total_amount)}</span>
      </div>
    </div>
    ${canEdit ? `<button class="v2-il-edit-btn" data-action="edit" data-order-id="${inv.id}" data-customer-id="${inv.customer_id || ''}" data-customer-name="${_e(customerName)}" data-customer-phone="${_e(customerPhone)}" data-customer-address="${_e(customerAddress)}">تعديل الطلب</button>` : ''}
  </div>`;
}

function _badgeClass(status) {
  const ok = new Set(['delivered','approved','confirmed','collected','paid','completed']);
  const no = new Set(['cancelled','returned','rejected']);
  const pending = new Set(['pending','draft','submitted']);
  if (ok.has(status)) return 'v2-il-badge-ok';
  if (no.has(status)) return 'v2-il-badge-no';
  if (pending.has(status)) return 'v2-il-badge-pending';
  return 'v2-il-badge-info';
}

function _pagination(totalPages, current, total) {
  if (totalPages <= 1) return `<div class="v2-il-total">إجمالي الفواتير: ${total}</div>`;
  let h = '<div class="v2-il-pages">';
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - current) <= 2) {
      h += `<button class="v2-il-page${i === current ? ' v2-il-pa' : ''}" data-page="${i}">${i}</button>`;
    } else if (i === current - 3 || i === current + 3) {
      h += '<span class="v2-il-ell">...</span>';
    }
  }
  h += `</div><div class="v2-il-total">${total} فاتورة</div>`;
  return h;
}

function _error(container) {
  container.innerHTML = '<div class="v2-il"><div class="v2-il-error"><p>فشل تحميل الفواتير</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
  container.querySelector('.v2-retry')?.addEventListener('click', () => renderInvoicesList(container));
}

async function _handleEdit(e) {
  const btn = e.currentTarget;
  const orderId = btn.dataset.orderId;
  const customerId = btn.dataset.customerId;
  if (!orderId) return;
  const ses = getSession();
  if (ses?.actor?.type !== 'employee') return;
  const items = await getOrderItemsForEdit(orderId);
  setSelectedCustomer({
    id: customerId || '',
    name: btn.dataset.customerName || '',
    phone: btn.dataset.customerPhone || '',
    address: btn.dataset.customerAddress || '',
  });
  restoreCartFromOrder({ id: orderId, total_amount: 0 }, items);
  setEditOrderId(orderId);
  location.hash = '#checkout?edit=1';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _docTitle(status) {
  const s = String(status || '').trim().toLowerCase();
  return ['pending', 'reviewing', 'submitted'].includes(s) ? 'طلب شراء' : 'فاتورة';
}
