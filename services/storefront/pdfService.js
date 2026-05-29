export function renderInvoiceHtml(vm) {
  const invoiceNum = vm.invoice.number;
  const total = vm.invoice.total;

  let tableRows = '';
  for (const group of vm.groupedItems) {
    let groupTotal = 0;
    const companyName = group.companyName || 'شركة';
      tableRows += `<tr class="company-group-header"><td colspan="6"><strong>${_e(companyName)}</strong></td></tr>`;
    for (const item of group.items) {
      const code = item.product_code_snapshot || '';
      const qty = Number(item.quantity || 1);
      const price = Number(item.final_price || 0);
      const basePrice = Number(item.base_price || price);
      const discountPct = Number(item.discount_percent || 0);
      const lineTotal = qty * price;
      groupTotal += lineTotal;
      let name = item.product_name_snapshot || '';
      const tier = item.tier_name_snapshot || '';
      if (tier && tier !== 'base') name += ` 🏷️${_e(tier)}`;
      const unit = item.unit_name_snapshot || 'قطعة';
      let priceDisplay = _fmt(price);
      if (discountPct > 0 && basePrice !== price) {
        priceDisplay = `<s>${_fmt(basePrice)}</s> ${_fmt(price)}`;
      }
      tableRows += `<tr>
        <td style="font-family:monospace;direction:ltr;font-size:8pt">${_e(code)}</td>
        <td style="text-align:right;">${_e(name)}</td>
        <td>${_e(unit)}</td>
        <td>${qty}</td>
        <td>${priceDisplay} ج.م</td>
        <td>${_fmt(lineTotal)} ج.م</td>
      </tr>`;
    }
    if (vm.groupedItems.length > 1) {
      tableRows += `<tr class="company-subtotal"><td colspan="5" style="text-align:left;">إجمالي ${_e(companyName)}</td><td>${_fmt(groupTotal)} ج.م</td></tr>`;
    }
  }

  let sectionsHtml = `<div class="section"><div class="section-title">العميل</div><div class="section-body">`;
  sectionsHtml += `<div>${_e(vm.customer.name)}</div>`;
  if (vm.customer.phone) sectionsHtml += `<div dir="ltr">${_e(vm.customer.phone)}</div>`;
  if (vm.customer.address) sectionsHtml += `<div>${_e(vm.customer.address)}</div>`;
  if (vm.customer.locationLink) sectionsHtml += `<div><a href="${_e(vm.customer.locationLink)}" target="_blank">موقع العميل</a></div>`;
  sectionsHtml += `</div></div>`;

  sectionsHtml += `<div class="section"><div class="section-title">منشئ الفاتورة</div><div class="section-body">`;
  sectionsHtml += `<div>${_e(vm.creator.name)}</div>`;
  if (vm.creator.phone) sectionsHtml += `<div dir="ltr">${_e(vm.creator.phone)}</div>`;
  if (vm.creator.address) sectionsHtml += `<div>${_e(vm.creator.address)}</div>`;
  sectionsHtml += `</div></div>`;

  if (vm.execution.accuracy != null || vm.execution.latitude) {
    sectionsHtml += `<div class="section"><div class="section-title">موقع التنفيذ</div><div class="section-body">`;
    if (vm.execution.mapsUrl) {
      sectionsHtml += `<div><a href="${_e(vm.execution.mapsUrl)}" target="_blank">فتح الخريطة</a></div>`;
    }
    if (vm.execution.sourceLabel) sectionsHtml += `<div>المصدر: ${_e(vm.execution.sourceLabel)}</div>`;
    if (vm.execution.accuracy != null) sectionsHtml += `<div>الدقة: ${vm.execution.accuracy} متر</div>`;
    if (vm.execution.accuracy != null) sectionsHtml += `<div>الجودة: ${vm.execution.qualityLabel}</div>`;
    if (vm.execution.capturedAtStr) sectionsHtml += `<div>وقت الالتقاط: ${_e(vm.execution.capturedAtDate)} ${_e(vm.execution.capturedAtTime)}</div>`;
    sectionsHtml += `</div></div>`;
  }

  if (vm.visit) {
    sectionsHtml += `<div class="section"><div class="section-title">دليل الزيارة</div><div class="section-body">`;
    sectionsHtml += `<div>رقم الزيارة: ${_e(String(vm.visit.visitNumber))}</div>`;
    sectionsHtml += `<div>بدئت في: ${_e(vm.visit.openedAtTime)}</div>`;
    sectionsHtml += `<div>الفاتورة في: ${_e(vm.visit.invoiceCreatedAtTime)}</div>`;
    sectionsHtml += `<div>الفارق: ${_e(vm.visit.diffLabel)}</div>`;
    sectionsHtml += `</div></div>`;
  }

  // Revision section
  if (vm.invoice.revision > 0) {
    sectionsHtml += `<div class="section"><div class="section-title">الإصدار</div><div class="section-body">`;
    sectionsHtml += `<div>تعديل رقم ${vm.invoice.revision}</div>`;
    if (vm.invoice.updatedAt) {
      const upd = new Date(vm.invoice.updatedAt);
      sectionsHtml += `<div>آخر تعديل: ${upd.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })} ${upd.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>`;
    }
    if (vm.invoice.updatedByName || vm.invoice.updatedBy) sectionsHtml += `<div>تم التعديل بواسطة: ${_e(vm.invoice.updatedByName || String(vm.invoice.updatedBy))}</div>`;
    sectionsHtml += `</div></div>`;
  }

  // Summary section
  if (vm.summary) {
    sectionsHtml += `<div class="section"><div class="section-title">ملخص</div><div class="section-body">`;
    if (vm.summary.itemCount != null) sectionsHtml += `<div>عدد الأصناف: ${vm.summary.itemCount}</div>`;
    if (vm.summary.totalQty != null) sectionsHtml += `<div>إجمالي الكميات: ${vm.summary.totalQty}</div>`;
    if (vm.summary.companyCount != null) sectionsHtml += `<div>عدد الشركات: ${vm.summary.companyCount}</div>`;
    sectionsHtml += `</div></div>`;
  }

  // Audit events in PDF
  if (vm.auditEvents && vm.auditEvents.length > 0) {
    sectionsHtml += `<div class="section" style="min-width:100%"><div class="section-title">سجل الأحداث</div><div class="section-body">`;
    for (const evt of vm.auditEvents) {
      const evtDate = evt.createdAt ? new Date(evt.createdAt) : null;
      const evtDateStr = evtDate ? evtDate.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
      const evtTimeStr = evtDate ? evtDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
      sectionsHtml += `<div style="font-size:10pt;padding:4px 0;border-bottom:1px solid #eee">${_e(evt.label)} — ${evtDateStr} ${evtTimeStr}${evt.createdByName ? ` (${_e(evt.createdByName)})` : ''}</div>`;
    }
    sectionsHtml += `</div></div>`;
  }

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>فاتورة #${_e(String(invoiceNum))}</title>
<style>
  @page { margin: 1.5cm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 11pt; color: #222; line-height: 1.5; padding: 20px; }
  .header { text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px double #0052cc; }
  .header .company-name { font-size: 16pt; font-weight: 700; color: #0052cc; letter-spacing: 1px; }
  .header .doc-title { font-size: 13pt; font-weight: 600; margin-top: 6px; color: #333; }
  .header .invoice-num { font-size: 22pt; font-weight: 700; color: #0052cc; margin-top: 4px; }
  .header .meta { font-size: 9pt; color: #666; margin-top: 4px; }
  .sections { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
  .section { flex: 1; min-width: 180px; padding: 12px; background: #f8f9fa; border-radius: 6px; page-break-inside: avoid; }
  .section-title { font-size: 9pt; color: #888; margin-bottom: 4px; }
  .section-body { font-size: 11pt; }
  .section-body div { padding: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead { display: table-header-group; }
  tbody { display: table-row-group; }
  tfoot { display: table-footer-group; }
  th { background: #0052cc; color: #fff; padding: 8px 6px; font-size: 9pt; text-align: center; }
  td { padding: 6px; border-bottom: 1px solid #e0e0e0; font-size: 9pt; text-align: center; }
  tbody tr { page-break-inside: avoid; }
  .company-group-header td { background: #eef4ff; font-weight: bold; text-align: right; padding: 6px 10px; font-size: 9pt; border-bottom: 2px solid #0052cc; }
  .company-subtotal td { background: #f8f9fa; font-weight: 600; font-size: 9pt; border-top: 1px solid #0052cc; }
  .total-row td { font-weight: 700; font-size: 13pt; border-top: 3px double #0052cc; background: #f0f5ff; padding: 10px 8px; }
  .footer { text-align: center; margin-top: 30px; font-size: 8pt; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
  .footer div { padding: 2px 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <div class="company-name">${_e(vm.company.name)}</div>
  <div class="doc-title">فاتورة بيع</div>
  <div class="invoice-num">${_e(String(invoiceNum))}</div>
  <div class="meta">${_e(vm.invoice.dateStr)} | ${_e(vm.invoice.timeStr)}</div>
</div>
<div class="sections">${sectionsHtml}</div>
<table>
  <thead><tr><th>الكود</th><th>اسم الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
  <tbody>${tableRows}</tbody>
  <tfoot><tr class="total-row"><td colspan="5" style="text-align:left;">الإجمالي النهائي للفاتورة</td><td>${_fmt(total)} ج.م</td></tr></tfoot>
</table>
<div class="footer">
  <div>شركة الأهرام للتجارة والتوزيع - جميع الحقوق محفوظة</div>
  <div>تاريخ الإصدار: ${_e(vm.invoice.dateStr)} ${_e(vm.invoice.timeStr)}</div>
</div>
</body>
</html>`;

  return html;
}

export function printInvoice(html) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; } }, 500);
}

function _e(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _fmt(n) { if (n == null) return '0'; return Math.round(Number(n)).toLocaleString('en-US'); }
