import { getOrders, applyTransition, countOrders } from '../../../../services/ops/ordersApi.js';
import { getSession } from '../../../../auth/sessionService.js';
import { readConfig } from '../../../../config.js';
import { confirmDelete, apiDelete, addStyles } from '../crudHelper.js';
import { getAllowedTransitions, canExecuteTransition } from '../../../../services/runtime/workflowAuthority.js';
import { getIdentity } from '../../../../services/storefront/governanceRuntime.js';

function _h() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

const STATUS_META = {
  submitted:  { label: 'مُقدم',      icon: '📋', color: '#f59e0b', bg: '#fffbeb' },
  pending:    { label: 'قيد الانتظار', icon: '⏳', color: '#f59e0b', bg: '#fffbeb' },
  reviewing:  { label: 'قيد المراجعة', icon: '🔍', color: '#3b82f6', bg: '#eff6ff' },
  approved:   { label: 'معتمد',       icon: '✅', color: '#10b981', bg: '#ecfdf5' },
  preparing:  { label: 'قيد التجهيز',  icon: '⚙️', color: '#8b5cf6', bg: '#f5f3ff' },
  dispatched: { label: 'مُرسل',       icon: '🚚', color: '#06b6d4', bg: '#ecfeff' },
  delivered:  { label: 'مُسلّم',      icon: '📦', color: '#22c55e', bg: '#f0fdf4' },
  cancelled:  { label: 'ملغي',       icon: '❌', color: '#ef4444', bg: '#fef2f2' },
};
const QUEUE_KEYS = ['submitted', 'pending', 'reviewing', 'approved', 'preparing', 'dispatched', 'delivered', 'cancelled'];

let _activeQueue = null;
let _statusCounts = {};
let _allowedByOrderId = {};
let _canDeleteByOrderId = {};

export async function renderOrdersList(container) {
  addStyles();
  container.innerHTML = `<div class="v2-ol"><div class="v2-ol-loading">جاري التحميل...</div></div>`;

  try {
    const counts = await Promise.all(QUEUE_KEYS.map(k => countOrders(k).catch(() => 0)));
    _statusCounts = Object.fromEntries(QUEUE_KEYS.map((k, i) => [k, counts[i]]));
    const allCount = Object.values(_statusCounts).reduce((s, v) => s + (v || 0), 0);
    _statusCounts = { null: allCount, ..._statusCounts };
    await _render(container);
  } catch {
    container.innerHTML = `<div class="v2-ol"><div class="v2-ol-error"><p>فشل تحميل بيانات الطلبات</p><button class="v2-retry">إعادة المحاولة</button></div></div>`;
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOrdersList(container));
  }
}

async function _render(container) {
  const q = _activeQueue;
  container.innerHTML = `<div class="v2-ol">${_tabs(q)}<div class="v2-ol-loading">جاري التحميل...</div></div>`;

  let orders;
  try {
    orders = await getOrders({ status: q || undefined });
  } catch {
    const el = container.querySelector('.v2-ol');
    if (el) el.innerHTML = _tabs(q) + `<div class="v2-ol-error"><p>فشل تحميل الطلبات</p><button class="v2-retry">إعادة المحاولة</button></div>`;
    container.querySelector('.v2-retry')?.addEventListener('click', () => _render(container));
    return;
  }

  const identity = getIdentity() || {};
  const resolved = await Promise.all((orders || []).map(async (o) => {
    const user = { ...identity, order: o };
    const [actions, deleteGuard] = await Promise.all([
      getAllowedTransitions({ domain: 'order', currentStatus: o.order_status || o.workflow_status || '', user }),
      canExecuteTransition({ domain: 'order', originStatus: o.order_status || o.workflow_status || '', targetStatus: 'delete', user }),
    ]);
    return [o.id, actions, deleteGuard.allowed];
  }));
  _allowedByOrderId = Object.fromEntries(resolved.map(([id, actions]) => [id, actions]));
  _canDeleteByOrderId = Object.fromEntries(resolved.map(([id, , canDelete]) => [id, canDelete]));

  const el = container.querySelector('.v2-ol');
  if (!el) return;
  el.innerHTML = _tabs(q) + (orders.length === 0
    ? `<div class="v2-ol-empty">لا توجد طلبات في هذه الحالة</div>`
    : `<div class="v2-ol-items">${orders.map(o => _card(o)).join('')}</div>`);

  el.querySelectorAll('[data-q]').forEach(btn => {
    btn.addEventListener('click', () => { _activeQueue = btn.dataset.q; _render(container); });
  });

  el.querySelectorAll('[data-status-select]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const orderId = sel.dataset.order;
      const target = sel.value;
      if (!target) return;
      sel.disabled = true;
      try {
        await applyTransition(orderId, target);
        _render(container);
      } catch {
        sel.disabled = false;
        sel.value = '';
      }
    });
  });

  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const orderId = btn.dataset.del;
      if (!_canDeleteByOrderId[orderId]) return;
      const ok = await confirmDelete('حذف هذا الطلب؟');
      if (!ok) return;
      btn.disabled = true; btn.textContent = 'جاري...';
      try {
        const order = orders.find(o => String(o.id) === String(orderId));
        const guard = await canExecuteTransition({ domain: 'order', originStatus: order?.order_status || order?.workflow_status || '', targetStatus: 'delete', user: { ...(getIdentity() || {}), order } });
        if (!guard.allowed) throw new Error(guard.reason || 'غير مسموح');
        await apiDelete('orders', orderId);
        _render(container);
      } catch {
        btn.disabled = false; btn.textContent = 'فشل';
      }
    });
  });
}

function _tabs(active) {
  const allMeta = { label: 'الكل', icon: '📊', color: '#374151', bg: '#f3f4f6' };
  const cards = [{ key: null, ...allMeta, count: _statusCounts['null'] || 0 }];
  for (const k of QUEUE_KEYS) {
    const m = STATUS_META[k];
    cards.push({ key: k, ...m, count: _statusCounts[k] || 0 });
  }
  return `<div class="v2-osc-row">${cards.map(c => {
    const isActive = c.key === active;
    return `<button class="v2-osc-card${isActive ? ' v2-osc-active' : ''}" data-q="${c.key}" style="${isActive ? `border-color:${c.color};background:${c.bg}` : ''}">
      <span class="v2-osc-icon">${c.icon}</span>
      <span class="v2-osc-label" style="color:${c.color}">${c.label}</span>
      <span class="v2-osc-count" style="background:${c.color}">${c.count}</span>
    </button>`;
  }).join('')}</div>`;
}

function _card(o) {
  const m = STATUS_META[o.order_status];
  const st = m?.color || '#6b7280';
  const stLbl = m?.label || o.order_status || '';
  const stIcon = m?.icon || '📄';
  const docType = _docTitle(o.order_status);
  const custName = o.customer_name_snapshot || '—';
  const custPhone = o.customer_phone_snapshot || '';
  const custAddress = o.customer_address_snapshot || '';
  const repName = o.created_by_name_snapshot || '—';
  const repPhone = o.created_by_phone_snapshot || '';
  const priority = o.priority || 'normal';
  const priorityLabel = priority === 'urgent' ? 'عاجل' : priority === 'high' ? 'مرتفع' : '';
  const actions = _allowedByOrderId[o.id] || [];
  const hasTransitions = actions.length > 0;

  const dt = o.created_at ? new Date(o.created_at) : null;
  const dateStr = dt ? dt.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const timeStr = dt ? dt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';

  return `<div class="v2-oc-card" style="border:1px solid #e2e8f0;border-radius:12px;margin-bottom:.75rem;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.625rem .75rem;background:#f8fafc;border-bottom:1px solid #e2e8f0">
      <div style="font-size:1rem;font-weight:700;color:#0d2b6b">${docType} ${_e(o.order_number || '—')}</div>
      <div style="display:flex;align-items:center;gap:.5rem">
        <div style="font-size:.8125rem;font-weight:700;color:#059669">${_money(o.total_amount)}</div>
        <div style="background:${st};font-size:.6875rem;padding:.25rem .625rem;border-radius:999px;color:#fff;white-space:nowrap;display:flex;align-items:center;gap:.25rem"><span>${stIcon}</span> ${stLbl}</div>
      </div>
    </div>
    <div style="padding:.75rem">
      <div style="display:flex;flex-wrap:wrap;gap:1rem">
        <div style="flex:2;min-width:180px;padding:.5rem;background:#f0f7ff;border-radius:8px;border-right:3px solid #0d2b6b">
          <div style="font-size:.6875rem;font-weight:700;color:#0d2b6b;text-transform:uppercase;margin-bottom:4px">👤 العميل</div>
          <div style="font-weight:700;font-size:.9375rem;color:#1e293b">${_e(custName)}</div>
          ${custPhone ? `<div style="font-size:.8125rem;color:#475569;margin-top:2px">📞 ${_e(custPhone)}</div>` : ''}
          ${custAddress ? `<div style="font-size:.8125rem;color:#475569">📍 ${_e(custAddress)}</div>` : ''}
        </div>
        <div style="flex:1;min-width:140px;padding:.5rem;background:#fafafa;border-radius:8px">
          <div style="font-size:.6875rem;font-weight:700;color:#6b7280;margin-bottom:4px">🧑‍💼 مندوب المبيعات</div>
          <div style="font-weight:600;font-size:.875rem;color:#1e293b">${_e(repName)}</div>
          ${repPhone ? `<div style="font-size:.8125rem;color:#475569;margin-top:2px" dir="ltr">📞 ${_e(repPhone)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:.75rem;font-size:.75rem;color:#6b7280;margin-top:.5rem;padding-top:.5rem;border-top:1px solid #f1f5f9">
        <span>📅 ${_e(dateStr)}</span>
        <span>🕐 ${_e(timeStr)}</span>
        ${o.items_count != null ? `<span>📦 ${o.items_count} صنف</span>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:.5rem;padding:.5rem .75rem;border-top:1px solid #e2e8f0;background:#f8fafc">
      <a href="#ops/orders/${o.id}" style="padding:.375rem .75rem;background:#0d2b6b;color:#fff;border-radius:8px;font-size:.75rem;font-weight:600;text-decoration:none">📄 عرض</a>
      ${hasTransitions ? `
        <select class="v2-oc-select" data-status-select data-order="${o.id}" style="font-size:.75rem;padding:.375rem .5rem;border-radius:8px;border:1px solid #d1d5db;background:#fff;flex:1;min-width:120px">
          <option value="">تغيير الحالة...</option>
          ${actions.map(a => `<option value="${a.target_status}">${a.label}</option>`).join('')}
        </select>` : `<span style="font-size:.75rem;color:#9ca3af;padding:.375rem 0">—</span>`}
      ${_canDeleteByOrderId[o.id] ? `<button class="v2-oc-del" data-del="${o.id}" style="padding:.375rem .5rem;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#dc2626;cursor:pointer;font-size:.75rem" title="حذف">🗑️</button>` : ''}
    </div>
  </div>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _docTitle(status) {
  const s = String(status || '').trim().toLowerCase();
  return ['pending', 'reviewing', 'submitted'].includes(s) ? 'طلب شراء' : 'فاتورة';
}
