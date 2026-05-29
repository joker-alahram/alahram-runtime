export function normalizePhone(input) {
  if (!input) return '';
  let p = input.trim().replace(/[\s\-\(\)]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('20') && p.length === 12) return p;
  if (p.startsWith('0') && p.length === 11) return '2' + p;
  return p;
}

export function validateEgyptianPhone(input) {
  if (!input) return 'يرجى إدخال رقم الهاتف';
  const normalized = normalizePhone(input);
  if (normalized.length !== 12 || !normalized.startsWith('201')) {
    return 'رقم الهاتف غير صحيح. مثال: 01002082831';
  }
  return null;
}
