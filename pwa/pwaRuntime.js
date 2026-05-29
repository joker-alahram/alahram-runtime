import { readConfig } from '../config.js';
import { logError } from '../utils/logger.js';
import { getSession } from '../auth/sessionService.js';
import { resolveDomain } from '../registry.js';
import { initInstallManager } from './installManager.js';
import { applyIOSHacks } from './iosHacks.js';
import { initOfflineManager } from './offlineManager.js';

const SW_PATH = './sw.js';

let _booted = false;
let _registration = null;
let _state = {
  isStandalone: false,
  isInstalled: false,
  isIOS: false,
  isAndroid: false,
  displayMode: 'browser',
};

export function getPwaState() {
  return { ..._state };
}

export function isStandalone() {
  return _state.isStandalone;
}

export async function bootPwaRuntime() {
  if (_booted) return;

  _detectEnvironment();
  applyIOSHacks(_state);
  initOfflineManager();

  if ('serviceWorker' in navigator) {
    try {
      _registration = await navigator.serviceWorker.register(SW_PATH, { scope: './' });
      _trackSWLifecycle(_registration);
    } catch (e) {
      logError('sw register failed', e);
    }
  }

  initInstallManager(_state);
  _booted = true;
}

function _detectEnvironment() {
  const ua = navigator.userAgent || '';
  _state.isIOS = /iPhone|iPad|iPod/i.test(ua) && !window.MSStream;
  _state.isAndroid = /Android/i.test(ua);
  _state.displayMode = _getDisplayMode();
  _state.isStandalone = _state.displayMode === 'standalone' || _state.displayMode === 'minimal-ui';
  _state.isInstalled = _state.isStandalone;
}

function _getDisplayMode() {
  if (window.navigator.standalone === true) return 'standalone';
  if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return 'window-controls-overlay';
  return 'browser';
}

function _trackSWLifecycle(reg) {
  reg.addEventListener('updatefound', () => {
    const newSW = reg.installing;
    if (!newSW) return;

    newSW.addEventListener('statechange', () => {
      if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
        _notifyUpdate();
      }
    });
  });
}

function _notifyUpdate() {
  window.dispatchEvent(new CustomEvent('v2:sw-update', {
    detail: { message: 'نسخة جديدة متاحة. أعد تحميل الصفحة للتحديث.' },
  }));
}

export function getDomainProfile(domain) {
  const profiles = {
    storefront: { display: 'standalone', orientation: 'portrait', promptPriority: 'medium' },
    field: { display: 'standalone', orientation: 'portrait', promptPriority: 'high' },
    ops: { display: 'standalone', orientation: 'any', promptPriority: 'low' },
    portal: { display: 'minimal-ui', orientation: 'portrait', promptPriority: 'low' },
  };
  return profiles[domain] || profiles.storefront;
}
