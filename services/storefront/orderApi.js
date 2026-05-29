// services/storefront/orderApi.js – Order creation with idempotency lock + TTL
import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { logError } from '../../utils/logger.js';
import { emit, EVENTS } from '../runtime/eventBus.js';
import { orchestratedFetch } from '../runtime/requestOrchestrator.js';
import { startSpan, recordMetric } from '../runtime/runtimeTelemetry.js';
import { getSelectedCustomer } from './cartApi.js';

const API = readConfig().baseUrl;

const LOCK_KEY = 'v2_order_checkout_locked';
const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes
let _runtimeInstanceId = null;

function _getInstanceId() {
  if (!_runtimeInstanceId) {
    _runtimeInstanceId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  return _runtimeInstanceId;
}

function _headers() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

function _postHeaders() {
  return { ..._headers(), Prefer: 'return=representation' };
}

function _readLock() {
  try {
    const raw = sessionStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const lock = JSON.parse(raw);
    if (!lock || !lock.order_number) {
      sessionStorage.removeItem(LOCK_KEY);
      return null;
    }
    // TTL check — expired locks are treated as stale
    if (Date.now() > lock.expires_at) {
      sessionStorage.removeItem(LOCK_KEY);
      return null;
    }
    return lock;
  } catch {
    sessionStorage.removeItem(LOCK_KEY);
    return null;
  }
}

function _writeLock(meta) {
  const lock = {
    order_number: meta.order_number,
    customer_id: meta.customer_id,
    cart_hash: meta.cart_hash || '',
    runtime_instance_id: _getInstanceId(),
    created_at: Date.now(),
    expires_at: Date.now() + LOCK_TTL_MS,
  };
  sessionStorage.setItem(LOCK_KEY, JSON.stringify(lock));
}

function _clearLock() {
  sessionStorage.removeItem(LOCK_KEY);
}

export async function generateOrderNumber() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  const r = await orchestratedFetch(`${API}/rpc/generate_order_number`, {
    method: 'POST', headers: h, body: '{}', dedup: true, tag: 'order_number',
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error('[order] generateOrderNumber failed', r.status, t.slice(0, 100));
    throw new Error(`فشل توليد رقم الفاتورة (${r.status}): ${t.slice(0, 80)}`);
  }
  const text = await r.text();
  return text.replace(/^\"|\"$/g, '');
}

function _cartHash(items) {
  const stable = items.map(i => `${i.pid}:${i.puid}:${i.qty}`).sort().join('|');
  let hash = 0;
  for (let i = 0; i < stable.length; i++) {
    hash = ((hash << 5) - hash) + stable.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function createOrder(items, total, geo) {
  // ── Idempotency: recover stale/expired lock ──
  const staleLock = _readLock();
  if (staleLock) {
    const existing = await _findOrderByNumber(staleLock.order_number);
    if (existing) {
      _clearLock();
      return existing;
    }
    // Lock is stale — clear and proceed
    _clearLock();
  }

  const ses = getSession();
  const orderNumber = await generateOrderNumber();

  // Persistent lock with TTL and metadata BEFORE DB insert
  _writeLock({
    order_number: orderNumber,
    customer_id: ses?.actor?.id || null,
    cart_hash: _cartHash(items),
  });

  try {
    const now = new Date().toISOString();

    const orderPayload = {
      order_number: orderNumber,
      total_amount: Number(total.toFixed(2)),
      workflow_status: 'submitted',
      created_by_type: ses?.actor?.type || '',
      created_by_name_snapshot: ses?.actor?.fullName || '',
      owner_name_snapshot: ses?.actor?.fullName || '',
      order_source: 'storefront',
      order_source_type: ses?.actor?.type || '',
      created_at: now,
      execution_latitude: geo?.lat || null,
      execution_longitude: geo?.lng || null,
      execution_maps_url: geo?.mapsUrl || null,
      execution_source: geo ? 'gps' : null,
      execution_accuracy_meters: geo?.accuracy || null,
      execution_captured_at: geo?.capturedAt || null,
    };
    // orders.customer_id is UUID; orders.created_by_employee_id is UUID
    if (ses?.actor?.type === 'customer' && ses?.actor?.id) {
      orderPayload.customer_id = ses.actor.id;
      orderPayload.customer_name_snapshot = ses?.actor?.fullName || '';
      orderPayload.customer_phone_snapshot = ses?.actor?.phone || '';
      orderPayload.customer_address_snapshot = ses?.actor?.address || '';
    }
    if (ses?.actor?.type === 'employee' && ses?.actor?.id) {
      orderPayload.created_by_employee_id = ses.actor.id;
      const selectedCust = getSelectedCustomer();
      if (!selectedCust?.id) {
        throw new Error('لم يتم اختيار عميل. الرجاء العودة واختيار عميل من قائمة العملاء.');
      }
      orderPayload.customer_id = selectedCust.id;
      orderPayload.customer_name_snapshot = selectedCust.name || '';
    }
    // NEVER set created_by_id or owner_id (bigint columns) with UUID strings

    const span = startSpan('create_order');
    const orderRes = await orchestratedFetch(`${API}/orders`, {
      method: 'POST',
      headers: _postHeaders(),
      body: JSON.stringify(orderPayload),
      dedup: false,
      tag: 'create_order',
    });
    console.log('[orderApi] createOrder POST result', orderRes.status);
    if (!orderRes.ok) {
      const errText = await orderRes.text().catch(() => '');
      span.end({ status: orderRes.status, error: errText.slice(0, 80) });
      throw new Error(`فشل إنشاء الفاتورة (${orderRes.status}): ${errText.slice(0, 100)}`);
    }
    const orderArr = await orderRes.json();
    const order = Array.isArray(orderArr) ? orderArr[0] : orderArr;

    const itemRows = items.map(item => {
      const baseP = item.price?.base_price || item.price?.final_price || 0;
      const finalP = item.price?.final_price || 0;
      const qty = item.qty || 0;
      return {
        order_id: order.id,
        product_id: item.pid,
        product_unit_id: item.puid,
        quantity: qty,
        base_price: baseP,
        final_price: finalP,
        line_subtotal: baseP,
        line_total: finalP * qty,
        product_name_snapshot: item.product?.product_name || '',
        product_code_snapshot: item.product?.product_code || item.code || '',
        unit_name_snapshot: item.unitName || item.unit?.unit_name || 'قطعة',
        unit_code_snapshot: item.unitCode || item.unit?.unit_code || '',
        company_name_snapshot: item.product?.company_name_snapshot || '',
        tier_name_snapshot: item._pricingContext?.tierLabel || 'base',
        tier_price: finalP,
        quantity_base_unit: qty,
        pricing_source: 'runtime',
        inventory_status: 'reserved',
        approval_status: 'pending',
        participates_in_tier: !!item._pricingContext,
        discount_percent: item.price?.discount_percent || 0,
        discount_amount: 0,
      };
    });

    if (!itemRows.length) {
      throw new Error('لا يمكن إنشاء فاتورة بدون أصناف');
    }

    const itemsRes = await fetch(`${API}/order_items`, {
      method: 'POST',
      headers: _postHeaders(),
      body: JSON.stringify(itemRows),
    });
    if (!itemsRes.ok) {
      const errText = await itemsRes.text().catch(() => '');
      throw new Error(`فشل حفظ أصناف الفاتورة (${itemsRes.status}): ${errText.slice(0, 100)}`);
    }
    const saved = await itemsRes.json();
    const result = { order, items: Array.isArray(saved) ? saved : itemRows };

    _clearLock();
    emit(EVENTS.INVOICE_CREATED, { orderId: order.id, orderNumber, total: order.total_amount, customerId: ses?.actor?.id });
    span.end({ orderId: order.id, orderNumber, itemCount: itemRows.length, ok: true });
    recordMetric('invoice_generation_ms', span.duration || 0);
    return result;
  } catch (e) {
    // On failure: check if order already exists in DB (POST succeeded, response lost)
    const current = _readLock();
    if (current && current.order_number === orderNumber) {
      const existing = await _findOrderByNumber(orderNumber);
      if (existing) {
        _clearLock();
        return existing;
      }
    }
    _clearLock();
    logError('createOrder', e);
    throw e;
  }
}

export async function updateOrder(orderId, items, totals, geo, notes) {
  const ses = getSession();

  const span = startSpan('update_order');

  // Fetch current order to get revision
  const currentRes = await orchestratedFetch(`${API}/orders?id=eq.${orderId}&select=revision,runtime_metadata`, {
    method: 'GET', headers: _headers(), dedup: true, tag: 'order_current',
  });
  let currentRevision = 0;
  let existingMetadata = {};
  if (currentRes.ok) {
    const rows = await currentRes.json();
    if (rows.length) {
      currentRevision = rows[0].revision || 0;
      existingMetadata = rows[0].runtime_metadata || {};
    }
  }

  const now = new Date().toISOString();
  const newRevision = currentRevision + 1;
  const editEntry = {
    revisedAt: now,
    revisedBy: ses?.actor?.id || null,
    revisedByName: ses?.actor?.fullName || '',
    revision: newRevision,
  };

  const metadata = {
    ...existingMetadata,
    lastEdit: editEntry,
    edits: [...(existingMetadata.edits || []), editEntry],
  };

  const patchPayload = {
    subtotal_amount: Number((totals?.subtotal || 0).toFixed(2)),
    discount_amount: Number((totals?.discountTotal || 0).toFixed(2)),
    total_amount: Number((totals?.grand || 0).toFixed(2)),
    revision: newRevision,
    updated_at: now,
    updated_by: ses?.actor?.id || null,
    note: notes || null,
    runtime_metadata: metadata,
    execution_latitude: geo?.lat || null,
    execution_longitude: geo?.lng || null,
    execution_maps_url: geo?.mapsUrl || null,
    execution_source: geo ? 'gps' : null,
    execution_accuracy_meters: geo?.accuracy || null,
    execution_captured_at: geo?.capturedAt || null,
  };

  const updateRes = await orchestratedFetch(`${API}/orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: _postHeaders(),
    body: JSON.stringify(patchPayload),
    dedup: false,
    tag: 'update_order',
  });
  if (!updateRes.ok) {
    const errText = await updateRes.text().catch(() => '');
    span.end({ status: updateRes.status, error: errText.slice(0, 80) });
    throw new Error(`فشل تحديث الفاتورة (${updateRes.status}): ${errText.slice(0, 100)}`);
  }

  // Delete old order items
  const delRes = await fetch(`${API}/order_items?order_id=eq.${orderId}`, {
    method: 'DELETE', headers: _headers(),
  });
  if (!delRes.ok) {
    const errText = await delRes.text().catch(() => '');
    throw new Error(`فشل حذف الأصناف القديمة (${delRes.status}): ${errText.slice(0, 100)}`);
  }

  // Insert new order items
  const itemRows = items.map(item => {
    const baseP = item.price?.base_price || item.price?.final_price || 0;
    const finalP = item.price?.final_price || 0;
    const qty = item.qty || 0;
    return {
      order_id: orderId,
      product_id: item.pid,
      product_unit_id: item.puid,
      quantity: qty,
      base_price: baseP,
      final_price: finalP,
      line_subtotal: baseP,
      line_total: finalP * qty,
      product_name_snapshot: item.product?.product_name || '',
      product_code_snapshot: item.product?.product_code || item.code || '',
      unit_name_snapshot: item.unitName || item.unit?.unit_name || 'قطعة',
      unit_code_snapshot: item.unitCode || item.unit?.unit_code || '',
      company_name_snapshot: item.product?.company_name_snapshot || '',
      tier_name_snapshot: item._pricingContext?.tierLabel || 'base',
      tier_price: finalP,
      quantity_base_unit: qty,
      pricing_source: 'runtime',
      inventory_status: 'reserved',
      approval_status: 'pending',
      participates_in_tier: !!item._pricingContext,
      discount_percent: item.price?.discount_percent || 0,
      discount_amount: 0,
    };
  });

  if (!itemRows.length) {
    throw new Error('لا يمكن تحديث الفاتورة بدون أصناف');
  }

  const itemsRes = await fetch(`${API}/order_items`, {
    method: 'POST',
    headers: _postHeaders(),
    body: JSON.stringify(itemRows),
  });
  if (!itemsRes.ok) {
    const errText = await itemsRes.text().catch(() => '');
    throw new Error(`فشل حفظ الأصناف الجديدة (${itemsRes.status}): ${errText.slice(0, 100)}`);
  }

  const saved = await itemsRes.json();
  // Fetch updated order to get full details (order_number, etc.)
  const fetchRes = await orchestratedFetch(`${API}/orders?id=eq.${orderId}&select=id,order_number,total_amount,subtotal_amount,discount_amount,order_status,workflow_status,created_at,updated_at,revision`, {
    method: 'GET', headers: _headers(), dedup: true, tag: 'order_fetch',
  });
  let updatedOrder = { id: orderId, revision: newRevision, total_amount: totals?.grand || 0, subtotal_amount: totals?.subtotal || 0, discount_amount: totals?.discountTotal || 0, updated_at: now, created_at: now };
  if (fetchRes.ok) {
    const rows = await fetchRes.json();
    if (rows.length) updatedOrder = rows[0];
  }

  const result = { order: updatedOrder, items: Array.isArray(saved) ? saved : itemRows };

  emit(EVENTS.INVOICE_UPDATED, { orderId, revision: newRevision, itemCount: itemRows.length });
  span.end({ orderId, revision: newRevision, itemCount: itemRows.length, ok: true });
  recordMetric('invoice_update_ms', span.duration || 0);
  return result;
}

async function _findOrderByNumber(orderNumber) {
  try {
    const r = await fetch(`${API}/orders?order_number=eq.${orderNumber}&select=id,order_number`, { headers: _headers() });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!arr.length) return null;
    const itemsR = await fetch(`${API}/order_items?order_id=eq.${arr[0].id}&select=*`, { headers: _headers() });
    const items = itemsR.ok ? await itemsR.json() : [];
    return { order: arr[0], items };
  } catch {
    return null;
  }
}
