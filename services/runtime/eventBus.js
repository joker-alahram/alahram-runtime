const _listeners = new Map();
const _history = [];
const MAX_HISTORY = 200;
let _enabled = true;

export const EVENTS = {
  SESSION_RESTORED: 'session_restored',
  SESSION_EXPIRED: 'session_expired',
  ACTOR_CHANGED: 'actor_changed',
  PROFILE_RESOLVED: 'profile_resolved',
  OFFER_STARTED: 'offer_started',
  OFFER_EXPIRED: 'offer_expired',
  OFFER_PAUSED: 'offer_paused',
  OFFER_RESUMED: 'offer_resumed',
  OFFER_EXHAUSTED: 'offer_exhausted',
  TIER_CHANGED: 'tier_changed',
  PRICING_RECALCULATED: 'pricing_recalculated',
  CART_CHANGED: 'cart_changed',
  CART_INVALIDATED: 'cart_invalidated',
  VISIT_STARTED: 'visit_started',
  VISIT_COMPLETED: 'visit_completed',
  VISIT_CANCELLED: 'visit_cancelled',
  INVOICE_CREATED: 'invoice_created',
  INVOICE_UPDATED: 'invoice_updated',
  INVOICE_SENT: 'invoice_sent',
  ALERT_CREATED: 'runtime_alert_created',
  ALERT_RESOLVED: 'runtime_alert_resolved',
};

export function emit(event, payload = {}) {
  if (!_enabled) return;
  const entry = { event, payload, ts: Date.now(), id: `${event}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` };
  _history.push(entry);
  if (_history.length > MAX_HISTORY) _history.shift();
  const handlers = _listeners.get(event);
  if (!handlers) return;
  for (const fn of handlers) {
    try { fn(entry); } catch (e) { console.warn(`[bus] handler error for ${event}:`, e.message); }
  }
}

export function on(event, fn) {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(fn);
  return () => { const s = _listeners.get(event); if (s) s.delete(fn); };
}

export function off(event, fn) {
  const s = _listeners.get(event);
  if (s) s.delete(fn);
}

export function once(event, fn) {
  const wrapper = (entry) => { fn(entry); off(event, wrapper); };
  return on(event, wrapper);
}

export function getHistory(event) {
  if (event) return _history.filter(h => h.event === event);
  return [..._history];
}

export function pause() { _enabled = false; }
export function resume() { _enabled = true; }
export function clearHistory() { _history.length = 0; }
