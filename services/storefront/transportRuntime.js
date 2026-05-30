import { readConfig } from '../../config.js';
import { renderInvoiceHtml } from './pdfService.js';

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0'; return Math.round(Number(n)).toLocaleString('en-US'); }

export function buildWhatsAppMessage(vm) {
  const num = readConfig().supportWhatsapp;
  if (!num) return null;

  let msg = `🏢 ${vm.company.name}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📄 ${vm.invoice.docType} رقم ${vm.invoice.number}\n\n`;

  msg += `┌─ ❲ معلومات العميل ❳ ─┐\n`;
  msg += `الاسم: ${vm.customer.name}\n`;
  if (vm.customer.phone) msg += `الهاتف: ${vm.customer.phone}\n`;
  if (vm.customer.address) msg += `العنوان: ${vm.customer.address}\n`;
  if (vm.customer.locationLink) msg += `الموقع: ${vm.customer.locationLink}\n`;

  msg += `\n┌─ ❲ مندوب المبيعات ❳ ─┐\n`;
  msg += `الاسم: ${vm.creator.name}\n`;
  if (vm.creator.phone) msg += `الهاتف: ${vm.creator.phone}\n`;
  if (vm.creator.address) msg += `العنوان: ${vm.creator.address}\n`;

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 بيان الطلب\n\n`;

  const groups = vm.groupedItems && vm.groupedItems.length ? vm.groupedItems : (vm.items ? [{ companyName: 'المنتجات', items: vm.items }] : []);
  for (const group of groups) {
    let groupTotal = 0;
    const items = Array.isArray(group.items) ? group.items : [];
    if (items.length === 0) continue;
    msg += `◈ ${group.companyName} (${items.length} أصناف)\n`;
    for (const item of items) {
      const name = item.product_name_snapshot || '';
      const code = item.product_code_snapshot || '';
      const unit = item.unit_name_snapshot || 'قطعة';
      const qty = Number(item.quantity || 1);
      const price = Number(item.final_price || 0);
      const discPct = Number(item.discount_percent || 0);
      const tier = item.tier_name_snapshot || '';
      const lineTotal = qty * price;
      groupTotal += lineTotal;

      msg += `▸ ${name}\n`;
      msg += `  كود: ${code || '—'}\n`;
      if (tier && tier !== 'base') msg += `  🏷️ ${tier}\n`;
      if (discPct > 0) msg += `  🔥 خصم ${discPct}%\n`;
      msg += `  الكمية: ${qty} ${unit} | السعر: ${_money(price)}\n`;
      msg += `  الإجمالي: ${_money(lineTotal)}\n\n`;
    }
    msg += `  ───── ${_money(groupTotal)} ─────\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💵 إجمالي الفاتورة: ${_money(vm.invoice.total)}`;

  if (vm.execution.latitude || vm.execution.mapsUrl) {
    msg += `\n\n📍 موقع التنفيذ`;
    if (vm.execution.sourceLabel) msg += `\nالمصدر: ${vm.execution.sourceLabel}`;
    if (vm.execution.accuracy != null) msg += `\nالدقة: ${vm.execution.accuracy} متر`;
    if (vm.execution.capturedAtStr) msg += `\nوقت الالتقاط: ${vm.execution.capturedAtDate} ${vm.execution.capturedAtTime}`;
    if (vm.execution.mapsUrl) msg += `\n${vm.execution.mapsUrl}`;
  }

  if (vm.visit) {
    msg += `\n\n┌─ ❲ دليل إقران الزيارة ❳ ─┐\n`;
    msg += `رقم الزيارة: ${vm.visit.visitNumber}\n`;
    msg += `وقت بدء الزيارة: ${vm.visit.openedAtTime}\n`;
    msg += `وقت إنشاء الفاتورة: ${vm.visit.invoiceCreatedAtTime}\n`;
    msg += `الفارق: ${vm.visit.diffLabel}`;
  }

  if (vm.invoice.revision && vm.invoice.revision > 0) {
    msg += `\n\n🔄 تعديل رقم ${vm.invoice.revision}`;
    if (vm.invoice.updatedAt) {
      const upd = new Date(vm.invoice.updatedAt);
      const updDate = upd.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
      const updTime = upd.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      msg += `\nآخر تعديل: ${updDate} ${updTime}`;
    }
    if (vm.invoice.updatedByName) msg += `\nتم التعديل بواسطة: ${vm.invoice.updatedByName}`;
  }

  if (vm.geoGuidance) {
    msg += `\n\n📝 ملاحظة:\n${vm.geoGuidance}`;
  }

  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

export function buildWhatsAppUrl(vm) {
  return buildWhatsAppMessage(vm);
}

export function openWhatsApp(url) {
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export function openInvoicePdf(vm) {
  const html = renderInvoiceHtml(vm);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; } }, 500);
}
