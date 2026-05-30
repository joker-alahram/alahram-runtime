import { getInvoiceDetail } from '../../../../services/storefront/invoicesApi.js';
import { buildWhatsAppMessage } from '../../../../services/storefront/transportRuntime.js';
import { buildInvoiceViewModel } from '../../../../services/storefront/invoiceViewModel.js';
import { renderInvoiceHtml, printInvoice, printInvoiceA5 } from '../../../../services/storefront/pdfService.js';
import { buildCanonicalInvoiceHtml, _e, _money } from '../../../../services/storefront/canonicalInvoice.js';
import { getSession } from '../../../../auth/sessionService.js';
import { logError } from '../../../../utils/logger.js';
import { getActiveVisit } from '../../../../services/storefront/visitsApi.js';
import { setEditOrderId, restoreCartFromOrder, setSelectedCustomer } from '../../../../services/storefront/cartApi.js';

export async function renderInvoiceDetail(container, params) {
  const id = params.invoiceId;
  if (!id) { container.innerHTML = '<div class="v2-id-pro"><p class="v2-id-error">معرف الفاتورة غير صالح</p></div>'; return; }
  container.innerHTML = '<div class="v2-id-pro"><div class="v2-id-loading">جاري تحميل الفاتورة...</div></div>';

  try {
    const { order, items } = await getInvoiceDetail(id);
    const ses = getSession();
    const activeVisit = getActiveVisit();
    const vm = buildInvoiceViewModel({ order, items, session: ses, activeVisit });
    _render(container, vm);
  } catch {
    container.innerHTML = '<div class="v2-id-pro"><div class="v2-id-error"><p>فشل تحميل الفاتورة</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderInvoiceDetail(container, params));
  }
}

function _render(container, vm) {
  container.innerHTML = `<div class="v2-id-pro">
    <nav class="v2-id-nav"><a href="#invoices" class="v2-id-back">← العودة للفواتير</a></nav>
    ${buildCanonicalInvoiceHtml(vm)}
    <div class="v2-com-actions">
      <button class="v2-com-btn v2-com-btn-pdf" id="v2-id-pdf-a4">🖨️ PDF A4</button>
      <button class="v2-com-btn v2-com-btn-pdf" id="v2-id-pdf-a5" style="background:#059669">📱 PDF A5</button>
      ${_whatsappBtn(vm)}
      ${_editBtn(vm)}
    </div>
  </div>`;

  container.querySelector('#v2-id-pdf-a4')?.addEventListener('click', () => {
    const html = renderInvoiceHtml(vm);
    printInvoice(html);
  });

  container.querySelector('#v2-id-pdf-a5')?.addEventListener('click', () => {
    printInvoiceA5(vm);
  });

  container.querySelector('#v2-id-wa')?.addEventListener('click', () => {
    const url = buildWhatsAppMessage(vm);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });

  container.querySelector('#v2-id-edit')?.addEventListener('click', () => _handleEdit(container, vm));
}

function _whatsappBtn(vm) {
  const url = buildWhatsAppMessage(vm);
  if (!url) return '';
  return `<button class="v2-com-btn v2-com-btn-wa" id="v2-id-wa">📱 إرسال واتساب</button>`;
}

function _editBtn(vm) {
  const order = vm.invoice;
  const ses = getSession();
  const isEmployee = ses?.actor?.type === 'employee';
  const isOwn = order.createdByEmployeeId === ses?.actor?.id;
  const initialStatuses = ['submitted', 'pending', 'reviewing'];
  const canEdit = isEmployee && isOwn && initialStatuses.includes(order.status);
  if (!canEdit) return '';
  const revLabel = order.revision > 0 ? ` (تعديل رقم ${order.revision})` : '';
  return `<button class="v2-com-btn v2-com-btn-edit" id="v2-id-edit">✏️ تعديل الطلب${revLabel}</button>`;
}

function _handleEdit(container, vm) {
  const order = vm.invoice;
  const ses = getSession();
  if (ses?.actor?.type !== 'employee') return;

  // Set customer context for employee
  const customerData = {
    id: order.customerId,
    name: vm.customer.name,
    phone: vm.customer.phone,
    address: vm.customer.address,
  };
  setSelectedCustomer(customerData);

  // Restore cart with order items
  restoreCartFromOrder(order, vm.items);

  // Set edit mode
  setEditOrderId(order.id);

  // Navigate to checkout with edit flag
  location.hash = '#checkout?edit=1';
}


