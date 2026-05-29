const _metrics = new Map();
const _traces = [];
const MAX_TRACES = 500;

export const METRIC_KEYS = {
  HYDRATION_DURATION: 'hydration_ms',
  SESSION_RESTORE_DURATION: 'session_restore_ms',
  PRICING_RECALC_DURATION: 'pricing_recalc_ms',
  CART_RECALC_DURATION: 'cart_recalc_ms',
  CAMPAIGN_ACTIVATION: 'campaign_activation_ms',
  INVOICE_GENERATION: 'invoice_generation_ms',
  FAILED_EVENTS: 'failed_events',
  RETRY_COUNT: 'retry_count',
  COOLDOWN_ACTIVATIONS: 'cooldown_activations',
  STALE_INVALIDATIONS: 'stale_invalidations',
};

export function startSpan(name) {
  const start = performance.now();
  return {
    name,
    end(meta) {
      const dur = performance.now() - start;
      recordMetric(name, dur);
      _addTrace({ name, duration: dur, ts: Date.now(), meta });
      return dur;
    },
  };
}

export function recordMetric(key, value) {
  const entry = _metrics.get(key) || { count: 0, total: 0, min: Infinity, max: 0, last: null };
  entry.count++;
  entry.total += value;
  if (value < entry.min) entry.min = value;
  if (value > entry.max) entry.max = value;
  entry.last = value;
  _metrics.set(key, entry);
}

export function incrementCounter(key) {
  const entry = _metrics.get(key) || { count: 0, total: 0, min: 0, max: 0, last: 0 };
  entry.count++;
  entry.total++;
  entry.last = entry.total;
  _metrics.set(key, entry);
}

export function getMetrics() {
  const out = {};
  for (const [key, val] of _metrics) {
    out[key] = { ...val, avg: val.count > 0 ? Math.round(val.total / val.count) : 0 };
  }
  return out;
}

export function getTraces(count = 50) {
  return _traces.slice(-count);
}

function _addTrace(trace) {
  _traces.push(trace);
  if (_traces.length > MAX_TRACES) _traces.shift();
}
