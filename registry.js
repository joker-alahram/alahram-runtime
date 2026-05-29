// /new — Standalone Production Runtime
// registry.js — Domain lifecycle manager. Generation-gated transitions.
//
// Fully self-contained, lazy-loaded, route-scoped.
// Container visibility is the single authority — no domain manages its own.
// Auth guard is async — delegates to current_has_capability() RPC.

import { getSession } from './auth/sessionService.js';
import { checkRouteAccess } from './auth/authGuard.js';
import { logError } from './utils/logger.js';

const DOMAINS = {
  storefront: {
    pattern: /^$|^(home|products?|customer|cart|checkout|orders?|offers|dailydeal|flashoffer|login|register|search|companies?|tiers|invoices?|account|customers|visits?)$/,
    containerId: 'app-storefront',
    module: () => import('./domains/storefront/bootstrap.js'),
  },
  ops: {
    pattern: /^ops/, containerId: 'app-ops',
    module: () => import('./domains/ops/bootstrap.js'),
  },
  field: {
    pattern: /^field/, containerId: 'app-field',
    module: () => import('./domains/field/bootstrap.js'),
  },
  portal: {
    pattern: /^portal/, containerId: 'app-portal',
    module: () => import('./domains/portal/bootstrap.js'),
  },
  pwa: {
    pattern: /^pwa/,
    containerId: 'app-pwa',
    module: () => import('./domains/pwa/bootstrap.js'),
  },
};

const ORDER = ['storefront', 'ops', 'field', 'portal', 'pwa'];
let _current = null;
let _loaded = new Set();
let _generation = 0;
const _teardowns = new Map();

export function resolveDomain(hash) {
  const raw = String(hash || location.hash).replace(/^#/, '').split('?')[0];
  for (const [name, def] of Object.entries(DOMAINS)) {
    if (def.pattern.test(raw)) return name;
  }
  return 'storefront';
}

export function getDomainContainer(name) {
  return document.getElementById(DOMAINS[name]?.containerId);
}

// ——— Auth guard (async — delegates to RPC) —————————

let _lastGuardRedirect = 0;

async function _guard(targetDomain) {
  if (targetDomain === 'storefront') return false;

  let routeName = String(location.hash).replace(/^#/, '').split('?')[0];
  if (!routeName || routeName === targetDomain) {
    routeName = `${targetDomain}/dashboard`;
  }

  const { allowed, reason } = await checkRouteAccess(routeName);
  if (allowed) return false;

  const now = Date.now();
  if (now - _lastGuardRedirect < 3000) return true;
  _lastGuardRedirect = now;

  if (reason === 'auth_required') {
    location.hash = '#login';
    return true;
  }

  _renderForbidden(targetDomain, routeName);
  return true;
}

function _renderForbidden(targetDomain, routeName) {
  const container = getDomainContainer(targetDomain);
  if (!container) { location.hash = '#home'; return; }
  for (const name of ORDER) {
    const el = document.getElementById(DOMAINS[name].containerId);
    if (el) el.style.display = name === targetDomain ? '' : 'none';
  }
  const label = routeName.replace(targetDomain + '/', '').replace(/\//g, ' ');
  // If domain shell is already rendered, only replace content area
  const contentEl = container.querySelector('#v2-ops-content, #v2-field-content, #v2-portal-content');
  if (contentEl) {
    contentEl.innerHTML = `<div style="text-align:center;padding:3rem">
      <div style="font-size:3rem;margin-bottom:0.5rem">🚫</div>
      <h2 style="font-size:1.5rem;color:#dc2626;margin-bottom:0.5rem">ليس لديك صلاحية الوصول</h2>
      <p style="color:#6b7280;margin-bottom:1rem;font-size:1rem">لا تملك الصلاحية المطلوبة للوصول إلى هذه الصفحة</p>
      <p style="color:#9ca3af;font-size:0.875rem;direction:ltr">${_e(label)}</p>
    </div>`;
    return;
  }
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem;text-align:center;background:#f9fafb;font-family:system-ui,sans-serif">
    <div>
      <div style="font-size:3rem;margin-bottom:0.5rem">🚫</div>
      <h2 style="font-size:1.5rem;color:#dc2626;margin-bottom:0.5rem">ليس لديك صلاحية الوصول</h2>
      <p style="color:#6b7280;margin-bottom:1rem">لا تملك الصلاحية المطلوبة للوصول إلى هذه الصفحة</p>
      <p style="color:#9ca3af;font-size:0.875rem;margin-bottom:2rem;direction:ltr">${_e(label)}</p>
      <a href="#ops" style="display:inline-block;padding:.5rem 1rem;background:#0d2b6b;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">العودة للوحة التحكم</a>
    </div>
  </div>`;
}

function _e(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function _destroy(name) {
  const fn = _teardowns.get(name);
  if (fn) try { fn(); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  _teardowns.delete(name);
  _loaded.delete(name);
}

// ——— Transition — generation-only, latest-wins ———————
//
// No _pending gate. Each call bumps _generation (logical clock).
// After every await, generation check discards superseded work.
// Latest URL always wins — no dead transition windows.

import { startLog, endLog } from './utils/runtimeLogger.js';

export async function transitionTo(domainName) {
  const gen = ++_generation;
  startLog('transition_start', { domainName });
  if (await _guard(domainName)) return;
  if (_generation !== gen) return;

  const def = DOMAINS[domainName];
  if (!def) { endLog('transition_end', { status: 'no_def', domainName }); return; }
  if (_current === domainName && _loaded.has(domainName)) { endLog('transition_end', { status: 'already_loaded', domainName }); return; }

  const prev = _current;
  if (prev && prev !== domainName) _destroy(prev);

  if (!_loaded.has(domainName)) {
    try {
      const mod = await def.module();
      if (_generation !== gen) return;

      if (mod.bootstrapDomain) {
        const teardown = await mod.bootstrapDomain();
        if (_generation !== gen) {
          if (typeof teardown === 'function') try { teardown(); } catch {};
          return;
        }
        if (typeof teardown === 'function') _teardowns.set(domainName, teardown);
      }
      _loaded.add(domainName);
    } catch (e) {
      logError('failed: ' + domainName, e);
      endLog('transition_end', { status: 'error', domainName, error: e.message });
      return;
    }
  }

  if (_generation !== gen) return;

  for (const name of ORDER) {
    const el = document.getElementById(DOMAINS[name].containerId);
    if (el) el.style.display = name === domainName ? '' : 'none';
  }

  _current = domainName;
  endLog('transition_end', { status: 'success', domainName });
}

