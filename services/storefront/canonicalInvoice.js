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
    tableHtml += `<tr class="v2-com-gh"><td colspan="6"><strong>${_e(group.companyName || 'شركة')} (${group.items.length})</strong></td></tr>`;
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
    if (vm.invoice.updatedByName) {
      revisionHtml += `<span>تم التعديل بواسطة: ${_e(vm.invoice.updatedByName)}</span>`;
    }
    revisionHtml += `</div>`;
  }

  let timelineHtml = '';
  if (vm.timeline && vm.timeline.length > 0) {
    const actionMap = {
      order_created: 'تم إنشاء الطلب', order_edited: 'تم تعديل الطلب',
      item_added: 'تمت إضافة صنف', item_removed: 'تم حذف صنف',
      qty_changed: 'تم تعديل الكمية', price_changed: 'تم تعديل السعر',
      return_to_cart: 'تمت إعادة الطلب للسلة', resubmitted: 'تمت إعادة إرسال الطلب',
      approved: 'تم اعتماد الطلب', status_changed: 'تم تغيير الحالة',
    };
    const statusLabels = {
      draft: 'مسودة', pending: 'قيد الانتظار', submitted: 'تم الإرسال',
      reviewing: 'تحت المراجعة', approved: 'معتمد', preparing: 'قيد التجهيز',
      dispatched: 'خرج للشحن', delivered: 'تم التسليم', collected: 'تم التحصيل',
      returned: 'مرتجع', cancelled: 'ملغي', confirmed: 'تم التأكيد',
      processing: 'قيد التجهيز', shipped: 'تم الشحن', paid: 'مدفوع',
      completed: 'مكتمل', rejected: 'مرفوض',
    };
    timelineHtml = `<div class="v2-com-timeline"><div class="v2-com-tl-title">سجل التغييرات</div>`;
    for (const ev of vm.timeline) {
      const evDate = ev.created_at ? new Date(ev.created_at) : null;
      const evDateStr = evDate ? evDate.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      const evTimeStr = evDate ? evDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
      const actorName = (ev.actor_name && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ev.actor_name)) ? ev.actor_name : '';
      const phone = ev.actor_phone || '';
      const action = actionMap[ev.event_type] || '';
      let detailsHtml = '';
      if (ev.change_details && Array.isArray(ev.change_details)) {
        const groups = [];
        for (const d of ev.change_details) {
          const lines = [];
          if (d.type === 'QTY_CHANGE') {
            lines.push('<span class="v2-com-tl-dl">الصنف:</span><span class="v2-com-tl-dv"> ' + _e((d.product_name || '') + (d.product_code ? ' (' + d.product_code + ')' : '')) + '</span>');
            lines.push('<span class="v2-com-tl-dl">الكمية:</span><span class="v2-com-tl-dv"> ' + (d.old_quantity || 0) + ' ← ' + (d.new_quantity || 0) + '</span>');
          } else if (d.type === 'ADD_ITEM') {
            lines.push('<span class="v2-com-tl-dl">الصنف:</span><span class="v2-com-tl-dv"> ' + _e((d.product_name || '') + (d.product_code ? ' (' + d.product_code + ')' : '')) + '</span>');
            lines.push('<span class="v2-com-tl-dv v2-com-tl-dv-ad">تمت إضافته</span>');
            if (d.new_quantity != null) lines.push('<span class="v2-com-tl-dl">الكمية:</span><span class="v2-com-tl-dv"> ' + d.new_quantity + '</span>');
          } else if (d.type === 'REMOVE_ITEM') {
            lines.push('<span class="v2-com-tl-dl">الصنف:</span><span class="v2-com-tl-dv"> ' + _e((d.product_name || '') + (d.product_code ? ' (' + d.product_code + ')' : '')) + '</span>');
            lines.push('<span class="v2-com-tl-dv v2-com-tl-dv-rm">تم حذفه</span>');
            if (d.old_quantity != null) lines.push('<span class="v2-com-tl-dl">الكمية السابقة:</span><span class="v2-com-tl-dv"> ' + d.old_quantity + '</span>');
          } else if (d.type === 'PRICE_CHANGE') {
            lines.push('<span class="v2-com-tl-dl">الصنف:</span><span class="v2-com-tl-dv"> ' + _e((d.product_name || '') + (d.product_code ? ' (' + d.product_code + ')' : '')) + '</span>');
            lines.push('<span class="v2-com-tl-dl">السعر:</span><span class="v2-com-tl-dv"> ' + _money(d.old_price || 0) + ' ← ' + _money(d.new_price || 0) + '</span>');
          } else if (d.type === 'STATUS_CHANGE') {
            const fromLabel = statusLabels[String(d.from || '').trim().toLowerCase()] || d.from;
            const toLabel = statusLabels[String(d.to || '').trim().toLowerCase()] || d.to;
            lines.push('<span class="v2-com-tl-dl">الحالة:</span><span class="v2-com-tl-dv"> ' + _e(fromLabel) + ' ← ' + _e(toLabel) + '</span>');
            if (d.note) lines.push('<span class="v2-com-tl-dv" style="font-size:.75rem;color:#6b7280">' + _e(d.note) + '</span>');
          }
          if (lines.length) groups.push('<div class="v2-com-tl-dg">' + lines.join('') + '</div>');
        }
        if (groups.length) detailsHtml = '<div class="v2-com-tl-dd">' + groups.join('<hr class="v2-com-tl-ds">') + '</div>';
      }
      timelineHtml += `<div class="v2-com-tl-card">
        <div class="v2-com-tl-hd"><span class="v2-com-tl-ar">▼</span><span class="v2-com-tl-dt">${_e(evDateStr)} - ${_e(evTimeStr)}</span></div>
        ${actorName ? '<div class="v2-com-tl-ac"><span class="v2-com-tl-an">' + _e(actorName) + '</span>' + (phone ? '<span class="v2-com-tl-ap"> ' + _e(phone) + '</span>' : '') + '</div>' : ''}
        ${action ? '<div class="v2-com-tl-at">' + _e(action) + '</div>' : ''}
        ${detailsHtml}
      </div>`;
    }
    timelineHtml += `</div>`;
  }

  const notesHtml = vm.invoice.notes ? `<div class="v2-com-notes" style="margin:0 2rem 1rem"><strong>ملاحظات:</strong> ${_e(vm.invoice.notes)}</div>` : '';

  return `<div class="v2-com-card">
    ${isPositiveStatus ? '<div class="v2-com-stamp">معتمد</div>' : ''}

    <div class="v2-com-header">
      <div class="v2-com-h-left">
        <div class="v2-com-brand">${_e(vm.company.brand)}</div>
        <div class="v2-com-brand-sub">${_e(vm.company.name)}</div>
        <div class="v2-com-invoice-num">${_e(vm.invoice.docType)} رقم ${_e(String(vm.invoice.number))}</div>
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
        <div class="v2-com-party-title">مندوب المبيعات</div>
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
          <tr><th>كود الصنف</th><th>اسم الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
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
    ${timelineHtml}
    ${notesHtml}
  </div>`;
}
