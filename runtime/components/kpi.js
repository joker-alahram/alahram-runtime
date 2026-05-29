import { esc, money } from './helpers.js';

export function kpiStrip(items) {
  if (!items?.length) return '';
  return `<div class="v3-kpi">${items.map(kpiCard).join('')}</div>`;
}

function kpiCard(item) {
  const val = item.money ? money(item.value) : esc(String(item.value ?? ''));
  return `<div class="v3-kpi-card">
    ${item.icon ? `<div class="v3-kpi-icon">${item.icon}</div>` : ''}
    <div class="v3-kpi-value">${val}</div>
    <div class="v3-kpi-label">${esc(item.label)}</div>
  </div>`;
}
