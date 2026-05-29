export function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
export function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }

export function buildCanonicalInvoiceHtml(vm) {
  const status = vm.invoice.status;
  const isPositiveStatus = status === 'delivered' || status === 'approved' || status === 'confirmed';
  const isNegativeStatus = status === 'cancelled' || status === 'returned' || status === 'rejected';
  const statusBadgeClass = isPositiveStatus ? 'v2-badge-ok' : isNegativeStatus ? 'v2-badge-no' : status === 'pending' ? 'v2-badge-warn' : 'v2-badge-info';

  let tableHtml = '';
  for (const group of vm.groupedItems) {
    let groupTotal = 0;
    tableHtml += `<tr class="v2-com-gh"><td colspan="6"><strong>${_e(group.companyName || 'شركة')}</strong></td></tr>`;
    let alt = false;
    for (const item of group.items) {
      const pcode = item.product_code_snapshot || '';
      const pname = item.product_name_snapshot || '';
      const uname = item.unit_name_snapshot || 'قطعة';
      const qty = Number(item.quantity || 1);
      const basePrice = Number(item.base_price || 0);
      const price = Number(item.final_price || 0);
      const discPct = Number(item.discount_percent || 0);
      const tier = item.tier_name_snapshot || '';
      const lineTotal = qty * price;
      groupTotal += lineTotal;
      const tierBadge = tier && tier !== 'base' ? `<span class="v2-com-tier-badge"> 🏷️${_e(tier)}</span>` : '';
      const priceDisplay = discPct > 0 && basePrice !== price ? `<s>${_money(basePrice)}</s> ${_money(price)}` : _money(price);
      tableHtml += `<tr class="${alt ? 'v2-com-alt' : ''}">
        <td class="v2-com-code">${pcode ? _e(pcode) : '—'}</td>
        <td class="v2-com-name">${_e(pname)}${tierBadge}</td>
        <td>${_e(uname)}</td>
        <td>${qty}</td>
        <td>${priceDisplay}</td>
        <td class="v2-com-line-total">${_money(lineTotal)}</td>
      </tr>`;
      alt = !alt;
    }
    if (vm.groupedItems.length > 1) {
      tableHtml += `<tr class="v2-com-subtotal"><td colspan="5" style="text-align:left">إجمالي ${_e(group.companyName || 'الشركة')}</td><td>${_money(groupTotal)}</td></tr>`;
    }
  }

  const statusIcon = { pending: '⏳', reviewing: '🔍', approved: '✅', preparing: '🔧', dispatched: '🚚', delivered: '✅', cancelled: '❌', returned: '↩️' }[status] || '📄';

  let executionHtml = '';
  if (vm.execution.accuracy != null || vm.execution.latitude) {
    executionHtml = `<div class="v2-com-party-card">
      <div class="v2-com-party-title">📍 موقع التنفيذ</div>`;
    if (vm.execution.mapsUrl) {
      executionHtml += `<a href="${_e(vm.execution.mapsUrl)}" target="_blank" class="v2-com-party-map">فتح الخريطة</a>`;
    }
    executionHtml += `<div class="v2-com-party-detail">المصدر: ${vm.execution.sourceLabel || '—'}</div>`;
    if (vm.execution.accuracy != null) {
      executionHtml += `<div class="v2-com-party-detail">الدقة: ${vm.execution.accuracy} متر</div>`;
      executionHtml += `<div class="v2-com-party-detail">الجودة: ${vm.execution.qualityLabel}</div>`;
    }
    if (vm.execution.capturedAtStr) {
      executionHtml += `<div class="v2-com-party-detail">وقت الالتقاط: ${_e(vm.execution.capturedAtDate)} ${_e(vm.execution.capturedAtTime)}</div>`;
    }
    executionHtml += `</div>`;
  }

  let visitHtml = '';
  if (vm.visit) {
    visitHtml = `<div class="v2-com-party-card">
      <div class="v2-com-party-title">📋 دليل الزيارة</div>
      <div class="v2-com-party-detail">رقم الزيارة: ${_e(String(vm.visit.visitNumber))}</div>
      <div class="v2-com-party-detail">بدئت في: ${_e(vm.visit.openedAtTime)}</div>
      <div class="v2-com-party-detail">الفاتورة في: ${_e(vm.visit.invoiceCreatedAtTime)}</div>
      <div class="v2-com-party-detail">الفارق: ${_e(vm.visit.diffLabel)}</div>
    </div>`;
  }

  let revisionHtml = '';
  if (vm.invoice.revision > 0) {
    revisionHtml = `<div class="v2-com-notes" style="background:#fef3c7;border:1px solid #fcd34d;margin:0 2rem 1rem">
      <strong>🔄 الإصدار</strong> — تعديل رقم ${vm.invoice.revision}<br>`;
    if (vm.invoice.updatedAt) {
      const upd = new Date(vm.invoice.updatedAt);
      const updDate = upd.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
      const updTime = upd.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      revisionHtml += `<span>آخر تعديل: ${updDate} ${updTime}</span><br>`;
    }
    if (vm.invoice.updatedByName || vm.invoice.updatedBy) {
      revisionHtml += `<span>تم التعديل بواسطة: ${_e(vm.invoice.updatedByName || String(vm.invoice.updatedBy))}</span>`;
    }
    revisionHtml += `</div>`;
  }

  let auditHtml = '';
  if (vm.auditEvents && vm.auditEvents.length > 0) {
    auditHtml = `<div class="v2-com-timeline"><div class="v2-com-tl-title">📜 سجل الأحداث</div>`;
    for (const evt of vm.auditEvents) {
      const evtDate = evt.createdAt ? new Date(evt.createdAt) : null;
      const evtDateStr = evtDate ? evtDate.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      const evtTimeStr = evtDate ? evtDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
      auditHtml += `<div class="v2-com-tl-item">
        <span class="v2-com-tl-dot"></span>
        <div class="v2-com-tl-body">
          <div class="v2-com-tl-status">${_e(evt.label)}</div>
          <div class="v2-com-tl-time">${evtDateStr} ${evtTimeStr}${evt.createdByName ? ` — ${_e(evt.createdByName)}` : ''}</div>
          ${evt.note ? `<div class="v2-com-tl-note">${_e(evt.note)}</div>` : ''}
        </div>
      </div>`;
    }
    auditHtml += `</div>`;
  }

  const notesHtml = vm.invoice.notes ? `<div class="v2-com-notes" style="margin:0 2rem 1rem"><strong>ملاحظات:</strong> ${_e(vm.invoice.notes)}</div>` : '';

  return `<div class="v2-com-card">
    ${isPositiveStatus ? '<div class="v2-com-stamp">معتمد</div>' : ''}

    <div class="v2-com-header">
      <div class="v2-com-h-left">
        <div class="v2-com-brand">${_e(vm.company.brand)}</div>
        <div class="v2-com-brand-sub">${_e(vm.company.name)}</div>
        <div class="v2-com-invoice-num">فاتورة رقم ${_e(String(vm.invoice.number))}</div>
      </div>
      <div class="v2-com-h-right">
        <div class="v2-com-status ${statusBadgeClass}"><span>${statusIcon}</span> ${vm.invoice.statusLabel}</div>
        <div class="v2-com-date">${_e(vm.invoice.dateStr)}</div>
        <div class="v2-com-time">${_e(vm.invoice.timeStr)}</div>
      </div>
    </div>

    <div class="v2-com-parties">
      ${vm.customer.name ? `<div class="v2-com-party-card">
        <div class="v2-com-party-title">العميل</div>
        <div class="v2-com-party-name">${_e(vm.customer.name)}</div>
        ${vm.customer.phone ? `<div class="v2-com-party-detail">📞 ${_e(vm.customer.phone)}</div>` : ''}
        ${vm.customer.address ? `<div class="v2-com-party-detail">📍 ${_e(vm.customer.address)}</div>` : ''}
        ${vm.customer.locationLink ? `<a href="${_e(vm.customer.locationLink)}" target="_blank" class="v2-com-party-map">موقع العميل</a>` : ''}
      </div>` : ''}
      ${vm.creator.name ? `<div class="v2-com-party-card">
        <div class="v2-com-party-title">منشئ الفاتورة</div>
        <div class="v2-com-party-name">${_e(vm.creator.name)}</div>
        ${vm.creator.phone ? `<div class="v2-com-party-detail">📞 ${_e(vm.creator.phone)}</div>` : ''}
        ${vm.creator.address ? `<div class="v2-com-party-detail">📍 ${_e(vm.creator.address)}</div>` : ''}
      </div>` : ''}
      ${executionHtml}
      ${visitHtml}
    </div>

    <div class="v2-com-table-wrap">
      <table class="v2-com-table">
        <thead>
          <tr><th>الكود</th><th>اسم الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
        </thead>
        <tbody>${tableHtml || '<tr><td colspan="6" class="v2-id-empty">لا توجد أصناف</td></tr>'}</tbody>
      </table>
    </div>

    <div class="v2-com-summary">
      <div class="v2-com-summary-row">
        <span>إجمالي عدد الأصناف</span>
        <span>${vm.invoice.itemCount}</span>
      </div>
      <div class="v2-com-summary-row">
        <span>إجمالي الكميات</span>
        <span>${vm.invoice.totalQty}</span>
      </div>
      <div class="v2-com-summary-row v2-com-summary-total">
        <span>الإجمالي النهائي</span>
        <span>${_money(vm.invoice.total)}</span>
      </div>
    </div>

    ${revisionHtml}
    ${auditHtml}
    ${notesHtml}
  </div>`;
}
