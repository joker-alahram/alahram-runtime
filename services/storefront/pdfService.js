function _e(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _fmt(n) { if (n == null) return '0'; return Math.round(Number(n)).toLocaleString('en-US'); }

function _identityBlock(vm) {
  let h = '';
  h += '<div class="section"><div class="section-title">العميل</div><div class="section-body">';
  h += `<div style="font-weight:700;font-size:11pt">${_e(vm.customer.name)}</div>`;
  if (vm.customer.phone) h += `<div dir="ltr">📞 ${_e(vm.customer.phone)}</div>`;
  if (vm.customer.address) h += `<div>📍 ${_e(vm.customer.address)}</div>`;
  h += '</div></div>';
  h += '<div class="section"><div class="section-title">مندوب المبيعات</div><div class="section-body">';
  h += `<div style="font-weight:700;font-size:11pt">${_e(vm.creator.name)}</div>`;
  if (vm.creator.phone) h += `<div dir="ltr">📞 ${_e(vm.creator.phone)}</div>`;
  h += '</div></div>';
  return h;
}

function _executionBlock(vm) {
  if (!vm.execution.accuracy && !vm.execution.latitude && !vm.execution.source) return '';
  let h = '<div class="section"><div class="section-title">موقع التنفيذ</div><div class="section-body">';
  if (vm.execution.mapsUrl) h += `<div><a href="${_e(vm.execution.mapsUrl)}" target="_blank">فتح الخريطة</a></div>`;
  if (vm.execution.sourceLabel) h += `<div>المصدر: ${_e(vm.execution.sourceLabel)}</div>`;
  if (vm.execution.accuracy != null) h += `<div>الدقة: ${vm.execution.accuracy} متر</div>`;
  if (vm.execution.accuracy != null) h += `<div>الجودة: ${vm.execution.qualityLabel}</div>`;
  if (vm.execution.capturedAtStr) h += `<div>وقت الالتقاط: ${_e(vm.execution.capturedAtDate)} ${_e(vm.execution.capturedAtTime)}</div>`;
  h += '</div></div>';
  return h;
}

function _visitBlock(vm) {
  if (!vm.visit) return '';
  let h = '<div class="section"><div class="section-title">دليل الزيارة</div><div class="section-body">';
  h += `<div>رقم الزيارة: ${_e(String(vm.visit.visitNumber))}</div>`;
  h += `<div>بدئت في: ${_e(vm.visit.openedAtTime)}</div>`;
  h += `<div>الفاتورة في: ${_e(vm.visit.invoiceCreatedAtTime)}</div>`;
  h += `<div>الفارق: ${_e(vm.visit.diffLabel)}</div>`;
  h += '</div></div>';
  return h;
}

function _revisionBlock(vm) {
  if (!vm.invoice.revision || vm.invoice.revision <= 0) return '';
  let h = '<div class="section"><div class="section-title">الإصدار</div><div class="section-body">';
  h += `<div>تعديل رقم ${vm.invoice.revision}</div>`;
  if (vm.invoice.updatedAt) {
    const upd = new Date(vm.invoice.updatedAt);
    h += `<div>آخر تعديل: ${upd.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })} ${upd.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>`;
  }
  if (vm.invoice.updatedByName) h += `<div>تم التعديل بواسطة: ${_e(vm.invoice.updatedByName)}</div>`;
  h += '</div></div>';
  return h;
}

function _timelineHtml(vm) {
  if (!vm.timeline || !vm.timeline.length) return '';
  const actionMap = {
    order_created: 'تم إنشاء الطلب', order_edited: 'تم تعديل الطلب',
    approved: 'تم اعتماد الطلب', status_changed: 'تم تغيير الحالة',
  };
  let h = '<div class="timeline"><div class="timeline-title">📋 سجل التغييرات</div>';
  for (const ev of vm.timeline) {
    const ts = ev.created_at ? new Date(ev.created_at) : null;
    const dateStr = ts ? ts.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const timeStr = ts ? ts.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
    const actor = (ev.actor_name && !/^[0-9a-f-]{36}$/i.test(ev.actor_name)) ? ev.actor_name : '';
    const action = actionMap[ev.event_type] || '';
    h += '<div class="tl-item">';
    h += `<span class="tl-time">${_e(dateStr)} ${_e(timeStr)}</span>`;
    if (actor) h += ` &mdash; ${_e(actor)}`;
    if (action) h += ` &mdash; ${_e(action)}`;
    h += '</div>';
  }
  h += '</div>';
  return h;
}

function _itemsTableHtml(vm, opts) {
  const compact = opts?.compact || false;
  const tableFont = compact ? '7pt' : '9pt';
  const headerFont = compact ? '7pt' : '9pt';
  const groupFont = compact ? '8pt' : '10pt';
  const largeFont = compact ? '9pt' : '13pt';
  let h = '<table>';
  h += `<thead><tr><th style="font-size:${headerFont}">كود الصنف</th><th style="font-size:${headerFont}">اسم الصنف</th><th style="font-size:${headerFont}">الوحدة</th><th style="font-size:${headerFont}">الكمية</th><th style="font-size:${headerFont}">السعر</th><th style="font-size:${headerFont}">الإجمالي</th></tr></thead><tbody>`;
  let grandTotal = 0;
  for (const group of vm.groupedItems) {
    let groupTotal = 0;
    const companyName = group.companyName || 'شركة';
    const itemCount = group.items.length;
    h += `<tr class="group-header"><td colspan="6"><strong style="font-size:${groupFont}">${_e(companyName)} (${itemCount})</strong></td></tr>`;
    for (const item of group.items) {
      const code = item.product_code_snapshot || '';
      const name = item.product_name_snapshot || '';
      const unit = item.unit_name_snapshot || 'قطعة';
      const qty = Number(item.quantity || 1);
      const price = Number(item.final_price || 0);
      const lineTotal = qty * price;
      groupTotal += lineTotal;
      grandTotal += lineTotal;
      h += `<tr>
        <td style="font-family:monospace;direction:ltr;font-size:${tableFont}">${_e(code || '—')}</td>
        <td style="text-align:right;font-size:${tableFont}">${_e(name)}</td>
        <td style="font-size:${tableFont}">${_e(unit)}</td>
        <td style="font-size:${tableFont}">${qty}</td>
        <td style="font-size:${tableFont}">${_fmt(price)}</td>
        <td style="font-size:${tableFont}">${_fmt(lineTotal)}</td>
      </tr>`;
    }
    if (vm.groupedItems.length > 1) {
      h += `<tr class="group-subtotal"><td colspan="5" style="text-align:left;font-size:${groupFont}">إجمالي ${_e(companyName)}</td><td style="font-size:${groupFont}">${_fmt(groupTotal)}</td></tr>`;
    }
  }
  h += `</tbody><tfoot><tr class="total-row"><td colspan="5" style="text-align:left;font-size:${largeFont}">الإجمالي النهائي</td><td style="font-size:${largeFont}">${_fmt(grandTotal)} ج.م</td></tr></tfoot></table>`;
  return h;
}

export function renderInvoiceHtml(vm) {
  const invoiceNum = vm.invoice.number;
  const docType = vm.invoice.docType || 'فاتورة';
  const sectionsHtml = _identityBlock(vm) + _executionBlock(vm) + _visitBlock(vm) + _revisionBlock(vm);
  const notesHtml = vm.invoice.notes ? `<div class="notes"><strong>ملاحظات:</strong> ${_e(vm.invoice.notes)}</div>` : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${_e(docType)} ${_e(String(invoiceNum))}</title>
<style>
  @page { margin: 1.5cm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 10pt; color: #222; line-height: 1.6; padding: 10px; }
  .header { text-align: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 3px double #0052cc; }
  .header .brand { font-size: 18pt; font-weight: 800; color: #0052cc; letter-spacing: 1px; }
  .header .brand-sub { font-size: 9pt; color: #6b7280; margin-top: 2px; }
  .header .doc-title { font-size: 12pt; font-weight: 700; color: #333; margin-top: 6px; }
  .header .invoice-num { font-size: 20pt; font-weight: 700; color: #0052cc; margin-top: 2px; }
  .header .meta { font-size: 8pt; color: #9ca3af; margin-top: 4px; }
  .sections { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 18px; }
  .section { flex: 1; min-width: 170px; padding: 10px 12px; background: #f8f9fa; border-radius: 6px; page-break-inside: avoid; border: 1px solid #e5e7eb; }
  .section-title { font-size: 8pt; font-weight: 700; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; }
  .section-body { font-size: 10pt; }
  .section-body div { padding: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead { display: table-header-group; }
  tbody { display: table-row-group; }
  tfoot { display: table-footer-group; }
  th { background: #0052cc; color: #fff; padding: 7px 5px; font-size: 8pt; text-align: center; font-weight: 600; }
  td { padding: 5px; border-bottom: 1px solid #e5e7eb; font-size: 8pt; text-align: center; }
  tbody tr { page-break-inside: avoid; }
  .group-header td { background: #eef2ff; font-weight: 700; text-align: right; padding: 6px 10px; font-size: 9pt; border-bottom: 2px solid #0052cc; color: #0d2b6b; }
  .group-subtotal td { background: #f8f9fa; font-weight: 600; font-size: 8pt; border-top: 1px solid #0052cc; color: #374151; }
  .total-row td { font-weight: 700; font-size: 12pt; border-top: 3px double #0052cc; background: #f0f5ff; padding: 8px 5px; color: #0d2b6b; }
  .notes { margin: 0 0 16px; padding: 10px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 9pt; }
  .timeline { margin-top: 16px; padding: 12px; background: #fafafa; border-radius: 6px; border: 1px solid #e5e7eb; }
  .timeline-title { font-size: 9pt; font-weight: 700; color: #0052cc; margin-bottom: 8px; }
  .tl-item { font-size: 7.5pt; padding: 3px 0; border-bottom: 1px solid #f3f4f6; color: #374151; }
  .tl-time { color: #0052cc; font-weight: 600; }
  .footer { text-align: center; margin-top: 24px; font-size: 7pt; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  .footer div { padding: 1px 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <div class="brand">${_e(vm.company.brand || vm.company.name)}</div>
  <div class="brand-sub">${_e(vm.company.name)}</div>
  <div class="doc-title">${_e(docType)}</div>
  <div class="invoice-num">${_e(String(invoiceNum))}</div>
  <div class="meta">${_e(vm.invoice.dateStr)} | ${_e(vm.invoice.timeStr)} | الحالة: ${vm.invoice.statusLabel}</div>
</div>
<div class="sections">${sectionsHtml}</div>
${notesHtml}
${_itemsTableHtml(vm)}
${_timelineHtml(vm)}
<div class="footer">
  <div>شركة الأهرام للتجارة والتوزيع - جميع الحقوق محفوظة</div>
  <div>تمت الطباعة: ${_e(vm.invoice.dateStr)} ${_e(vm.invoice.timeStr)}</div>
</div>
</body>
</html>`;
}

export function renderInvoiceHtmlA5(vm) {
  const invoiceNum = vm.invoice.number;
  const docType = vm.invoice.docType || 'فاتورة';
  const notesHtml = vm.invoice.notes ? `<div style="margin:6px 0;padding:6px 8px;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;font-size:7pt"><strong>ملاحظات:</strong> ${_e(vm.invoice.notes)}</div>` : '';
  const revisionHtml = (vm.invoice.revision && vm.invoice.revision > 0) ? `<div style="margin:4px 0;font-size:7pt;color:#6b7280">🔄 تعديل رقم ${vm.invoice.revision}${vm.invoice.updatedAt ? ' - آخر تعديل: ' + new Date(vm.invoice.updatedAt).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</div>` : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${_e(docType)} ${_e(String(invoiceNum))}</title>
<style>
  @page { margin: .7cm; size: A5; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 8pt; color: #222; line-height: 1.4; padding: 8px; }
  .header { text-align: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #0052cc; }
  .header .brand { font-size: 11pt; font-weight: 800; color: #0052cc; }
  .header .doc-title { font-size: 9pt; font-weight: 700; color: #333; }
  .header .invoice-num { font-size: 14pt; font-weight: 700; color: #0052cc; }
  .header .meta { font-size: 6.5pt; color: #9ca3af; }
  .blocks { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .block { flex: 1; min-width: 110px; padding: 6px 8px; background: #f8f9fa; border-radius: 4px; border: 1px solid #e5e7eb; }
  .block-title { font-size: 6.5pt; font-weight: 700; color: #6b7280; margin-bottom: 2px; }
  .block-body { font-size: 7.5pt; }
  .block-body div { padding: 1px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #0052cc; color: #fff; padding: 4px 3px; font-size: 6.5pt; text-align: center; }
  td { padding: 3px; border-bottom: 1px solid #e5e7eb; font-size: 6.5pt; text-align: center; }
  .group-header td { background: #eef2ff; font-weight: 700; text-align: right; padding: 4px 6px; font-size: 7pt; border-bottom: 1.5px solid #0052cc; color: #0d2b6b; }
  .group-subtotal td { background: #f8f9fa; font-weight: 600; font-size: 7pt; border-top: 1px solid #0052cc; }
  .total-row td { font-weight: 700; font-size: 9pt; border-top: 2px solid #0052cc; background: #f0f5ff; padding: 5px 3px; color: #0d2b6b; }
  .footer { text-align: center; margin-top: 8px; font-size: 5.5pt; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 4px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <div class="brand">${_e(vm.company.brand || vm.company.name)}</div>
  <div class="doc-title">${_e(docType)}</div>
  <div class="invoice-num">${_e(String(invoiceNum))}</div>
  <div class="meta">${_e(vm.invoice.dateStr)} ${_e(vm.invoice.timeStr)} | ${vm.invoice.statusLabel}</div>
</div>

<div class="blocks">
  <div class="block">
    <div class="block-title">العميل</div>
    <div class="block-body">
      <div style="font-weight:700">${_e(vm.customer.name)}</div>
      ${vm.customer.phone ? `<div dir="ltr">📞 ${_e(vm.customer.phone)}</div>` : ''}
      ${vm.customer.address ? `<div>📍 ${_e(vm.customer.address)}</div>` : ''}
    </div>
  </div>
  <div class="block">
    <div class="block-title">مندوب المبيعات</div>
    <div class="block-body">
      <div style="font-weight:700">${_e(vm.creator.name)}</div>
      ${vm.creator.phone ? `<div dir="ltr">📞 ${_e(vm.creator.phone)}</div>` : ''}
    </div>
  </div>
  ${vm.execution.latitude || vm.execution.accuracy != null ? `<div class="block">
    <div class="block-title">موقع التنفيذ</div>
    <div class="block-body">
      ${vm.execution.sourceLabel ? `<div>المصدر: ${_e(vm.execution.sourceLabel)}</div>` : ''}
      ${vm.execution.accuracy != null ? `<div>الدقة: ${vm.execution.accuracy} م</div>` : ''}
    </div>
  </div>` : ''}
</div>

${revisionHtml}
${notesHtml}
${_itemsTableHtml(vm, { compact: true })}

<div class="footer">
  <div>شركة الأهرام للتجارة والتوزيع</div>
  <div>${_e(vm.invoice.dateStr)}</div>
</div>
</body>
</html>`;
}

export function printInvoice(html) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; } }, 500);
}

export function printInvoiceA5(vm) {
  const html = renderInvoiceHtmlA5(vm);
  printInvoice(html);
}
