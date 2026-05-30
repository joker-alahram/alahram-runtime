export function classifyGpsAccuracy(accuracy) {
  if (accuracy === null || accuracy === undefined) return null;
  if (accuracy <= 10) return 'excellent';
  if (accuracy <= 15) return 'accurate';
  if (accuracy <= 30) return 'good';
  if (accuracy <= 50) return 'weak';
  return 'rejected';
}

export function gpsAccuracyLabel(quality) {
  const labels = { excellent: 'ممتازة', accurate: 'دقيقة', good: 'جيدة', weak: 'ضعيفة', rejected: 'مرفوضة' };
  return labels[quality] || '';
}

export function parseExecutionSource(src) {
  if (!src) return { source: null, accuracy: null };
  const parts = src.split(':');
  return { source: parts[0] || null, accuracy: parts[1] ? parseInt(parts[1], 10) : null };
}

function _groupItemsByCompany(items) {
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

function _formatStatus(status) {
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

function _durationLabel(diffMs) {
  if (!diffMs || diffMs < 0) return '';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} ساعة و ${minutes} دقيقة`;
  return `${minutes} دقيقة`;
}

function _executionSourceLabel(src) {
  if (!src) return '';
  const parts = src.split(':');
  const source = parts[0] || '';
  const labels = { gps: 'GPS', network: 'Network', cached: 'Cached', manual: 'يدوي' };
  return labels[source.toLowerCase()] || source;
}

function _auditEventLabel(status) {
  const labels = {
    submitted: 'تم إرسال الفاتورة', pending: 'قيد الانتظار',
    reviewing: 'قيد المراجعة', approved: 'تم اعتماد الفاتورة',
    preparing: 'قيد التجهيز', dispatched: 'تم الشحن',
    delivered: 'تم التسليم', cancelled: 'تم الإلغاء',
    returned: 'تم الإرجاع',
  };
  return labels[status || ''] || status || 'تحديث';
}

function _buildAuditEvents(history) {
  if (!Array.isArray(history) || !history.length) return [];
  return history.map(h => ({
    id: h.id, oldStatus: h.old_status || '', newStatus: h.new_status || '',
    note: h.note || '', createdAt: h.created_at, createdByName: h.changed_by_name || '',
    label: _auditEventLabel(h.new_status),
  }));
}

export function buildInvoiceViewModel({ order, items, session, geo, activeVisit, geoGuidance }) {
  const now = new Date(order.created_at || Date.now());
  const invoiceNum = order.order_number || order.invoice_number || order.id;
  const total = Number(order.total_amount || 0);
  const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);

  let executionAccuracy = order.execution_accuracy_meters || null;
  let executionSource = order.execution_source || null;
  if (!executionAccuracy && executionSource) {
    const parsed = parseExecutionSource(executionSource);
    executionAccuracy = parsed.accuracy;
  }
  if (!executionAccuracy && geo?.accuracy) {
    executionAccuracy = geo.accuracy;
  }
  const executionQuality = classifyGpsAccuracy(executionAccuracy);
  const executionLat = order.execution_latitude || geo?.lat || null;
  const executionLng = order.execution_longitude || geo?.lng || null;
  const executionMapsUrl = order.execution_maps_url || geo?.mapsUrl || '';
  const executionCapturedAt = order.execution_captured_at || order.created_at || null;

  let visitEvidence = null;
  if (activeVisit) {
    const visitStart = new Date(activeVisit.opened_at || activeVisit.check_in_time);
    const invoiceTime = now;
    const diffMs = invoiceTime - visitStart;
    visitEvidence = {
      visitId: activeVisit.id || activeVisit.visit_id,
      visitNumber: activeVisit.visit_number || activeVisit.id,
      openedAt: visitStart,
      openedAtTime: visitStart.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      invoiceCreatedAt: invoiceTime,
      invoiceCreatedAtTime: invoiceTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      diffMs,
      diffLabel: _durationLabel(diffMs),
    };
  }

  const groupedItems = _groupItemsByCompany(items);
  const docType = order.docType || (['pending', 'reviewing', 'submitted'].includes(String(order.order_status || '').trim().toLowerCase()) ? 'طلب شراء' : 'فاتورة');
  const timeline = order.timeline || [];
  const executionSourceLabel = _executionSourceLabel(executionSource);
  const capturedAtStr = executionCapturedAt ? new Date(executionCapturedAt) : null;

  return {
    company: {
      name: 'شركة الأهرام للتجارة والتوزيع',
      brand: 'متجر الأهرام',
    },
    invoice: {
      id: order.id,
      number: invoiceNum,
      docType,
      date: now,
      dateStr: now.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }),
      timeStr: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      status: order.order_status || order.workflow_status || 'pending',
      statusLabel: _formatStatus(order.order_status || order.workflow_status || 'pending'),
      total,
      totalQty,
      itemCount: items.length,
      notes: order.note || '',
      revision: order.revision || 0,
      updatedAt: order.updated_at || null,
      updatedBy: order.updated_by || '',
      updatedByName: order.updated_by_name || '',
    },
    customer: {
      name: order.customer_name_snapshot || '',
      phone: order.customer_phone_snapshot || '',
      address: order.customer_address_snapshot || '',
      locationLink: order.execution_maps_url || '',
    },
    creator: {
      name: order.created_by_name_snapshot || '',
      phone: order.created_by_phone_snapshot || '',
      address: '',
      type: order.created_by_type || '',
    },
    execution: {
      latitude: executionLat,
      longitude: executionLng,
      accuracy: executionAccuracy,
      quality: executionQuality,
      qualityLabel: gpsAccuracyLabel(executionQuality),
      source: executionSource,
      sourceLabel: executionSourceLabel,
      capturedAt: executionCapturedAt,
      capturedAtStr,
      capturedAtTime: capturedAtStr ? capturedAtStr.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '',
      capturedAtDate: capturedAtStr ? capturedAtStr.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
      mapsUrl: executionMapsUrl,
    },
    visit: visitEvidence,
    items,
    groupedItems,
    timeline,
    geoGuidance: geoGuidance || null,
  };
}
