export function esc(s) {
  if (!s && s !== 0) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

export function money(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('en-US') + ' ج.م';
}

export function dateStr(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeStr(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export function cls(...args) {
  return args.filter(Boolean).join(' ');
}
