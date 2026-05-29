let _toastTimer = null;

export function renderCard(container, guidance) {
  const iconMap = { info: 'ℹ️', warning: '⚠️', blocking: '🔴', critical: '🚫' };
  const icon = iconMap[guidance.severity] || 'ℹ️';
  const actionsHtml = guidance.actions.map(a =>
    `<button class="v2-guidance-action" data-action="${a.type}" data-target="${a.target || ''}" data-label="${a.label}">${a.icon || ''} ${a.label}</button>`
  ).join('');

  return `<div class="v2-guidance-card v2-guidance-${guidance.severity}" data-code="${guidance.code}">
    <div class="v2-guidance-header">
      <span class="v2-guidance-icon">${icon}</span>
      <strong class="v2-guidance-title">${_e(guidance.title)}</strong>
    </div>
    <div class="v2-guidance-body">
      <p class="v2-guidance-desc">${_e(guidance.description)}</p>
      ${actionsHtml ? `<div class="v2-guidance-actions">${actionsHtml}</div>` : ''}
    </div>
  </div>`;
}

export function renderBanner(container, guidance) {
  const actionsHtml = guidance.actions.slice(0, 1).map(a =>
    `<button class="v2-guidance-action v2-guidance-action-sm" data-action="${a.type}" data-target="${a.target || ''}">${a.label}</button>`
  ).join('');

  const el = document.createElement('div');
  el.className = `v2-guidance-banner v2-guidance-${guidance.severity}`;
  el.dataset.code = guidance.code;
  el.innerHTML = `<span>${_e(guidance.title)}</span>${actionsHtml}`;
  return el;
}

export function showToast(guidance) {
  const existing = document.querySelector('.v2-guidance-toast');
  if (existing) existing.remove();
  if (_toastTimer) clearTimeout(_toastTimer);

  const el = document.createElement('div');
  el.className = `v2-guidance-toast v2-guidance-${guidance.severity}`;
  el.innerHTML = `<span>${_e(guidance.title)}</span><button class="v2-guidance-close">✕</button>`;

  el.querySelector('.v2-guidance-close')?.addEventListener('click', () => el.remove());
  document.body.appendChild(el);

  _toastTimer = setTimeout(() => { if (el.parentNode) el.remove(); }, 5000);
}

export function renderModal(container, guidance) {
  const overlay = document.createElement('div');
  overlay.className = 'v2-guidance-overlay';
  overlay.innerHTML = `<div class="v2-guidance-modal v2-guidance-${guidance.severity}">
    <div class="v2-guidance-header">
      <span class="v2-guidance-icon">🚫</span>
      <strong class="v2-guidance-title">${_e(guidance.title)}</strong>
    </div>
    <div class="v2-guidance-body">
      <p class="v2-guidance-desc">${_e(guidance.description)}</p>
    </div>
    <div class="v2-guidance-actions">${guidance.actions.map(a =>
      `<button class="v2-guidance-action" data-action="${a.type}" data-target="${a.target || ''}">${a.label}</button>`
    ).join('')}</div>
  </div>`;

  container.appendChild(overlay);
  return overlay;
}

export function bindActions(container, executeAction) {
  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const el = e.currentTarget;
      executeAction({
        type: el.dataset.action,
        target: el.dataset.target,
        label: el.dataset.label,
      });
    });
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
