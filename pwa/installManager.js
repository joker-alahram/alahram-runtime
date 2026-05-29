import { logError } from '../utils/logger.js';
import { readConfig } from '../config.js';
import { getDomainProfile } from './pwaRuntime.js';
import { resolveDomain } from '../registry.js';

const LS_KEY = 'v2_pwa_install';
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 3;

let _deferredPrompt = null;
let _initialized = false;
let _installBtn = null;

const _ctaListeners = new Map();

export function initInstallManager(pwaState) {
  if (_initialized) return;
  _initialized = true;

  if (pwaState.isInstalled) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    _maybeShowPrompt(pwaState);
  });

  // Fallback for iOS Safari and other browsers that don't support beforeinstallprompt
  if (!('onbeforeinstallprompt' in window)) {
    setTimeout(() => {
      if (!_deferredPrompt && !pwaState.isInstalled) {
        _showCTAs();
      }
    }, 5000);
  }

  window.addEventListener('appinstalled', () => {
    _deferredPrompt = null;
    _recordInstall();
    pwaState.isInstalled = true;
    _hideAllCTAs();
    window.dispatchEvent(new CustomEvent('v2:installed'));
  });
}

function _maybeShowPrompt(pwaState) {
  if (!_deferredPrompt) return;
  if (pwaState.isInstalled) return;

  const record = _getRecord();
  if (record.dismissals >= MAX_DISMISSALS) return;
  if (record.lastPrompt && (Date.now() - record.lastPrompt < PROMPT_COOLDOWN_MS)) return;

  const domain = resolveDomain(location.hash);
  const profile = getDomainProfile(domain);

  if (profile.promptPriority === 'low') {
    _showCTAs();
    return;
  }

  setTimeout(() => {
    if (_deferredPrompt && !pwaState.isInstalled) {
      _showNativePrompt();
    }
  }, 30000);
}

async function _showNativePrompt() {
  if (!_deferredPrompt) return;
  const prompt = _deferredPrompt;
  _deferredPrompt = null;
  try {
    prompt.prompt();
    const result = await prompt.userChoice;

    if (result.outcome === 'accepted') {
      _recordInstall();
    } else {
      _recordDismissal();
      _showCTAs();
    }
  } catch {
    _showCTAs();
  }
}

export async function triggerInstall() {
  if (_deferredPrompt) {
    await _showNativePrompt();
    return;
  }

  const domain = resolveDomain(location.hash);
  const profile = getDomainProfile(domain);

  window.dispatchEvent(new CustomEvent('v2:install-cta-click', {
    detail: { domain, profile },
  }));
}

export function bindInstallCta(btn) {
  if (!btn || _ctaListeners.has(btn)) return;

  const handler = () => triggerInstall();
  btn.addEventListener('click', handler);
  _ctaListeners.set(btn, handler);
  _installBtn = btn;
}

export function unbindInstallCta(btn) {
  const handler = _ctaListeners.get(btn);
  if (handler) {
    btn.removeEventListener('click', handler);
    _ctaListeners.delete(btn);
  }
}

export function shouldShowInstallCta(pwaState) {
  if (pwaState.isInstalled) return false;
  if (!_deferredPrompt) return false;

  const record = _getRecord();
  if (record.dismissals >= MAX_DISMISSALS) return false;

  const domain = resolveDomain(location.hash);
  const profile = getDomainProfile(domain);

  if (record.dismissals > 0 && profile.promptPriority === 'low') return false;
  return true;
}

function _showCTAs() {
  window.dispatchEvent(new CustomEvent('v2:show-install-cta'));
}

function _hideAllCTAs() {
  window.dispatchEvent(new CustomEvent('v2:hide-install-cta'));
}

function _getRecord() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || { dismissals: 0, lastPrompt: null, installed: false };
  } catch {
    return { dismissals: 0, lastPrompt: null, installed: false };
  }
}

function _saveRecord(rec) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rec)); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

function _recordInstall() {
  const rec = _getRecord();
  rec.installed = true;
  _saveRecord(rec);
}

function _recordDismissal() {
  const rec = _getRecord();
  rec.dismissals = (rec.dismissals || 0) + 1;
  rec.lastPrompt = Date.now();
  _saveRecord(rec);
}

