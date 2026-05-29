import { esc } from './helpers.js';

export function searchBar({ placeholder, context, onSearch } = {}) {
  const ph = placeholder || 'بحث...';
  return `<div class="v3-search">
    <input type="text" class="v3-search-input" placeholder="${esc(ph)}" data-search-context="${esc(context || '')}" autocomplete="off">
    <div class="v3-search-results" style="display:none"></div>
  </div>`;
}

export function searchResultItem(item) {
  return `<div class="v3-search-item" data-link="${esc(item.link || '')}">
    ${item.icon ? `<span class="v3-search-icon">${item.icon}</span>` : ''}
    <span>${esc(item.label)}</span>
    ${item.sub ? `<span class="v3-text-xs v3-text-muted">${esc(item.sub)}</span>` : ''}
  </div>`;
}
