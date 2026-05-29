import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { canViewOrder, scopeOrderParams } from './governanceRuntime.js';
import { orderListSelect, orderDetailSelect } from '../contracts/orders.contract.js';

const API = readConfig().baseUrl;

function _headers() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'count=exact',
  };

  return h;
}

export async function getMyInvoices({ limit = 20, offset = 0, customerId } = {}) {
  const s = getSession();
  const scope = scopeOrderParams();
  const params = new URLSearchParams({
    select: orderListSelect() + ',execution_latitude,execution_longitude,execution_maps_url,note',
    order: 'created_at.desc',
    limit: String(limit),
    offset: String(offset),
  });
  if (customerId) {
    params.append('customer_id', `eq.${customerId}`);
  } else if (scope.created_by_employee_id) {
    params.append('created_by_employee_id', scope.created_by_employee_id);
  } else if (scope.customer_id) {
    params.append('customer_id', scope.customer_id);
  } else if (s?.actor?.type === 'customer' && s?.actor?.id) {
    params.append('customer_id', `eq.${s.actor.id}`);
  } else if (s?.actor?.type !== 'employee') {
    return { data: [], count: 0 };
  }
  const r = await fetch(`${API}/runtime_order_visibility?${params}`, { headers: _headers() });
  if (!r.ok) return { data: [], count: 0 };
  const count = parseInt(r.headers.get('content-range')?.split('/')[1] || '0', 10);
  const data = await r.json();
  const missingIds = [...new Set(data.filter(r => !r.customer_name_snapshot).map(r => r.customer_id).filter(Boolean))];
  if (missingIds.length) {
    try {
      const custRes = await fetch(`${API}/runtime_customer_visibility?id=in.(${missingIds.join(',')})&select=id,customer_name,phone,address`, { headers: _headers() });
      if (custRes.ok) {
        const custData = await custRes.json();
        const custMap = Object.fromEntries(custData.map(c => [c.id, c]));
        for (const row of data) {
          if (!row.customer_name_snapshot && custMap[row.customer_id]) {
            row.customer_name_snapshot = custMap[row.customer_id].customer_name || '';
            row.customer_phone_snapshot = row.customer_phone_snapshot || custMap[row.customer_id].phone || '';
            row.customer_address_snapshot = row.customer_address_snapshot || custMap[row.customer_id].address || '';
          }
        }
      }
    } catch {}
  }
  return { data, count };
}

export async function getInvoiceDetail(orderId) {
  const scope = scopeOrderParams();
  const params = new URLSearchParams({ select: orderDetailSelect() });
  params.append('id', `eq.${orderId}`);
  if (scope.created_by_employee_id) params.append('created_by_employee_id', scope.created_by_employee_id);
  const [orderArr, items, ordersRow, historyRows] = await Promise.all([
    fetch(`${API}/runtime_order_visibility?${params}`, { headers: _headers() }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/order_items?order_id=eq.${orderId}&order=created_at.asc&select=id,order_id,product_id,product_unit_id,quantity,base_price,discount_percent,discount_amount,final_price,line_subtotal,line_total,total_amount,product_name_snapshot,product_code_snapshot,unit_name_snapshot,unit_code_snapshot,company_name_snapshot,tier_name_snapshot,tier_price,created_at`, { headers: _headers() }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/orders?id=eq.${orderId}&select=id,revision,updated_at,updated_by,execution_accuracy_meters,execution_captured_at`, { headers: _headers() }).then(r => r.ok ? r.json() : []),
    fetch(`${API}/order_history?order_id=eq.${orderId}&order=created_at.asc&select=id,order_id,old_status,new_status,note,created_at,changed_by_name`, { headers: _headers() }).then(r => r.ok ? r.json() : []),
  ]);
  if (!orderArr.length) throw new Error('الفاتورة غير موجودة');
  const order = orderArr[0];
  const guard = canViewOrder(order);
  if (!guard.allowed) throw new Error(guard.reason);
  const ext = ordersRow[0] || {};
  order.revision = ext.revision || 0;
  order.updated_at = ext.updated_at || null;
  order.updated_by = ext.updated_by || null;
  if (ext.execution_accuracy_meters != null) order.execution_accuracy_meters = ext.execution_accuracy_meters;
  if (ext.execution_captured_at) order.execution_captured_at = ext.execution_captured_at;
  order.history = historyRows || [];
  if (order.updated_by) {
    try {
      const empRes = await fetch(`${API}/runtime_employee_capabilities?auth_user_id=eq.${order.updated_by}&select=full_name`, { headers: _headers() });
      if (empRes.ok) {
        const empArr = await empRes.json();
        if (empArr.length > 0) order.updated_by_name = empArr[0].full_name;
      }
    } catch {}
  }
  if (!order.customer_name_snapshot && order.customer_id) {
    try {
      const custRes = await fetch(`${API}/runtime_customer_visibility?id=eq.${order.customer_id}&select=id,customer_name,phone,address`, { headers: _headers() });
      if (custRes.ok) {
        const custArr = await custRes.json();
        const cust = custArr[0];
        if (cust) {
          order.customer_name_snapshot = cust.customer_name || '';
          order.customer_phone_snapshot = order.customer_phone_snapshot || cust.phone || '';
          order.customer_address_snapshot = order.customer_address_snapshot || cust.address || '';
        }
      }
    } catch {}
  }
  return { order, items };
}

export function groupItemsByCompany(items) {
  const groups = [];
  const map = {};
  for (const item of Array.isArray(items) ? items : []) {
    const companyId = item.company_name_snapshot || '0';
    if (!map[companyId]) {
      map[companyId] = { companyId, companyName: item.company_name_snapshot || '', items: [] };
      groups.push(map[companyId]);
    }
    map[companyId].items.push(item);
  }
  return groups;
}

export function formatStatus(status) {
  const map = {
    draft: 'مسودة', pending: 'قيد الانتظار', submitted: 'تم الإرسال',
    reviewing: 'تحت المراجعة', approved: 'معتمد', preparing: 'قيد التجهيز',
    dispatched: 'خرج للشحن', delivered: 'تم التسليم', collected: 'تم التحصيل',
    returned: 'مرتجع', cancelled: 'ملغي', confirmed: 'تم التأكيد',
    processing: 'قيد التجهيز', shipped: 'تم الشحن', paid: 'مدفوع',
    completed: 'مكتمل', rejected: 'مرفوض',
  };
  const key = String(status || '').trim().toLowerCase();
  return map[key] || status || 'غير معروف';
}

export async function getOrderItemsForEdit(orderId) {
  const r = await fetch(`${API}/order_items?order_id=eq.${orderId}&order=created_at.asc&select=id,order_id,product_id,product_unit_id,quantity,base_price,discount_percent,discount_amount,final_price,line_subtotal,line_total,total_amount,product_name_snapshot,product_code_snapshot,unit_name_snapshot,unit_code_snapshot,company_name_snapshot,tier_name_snapshot,tier_price,created_at`, { headers: _headers() });
  return r.ok ? r.json() : [];
}
