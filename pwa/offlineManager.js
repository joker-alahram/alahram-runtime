import { logError } from '../utils/logger.js';
const LS_QUEUE_KEY = 'v2_offline_queue';
let _initialized = false;

let _queue = [];

export function initOfflineManager() {
  if (_initialized) return;
  _initialized = true;
  _queue = _load();

  // SW registration errors already caught in pwaRuntime — this module doesn't depend on SW
  // Cache API is only used by SW, not by this offline queue
}

export function getOfflineQueue() {
  return [..._queue];
}

export function enqueueAction(action) {
  if (!action || !action.type) return;
  _queue.push({
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    retries: 0,
  });
  _persist();
  window.dispatchEvent(new CustomEvent('v2:offline-queued', { detail: { queueSize: _queue.length } }));
}

export function dequeueAction(id) {
  _queue = _queue.filter(a => a.id !== id);
  _persist();
}

export function clearQueue() {
  _queue = [];
  _persist();
}

export function getOfflineFallbackPage() {
  return '/offline.html';
}

export async function processQueue(executor) {
  if (!_queue.length) return;
  if (typeof executor !== 'function') return;

  const snapshot = [..._queue];
  for (const action of snapshot) {
    try {
      await executor(action);
      dequeueAction(action.id);
    } catch {
      _markFailed(action);
    }
  }
}

function _markFailed(action) {
  const found = _queue.find(a => a.id === action.id);
  if (found) {
    found.retries = (found.retries || 0) + 1;
    found.lastError = new Date().toISOString();
  }
  _persist();
}

function _load() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE_KEY)) || []; } catch { return []; }
}

function _persist() {
  try { localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(_queue)); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
}

