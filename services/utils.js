import { getSession } from '../auth/sessionService.js';
import { readConfig } from '../config.js';

export function apiHeaders(extra = {}) {
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json', ...extra };
  return h;
}

export function escapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function formatMoney(n) {
  if (n == null) return '';
  return Number(n).toLocaleString('en-US') + ' ج.م';
}

export function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('en-US');
}

export function isCustomer() {
  const s = getSession();
  return s?.actor?.type === 'customer' && !!s?.actor?.id;
}

export function customerId() {
  const s = getSession();
  return isCustomer() ? s.actor.id : null;
}
