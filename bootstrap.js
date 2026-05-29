// /new — Standalone Production Runtime
// bootstrap.js — V2 boot sequence. Fully self-contained.

import { resolveDomain, transitionTo } from './registry.js';
import { subscribe } from './auth/sessionService.js';
import { renderLoginPage, bindLoginForm } from './auth/loginPage.js';
import { logError } from './utils/logger.js';
import { startLog, endLog } from './utils/runtimeLogger.js';

let _booted = false;
let _unsubSession = null;

export async function bootV2() {
  startLog('bootV2_start');
  if (_booted) {
    endLog('bootV2_end', { status: 'already_booted' });
    return;
  }

  const { initV2Auth } = await import('./auth/bootstrap.js');
  await initV2Auth();

  let _lastRedirect = 0;
  _unsubSession = subscribe((session) => {
    if (session.status !== 'authenticated') {
      const now = Date.now();
      if (now - _lastRedirect < 2000) return;
      _lastRedirect = now;
      const cur = resolveDomain(location.hash);
      if (cur !== 'storefront' && cur !== 'ops' && cur !== 'field' && cur !== 'portal') location.hash = '#home';
    }
  });

  const domain = resolveDomain(location.hash);
  await transitionTo(domain).catch(e => {
    logError('boot fail', e);
    endLog('bootV2_end', { status: 'error', error: e.message });
    throw e;
  });
  _booted = true;
  endLog('bootV2_end', { status: 'success' });
}
