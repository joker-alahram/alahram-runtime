import { GUIDANCE_MAP } from './guidanceRegistry.js';
import { renderCard, renderBanner, showToast, renderModal, bindActions } from './guidanceUI.js';
import { logError } from '../utils/logger.js';

// ─── Guidance Resolution ────────────────────────────

export function getGuidance(code, context = {}) {
  const entry = GUIDANCE_MAP[code];
  if (!entry) return null;

  const actions = entry.actions.map(a => ({
    ...a,
    label: _interpolate(a.label, context),
    target: a.target ? _interpolate(a.target, context) : null,
  }));

  return {
    code,
    severity: entry.severity,
    title: _interpolate(entry.title, context),
    description: _interpolate(entry.description, context),
    actions,
  };
}

// ─── Guidance Rendering ─────────────────────────────

export function renderGuidanceCard(container, code, context) {
  const g = getGuidance(code, context);
  if (!g) return null;

  const html = renderCard(container, g);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const el = wrapper.firstElementChild;
  if (el) container.appendChild(el);

  bindActions(el || container, _execute);
  return el;
}

export function renderGuidanceBanner(container, code, context) {
  const g = getGuidance(code, context);
  if (!g) return null;

  const el = renderBanner(container, g);
  container.appendChild(el);
  bindActions(el, _execute);
  return el;
}

export function toast(code, context) {
  const g = getGuidance(code, context);
  if (!g) return;
  showToast(g);
}

// ─── Action Execution ───────────────────────────────

function _execute(action) {
  if (!action || !action.type) return;

  switch (action.type) {
    case 'navigate':
      if (action.target) location.hash = action.target;
      break;

    case 'rerender':
      if (action.target) location.hash = action.target;
      break;

    case 'retry':
      window.dispatchEvent(new CustomEvent('v2:guidance-retry', {
        detail: { code: action._code, target: action.target },
      }));
      break;

    case 'relogin':
      location.hash = '#login';
      break;

    default:
      logError('unknown guidance action', action);
  }
}

// ─── Utils ──────────────────────────────────────────

function _interpolate(str, context) {
  if (!str || !context) return str || '';
  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return context[key] !== undefined ? String(context[key]) : `{${key}}`;
  });
}
