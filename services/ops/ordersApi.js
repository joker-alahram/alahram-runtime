import { logError } from '../../utils/logger.js';
import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { buildOrderScopeFilter } from '../storefront/governanceRuntime.js';
import { orderListSelect, orderDetailSelect } from '../contracts/orders.contract.js';
import { canExecuteTransition } from '../runtime/workflowAuthority.js';
import { logTimelineEvent } from '../storefront/orderTimelineApi.js';

const API = readConfig().baseUrl;
const HEADERS = () => {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  return h;
};

export async function getOrders({ status, limit = 50, offset = 0 } = {}) {
  const scopeFilter = buildOrderScopeFilter();
  let rows;
  if (scopeFilter) {
    const match = scopeFilter.match(/created_by_employee_id=in\.\(([^)]+)\)/);
    if (match) {
      const empIds = match[1].split(',');
      const empId = empIds[0];
      const body = { p_employee_id: empId, p_limit: String(limit), p_offset: String(offset) };
      if (status) body.p_status_filter = status;
      if (empIds.length > 1) body.p_employee_ids = empIds;
      const r = await fetch(`${API}/rpc/get_visible_orders`, {
        method: 'POST', headers: HEADERS(), body: JSON.stringify(body),
      });
      if (r.ok) rows = await r.json();
    }
  }
  if (!rows) {
    const select = orderListSelect();
    let url = `${API}/runtime_order_visibility?select=${select}&order=created_at.desc&limit=${limit}&offset=${offset}`;
    if (scopeFilter) url += `&${scopeFilter}`;
    if (status) url += `&order_status=eq.${status}`;
    const r = await fetch(url, { headers: HEADERS() });
    if (!r.ok) throw new Error('فشل تحميل الطلبات');
    rows = await r.json();
  }
  // Resolve missing customer snapshots from runtime_customer_visibility
  const missingCustIds = [...new Set(rows.filter(r => !r.customer_name_snapshot).map(r => r.customer_id).filter(Boolean))];
  if (missingCustIds.length) {
    try {
      const custRes = await fetch(`${API}/runtime_customer_visibility?id=in.(${missingCustIds.join(',')})&select=id,customer_name,phone,address`, { headers: HEADERS() });
      if (custRes.ok) {
        const custData = await custRes.json();
        const custMap = Object.fromEntries(custData.map(c => [c.id, c]));
        for (const row of rows) {
          if (!row.customer_name_snapshot && custMap[row.customer_id]) {
            row.customer_name_snapshot = custMap[row.customer_id].customer_name || '';
            row.customer_phone_snapshot = row.customer_phone_snapshot || custMap[row.customer_id].phone || '';
            row.customer_address_snapshot = row.customer_address_snapshot || custMap[row.customer_id].address || '';
          }
        }
      }
    } catch {}
  }
  // Resolve missing creator snapshots from orders table
  const missingCreatorIds = [...new Set(rows.filter(r => !r.created_by_name_snapshot).map(r => r.id).filter(Boolean))];
  if (missingCreatorIds.length) {
    try {
      const ordRes = await fetch(`${API}/orders?id=in.(${missingCreatorIds.join(',')})&select=id,created_by_name_snapshot,created_by_phone_snapshot`, { headers: HEADERS() });
      if (ordRes.ok) {
        const ordData = await ordRes.json();
        const ordMap = Object.fromEntries(ordData.map(o => [o.id, o]));
        for (const row of rows) {
          if (!row.created_by_name_snapshot && ordMap[row.id]) {
            row.created_by_name_snapshot = ordMap[row.id].created_by_name_snapshot || '';
            row.created_by_phone_snapshot = row.created_by_phone_snapshot || ordMap[row.id].created_by_phone_snapshot || '';
          }
        }
      }
    } catch {}
  }
  return rows;
}

export async function countOrders(status) {
  const scopeFilter = buildOrderScopeFilter();
  let url = `${API}/runtime_order_visibility?select=id&limit=0`;
  if (scopeFilter) url += `&${scopeFilter}`;
  if (status) url += `&order_status=eq.${status}`;
  const r = await fetch(url, { headers: { ...HEADERS(), Prefer: 'count=exact' } });
  if (!r.ok) throw new Error('فشل تحميل عدد الطلبات');
  const cr = r.headers.get('content-range');
  return cr ? parseInt(cr.split('/')[1], 10) : 0;
}

export async function getOrderDetail(orderId) {
  const empId = getSession()?.actor?.id || '';
  if (empId) {
    const authBody = { p_employee_id: empId, p_order_id: orderId };
    const authRes = await fetch(`${API}/rpc/employee_can_access_order`, {
      method: 'POST', headers: HEADERS(), body: JSON.stringify(authBody),
    });
    const hasAccess = authRes.ok ? await authRes.json() : false;
    if (!hasAccess) throw new Error('لا تملك صلاحية الوصول لهذا الطلب');
  }

  const detailSelect = orderDetailSelect();
  const [orderArr, items, ordersRow, timelineRows] = await Promise.all([
    fetch(`${API}/runtime_order_visibility?id=eq.${orderId}&select=${detailSelect}`, {
      headers: HEADERS(),
    }).then(r => { if (!r.ok) throw new Error('فشل تحميل تفاصيل الطلب'); return r.json(); }),
    fetch(`${API}/order_items?order_id=eq.${orderId}&select=id,order_id,product_id,product_unit_id,quantity,base_price,discount_percent,discount_amount,final_price,line_subtotal,line_total,total_amount,product_name_snapshot,product_code_snapshot,unit_name_snapshot,unit_code_snapshot,company_name_snapshot,tier_name_snapshot,tier_price,created_at`, { headers: HEADERS() }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/orders?id=eq.${orderId}&select=id,revision,updated_at,updated_by,execution_accuracy_meters,execution_captured_at`, { headers: HEADERS() }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/order_timeline?order_id=eq.${orderId}&order=created_at.asc&select=*`, { headers: HEADERS() }).then(r => r.ok ? r.json() : []),
  ]);
  const order = orderArr[0];
  if (!order) throw new Error('الطلب غير موجود');
  const ext = ordersRow[0] || {};
  order.revision = ext.revision || 0;
  order.updated_at = ext.updated_at || null;
  order.updated_by = ext.updated_by || null;
  if (ext.execution_accuracy_meters != null) order.execution_accuracy_meters = ext.execution_accuracy_meters;
  if (ext.execution_captured_at) order.execution_captured_at = ext.execution_captured_at;
  order.timeline = timelineRows || [];
  // Resolve missing actor_name from employees table
  if (order.timeline.length > 0) {
    const missingNameRows = order.timeline.filter(t => !t.actor_name && t.actor_id);
    if (missingNameRows.length > 0) {
      const ids = missingNameRows.map(t => t.actor_id).join(',');
      try {
        const empRes = await fetch(`${API}/employees?select=id,full_name,phone&id=in.(${ids})`, { headers: HEADERS() });
        if (empRes.ok) {
          const emps = await empRes.json();
          const empMap = {};
          (Array.isArray(emps) ? emps : []).forEach(e => { empMap[e.id] = e; });
          order.timeline.forEach(t => {
            if (!t.actor_name && t.actor_id && empMap[t.actor_id]) {
              t.actor_name = empMap[t.actor_id].full_name;
              if (!t.actor_phone) t.actor_phone = empMap[t.actor_id].phone;
            }
          });
        }
      } catch {}
    }
  }
  order.docType = _docType(order.order_status);

  // Resolve updated_by UUID to name
  if (order.updated_by) {
    try {
      const empRes = await fetch(`${API}/employees?select=id,full_name&id=eq.${order.updated_by}`, { headers: HEADERS() });
      if (empRes.ok) {
        const empArr = await empRes.json();
        if (empArr.length > 0) order.updated_by_name = empArr[0].full_name;
      }
    } catch {}
  }

  // Customer fallback: fetch from runtime_customer_visibility if snapshot missing
  if (!order.customer_name_snapshot && order.customer_id) {
    try {
      const custRes = await fetch(`${API}/runtime_customer_visibility?id=eq.${order.customer_id}&select=id,customer_name,phone,address`, { headers: HEADERS() });
      if (custRes.ok) {
        const custArr = await custRes.json();
        const cust = custArr[0];
        if (cust) {
          order.customer_name_snapshot = cust.customer_name || '';
          order.customer_phone_snapshot = cust.phone || '';
          order.customer_address_snapshot = cust.address || '';
        }
      }
    } catch {}
  }

  // Creator fallback: fetch from orders table if snapshot missing
  if (!order.created_by_name_snapshot && order.id) {
    try {
      const ordRes = await fetch(`${API}/orders?id=eq.${order.id}&select=id,created_by_name_snapshot,created_by_phone_snapshot`, { headers: HEADERS() });
      if (ordRes.ok) {
        const ordArr = await ordRes.json();
        const ord = ordArr[0];
        if (ord) {
          order.created_by_name_snapshot = ord.created_by_name_snapshot || '';
          order.created_by_phone_snapshot = order.created_by_phone_snapshot || ord.created_by_phone_snapshot || '';
        }
      }
    } catch {}
  }

  // Build location link from execution coordinates
  if (order.execution_latitude && order.execution_longitude) {
    order.execution_maps_url = `https://www.google.com/maps?q=${order.execution_latitude},${order.execution_longitude}`;
  }

  return { ...order, items };
}

export async function applyTransition(orderId, targetStatus, note) {
  const order = await getOrderDetail(orderId);
  const auth = await canExecuteTransition({
    domain: 'order',
    originStatus: order.order_status || order.workflow_status || '',
    targetStatus,
    user: { ...(getSession()?.actor ? { employeeId: getSession().actor.id } : {}), order },
  });
  if (!auth.allowed) {
    throw new Error(auth.reason === 'role_required' ? 'لا تملك صلاحية تنفيذ هذا الإجراء' : 'لا تملك صلاحية كافية');
  }

  const patchBody = { order_status: targetStatus };
  const r = await fetch(`${API}/orders?id=eq.${orderId}`, {
    method: 'PATCH', headers: HEADERS(),
    body: JSON.stringify(patchBody),
  });
  if (r.ok) {
    try {
      const ses = getSession();
      const t = String(targetStatus || '').trim().toLowerCase();
      const eventType = t === 'pending' ? 'return_to_cart' : t === 'submitted' ? 'resubmitted' : t === 'approved' ? 'approved' : 'status_changed';
      await logTimelineEvent(orderId, eventType, {
        oldValue: { order_status: order.order_status || order.workflow_status },
        newValue: { order_status: targetStatus },
        changeDetails: [{ type: 'STATUS_CHANGE', from: order.order_status || order.workflow_status, to: targetStatus, note: note || null }],
      });
    } catch (_) {}
    return { success: true, entity_id: orderId, new_status: targetStatus };
  }
  const errText = await r.text().catch(() => '');
  throw new Error('فشل تطبيق التغيير: ' + (errText.slice(0, 100) || r.status));
}

function _docType(status) {
  const s = String(status || '').trim().toLowerCase();
  return ['pending', 'reviewing', 'submitted'].includes(s) ? 'طلب شراء' : 'فاتورة';
}

export async function getAvailableTransitions() {
  const r = await fetch(`${API}/workflow_transitions?domain=eq.order&select=*`, {
    headers: HEADERS(),
  });
  if (!r.ok) return [];
  return r.json();
}

