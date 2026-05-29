import { createOrder, updateOrder } from './orderApi.js';
import { computeTotals, getEditOrderId } from './cartApi.js';
import { getSession } from '../../auth/sessionService.js';
import { logError } from '../../utils/logger.js';
import { getActiveVisit, linkOrderToVisit } from './visitsApi.js';
import { canCreateOrder } from './governanceRuntime.js';
import { buildInvoiceViewModel } from './invoiceViewModel.js';

let _geoCache = null;

export function clearGeoCache() {
  _geoCache = null;
}

function _gpsReading() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude);
        const lng = Number(pos.coords.longitude);
        const accuracy = Number(pos.coords.accuracy);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) { resolve(null); return; }
        resolve({ lat, lng, accuracy, ts: Date.now() });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

export async function captureGeo() {
  if (_geoCache) return _geoCache;
  if (!navigator.geolocation) return null;

  const samples = [];
  for (let i = 0; i < 3; i++) {
    const r = await _gpsReading();
    if (r) samples.push(r);
    if (samples.length >= 2 && samples.some(s => s.accuracy <= 10)) break;
    if (i < 2) await new Promise(r => setTimeout(r, 500));
  }

  if (!samples.length) {
    const fallback = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude);
          const lng = Number(pos.coords.longitude);
          const accuracy = Number(pos.coords.accuracy);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) { resolve(null); return; }
          resolve({ lat, lng, accuracy, ts: Date.now() });
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    });
    if (!fallback) return null;
    samples.push(fallback);
  }

  samples.sort((a, b) => a.accuracy - b.accuracy);
  const best = samples[0];

  _geoCache = {
    lat: best.lat,
    lng: best.lng,
    accuracy: best.accuracy,
    capturedAt: new Date(best.ts).toISOString(),
    mapsUrl: `https://maps.google.com/?q=${best.lat},${best.lng}`,
  };
  return _geoCache;
}

export async function createInvoiceRuntime(hydrated, notes) {
  const guard = canCreateOrder();
  if (!guard.allowed) throw new Error(guard.reason);
  const total = computeTotals(hydrated).grand;
  const geo = await captureGeo();
  let geoGuidance = null;

  if (typeof navigator !== 'undefined' && navigator.geolocation === undefined) {
    geoGuidance = 'المتصفح لا يدعم تحديد الموقع. سيتم إرسال الطلب بدون موقع.';
  } else if (!geo && _geoCache === null) {
    geoGuidance = 'تعذر الحصول على الموقع. تم إنشاء الفاتورة بدون إحداثيات. يمكنك تحديث الموقع لاحقاً من صفحة الفاتورة.';
  }

  const { order, items } = await createOrder(hydrated, total, geo);

  const activeVisit = getActiveVisit();
  if (activeVisit) {
    linkOrderToVisit(activeVisit.id, order.id, order.order_number);
  }

  const ses = getSession();
  const viewModel = buildInvoiceViewModel({ order, items, session: ses, geo, activeVisit, geoGuidance });

  return { order, items, viewModel, total, geo, geoGuidance };
}

export async function updateInvoiceRuntime(orderId, hydrated, notes) {
  const guard = canCreateOrder();
  if (!guard.allowed) throw new Error(guard.reason);

  // Verify this is the same order being edited
  const editOrderId = getEditOrderId();
  if (!editOrderId) throw new Error('لا توجد فاتورة قيد التعديل');
  if (editOrderId !== orderId) throw new Error('عدم تطابق الفاتورة المطلوب تعديلها');

  const totals = computeTotals(hydrated);
  const geo = await captureGeo();
  let geoGuidance = null;

  if (typeof navigator !== 'undefined' && navigator.geolocation === undefined) {
    geoGuidance = 'المتصفح لا يدعم تحديد الموقع. سيتم تحديث الطلب بدون موقع.';
  } else if (!geo && _geoCache === null) {
    geoGuidance = 'تعذر الحصول على الموقع. تم تحديث الفاتورة بدون إحداثيات.';
  }

  const { order, items } = await updateOrder(orderId, hydrated, totals, geo, notes);

  const ses = getSession();
  const viewModel = buildInvoiceViewModel({ order, items, session: ses, geo, geoGuidance });
  viewModel.invoice.edited = true;

  return { order, items, viewModel, geo, geoGuidance };
}
