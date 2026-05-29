// /new — Standalone Production Runtime
// app.js — Entry point. No imports from outside /new/.

import { resolveDomain, transitionTo } from './registry.js';
import { bootV2 } from './bootstrap.js';
import { bootPwaRuntime } from './pwa/pwaRuntime.js';
import { initCartRuntime } from './services/storefront/cartApi.js';
import { logError } from './utils/logger.js';

if (window.__booted) {
  console.log('[BOOT] Skipping duplicate initialization');
} else {
  window.__booted = true;

  window.addEventListener('hashchange', () => {
    const domain = resolveDomain(location.hash);
    transitionTo(domain).catch(e => logError('transition', e));
  });

  Promise.all([
    bootV2(),
    bootPwaRuntime(),
  ]).then(() => {
    initCartRuntime();
  }).catch(e => logError('boot fail', e));
}
