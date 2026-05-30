import { getOrderDetail, applyTransition } from '../../../../services/ops/ordersApi.js';
import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';
import { showModal, confirmDelete, apiPatch, apiDelete, addStyles } from '../crudHelper.js';
import { getAllowedTransitions, canExecuteTransition } from '../../../../services/runtime/workflowAuthority.js';
import { getIdentity } from '../../../../services/storefront/governanceRuntime.js';
import { buildInvoiceViewModel } from '../../../../services/storefront/invoiceViewModel.js';
import { buildCanonicalInvoiceHtml, _e, _money } from '../../../../services/storefront/canonicalInvoice.js';
import { renderInvoiceHtml, printInvoice, printInvoiceA5 } from '../../../../services/storefront/pdfService.js';

const STATUS_LABELS = {
  submitted: 'مُقدم', reserved: 'محجوز',
  pending: 'قيد الانتظار', reviewing: 'قيد المراجعة', approved: 'معتمد',
  preparing: 'قيد التجهيز', dispatched: 'مُرسل', delivered: 'مُسلّم', cancelled: 'ملغي',
};
const STATUS_COLORS = {
  submitted: '#f59e0b', reserved: '#6366f1',
  pending: '#f59e0b', reviewing: '#3b82f6', approved: '#10b981',
  preparing: '#8b5cf6', dispatched: '#06b6d4', delivered: '#22c55e', cancelled: '#ef4444',
};

export async function renderOrderDetail(container, { orderId }) {
  addStyles();
  container.innerHTML = `<div class="v2-od"><div class="v2-ol-loading">جاري التحميل...</div></div>`;

  let order;
  try {
    order = await getOrderDetail(orderId);
  } catch {
    container.innerHTML = `<div class="v2-od"><div class="v2-ol-error"><p>فشل تحميل تفاصيل الطلب</p><a href="#ops/orders" class="v2-retry">العودة للطلبات</a></div></div>`;
    return;
  }

  const ses = getSession();
  const items = Array.isArray(order.items) ? order.items : [];
  const vm = buildInvoiceViewModel({ order, items, session: ses, activeVisit: null });

  const user = { ...(getIdentity() || {}), order };
  const [actions, deleteGuard] = await Promise.all([
    getAllowedTransitions({ domain: 'order', currentStatus: order.order_status || order.workflow_status || '', user }),
    canExecuteTransition({ domain: 'order', originStatus: order.order_status || order.workflow_status || '', targetStatus: 'delete', user }),
  ]);

  const el = container.querySelector('.v2-od');
  if (!el) return;

  const timeline = ['pending', 'reviewing', 'approved', 'preparing', 'dispatched', 'delivered'];
  const currentIdx = timeline.indexOf(order.order_status);
  const st = STATUS_COLORS[order.order_status] || '#6b7280';
  const history = Array.isArray(order.history) ? order.history : [];
  const actionsHtml = actions.length > 0 || deleteGuard.allowed
    ? `<div class="v2-od-actions"><h3>الإجراءات</h3>
      ${actions.map(a => `<button class="v2-od-act" data-action="${a.target_status}">${_e(a.label)}</button>`).join('')}
      ${deleteGuard.allowed ? `<button class="v2-btn v2-btn-sm" data-del-order style="color:#dc2626;border-color:#dc2626">حذف الطلب</button>` : ''}
    </div>` : '';

  el.innerHTML = `<a href="#ops/orders" class="v2-od-back">← العودة للطلبات</a>
    ${buildCanonicalInvoiceHtml(vm)}

    <div class="v2-com-actions" style="margin:0 2rem 1rem;display:flex;gap:.5rem;flex-wrap:wrap">
      <button class="v2-com-btn v2-com-btn-pdf" id="v2-od-pdf-a4">🖨️ PDF A4</button>
      <button class="v2-com-btn v2-com-btn-pdf" id="v2-od-pdf-a5" style="background:#059669">📱 PDF A5</button>
    </div>

    <!-- Workflow Timeline -->
    ${order.order_status !== 'cancelled' ? `<div class="v2-com-timeline v2-od-tl-slim">
      <div class="v2-com-tl-title">🔄 سير العمل</div>
      <div class="v2-od-tl-steps">${timeline.map((s, i) => {
        const done = i < currentIdx;
        const cur = i === currentIdx;
        const step = cur ? `<span class="v2-od-tl-cur" style="background:${st}">${STATUS_LABELS[s]}</span>`
          : `<span class="v2-od-tl-step${done ? ' v2-od-tl-done' : ''}">${STATUS_LABELS[s]}</span>`;
        return i === 0 ? step : `<span class="v2-od-tl-arr">→</span>${step}`;
      }).join('')}</div>
      ${order.order_status === 'cancelled' ? `<div class="v2-od-tl-msg">تم إلغاء الطلب</div>` : ''}
    </div>` : `<div class="v2-com-timeline"><div class="v2-com-tl-status" style="color:#dc2626">❌ تم إلغاء الطلب</div></div>`}

    ${actionsHtml}
  </div>`;

  el.querySelector('#v2-od-pdf-a4')?.addEventListener('click', () => {
    const html = renderInvoiceHtml(vm);
    printInvoice(html);
  });

  el.querySelector('#v2-od-pdf-a5')?.addEventListener('click', () => {
    printInvoiceA5(vm);
  });

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const target = btn.dataset.action;
      btn.disabled = true; btn.textContent = 'جاري...';
      try {
        await applyTransition(orderId, target);
        renderOrderDetail(container, { orderId });
      } catch {
        btn.disabled = false; btn.textContent = 'فشل';
      }
    });
  });

  if (deleteGuard.allowed) {
    el.querySelector('[data-del-order]')?.addEventListener('click', async () => {
      const ok = await confirmDelete(`حذف الطلب ${order.order_number}؟`);
      if (!ok) return;
      await apiDelete('orders', orderId);
      window.location.hash = '#ops/orders';
    });
  }
}

function _date(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
function _time(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
