import { esc } from './helpers.js';

const STATUS_MAP = {
  delivered:  { cls: 'v3-badge-ok',    label: 'تم التسليم' },
  approved:   { cls: 'v3-badge-ok',    label: 'معتمد' },
  confirmed:  { cls: 'v3-badge-ok',    label: 'تم التأكيد' },
  collected:  { cls: 'v3-badge-ok',    label: 'تم التحصيل' },
  paid:       { cls: 'v3-badge-ok',    label: 'مدفوع' },
  completed:  { cls: 'v3-badge-ok',    label: 'مكتمل' },
  cancelled:  { cls: 'v3-badge-no',    label: 'ملغي' },
  returned:   { cls: 'v3-badge-no',    label: 'مرتجع' },
  rejected:   { cls: 'v3-badge-no',    label: 'مرفوض' },
  active:     { cls: 'v3-badge-ok',    label: 'مفتوحة' },
  pending:    { cls: 'v3-badge-warn',  label: 'قيد الانتظار' },
  draft:      { cls: 'v3-badge-warn',  label: 'مسودة' },
  submitted:  { cls: 'v3-badge-info',  label: 'تم الإرسال' },
  reviewing:  { cls: 'v3-badge-info',  label: 'تحت المراجعة' },
  preparing:  { cls: 'v3-badge-info',  label: 'قيد التجهيز' },
  dispatched: { cls: 'v3-badge-info',  label: 'خرج للشحن' },
  processing: { cls: 'v3-badge-info',  label: 'قيد التجهيز' },
  shipped:    { cls: 'v3-badge-info',  label: 'تم الشحن' },
};

export function badge(status, { size, label } = {}) {
  const key = String(status || '').trim().toLowerCase();
  const m = STATUS_MAP[key];
  const classes = ['v3-badge'];
  if (m) classes.push(m.cls);
  else classes.push('v3-badge-info');
  if (size === 'sm') classes.push('v3-badge-sm');
  const text = label || m?.label || status || 'غير معروف';
  return `<span class="${classes.join(' ')}">${esc(text)}</span>`;
}
