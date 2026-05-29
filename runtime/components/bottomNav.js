import { esc, cls } from './helpers.js';

export function bottomNav(items, activeId) {
  if (!items?.length) return '';
  return `<nav class="v3-bottom-nav">${items.map(item => navItem(item, activeId)).join('')}</nav>`;
}

function navItem(item, activeId) {
  const isActive = item.id === activeId;
  return `<button class="${cls('v3-bottom-nav-item', isActive && 'v3-bottom-nav-item-active')}" data-nav="${esc(item.id)}">
    ${item.icon ? `<span class="v3-bottom-nav-icon">${item.icon}</span>` : ''}
    <span>${esc(item.label)}</span>
  </button>`;
}

export function quickActions(items) {
  if (!items?.length) return '';
  return `<div class="v3-actions">${items.map(a => `
    <button class="v3-action-btn" data-action="${esc(a.action)}">
      ${a.icon ? `<span class="v3-action-icon">${a.icon}</span>` : ''}
      <span>${esc(a.label)}</span>
    </button>
  `).join('')}</div>`;
}
