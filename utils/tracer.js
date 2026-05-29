/* Browser‑safe tracer: logs to console */

/**
 * Generic console tracer.
 * @param {string} event - Name of the event being traced.
 * @param {Object} payload - Additional data for the trace.
 */
export function trace(event, payload = {}) {
  console.log('[TRACE]', event, {
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

/**
 * Compatibility wrapper used by existing code (recordTrace).
 * It forwards the data to the console tracer under a generic event name.
 */
export function recordTrace(data) {
  trace('record', data);
}
