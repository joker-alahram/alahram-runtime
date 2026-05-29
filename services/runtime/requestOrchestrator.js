const _inflight = new Map();
const _failCounters = new Map();
const _abortControllers = new Map();
const _timestamps = new Map();
const _tagged = new Map();

const COOLDOWN_MS = 30000;
const MAX_RETRIES = 2;
const BACKOFF_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;
const STALE_MS = 60000;

const _telemetry = { total: 0, dedupHits: 0, cooldownHits: 0, failures: 0, aborts: 0, retries: 0 };

function _cacheKey(url, options) {
  return `${options?.method || 'GET'}::${url}`;
}

function _isOnCooldown(key) {
  const entry = _failCounters.get(key);
  if (!entry) return false;
  if (Date.now() - entry.lastFail > COOLDOWN_MS) {
    _failCounters.delete(key);
    return false;
  }
  return entry.count >= 2;
}

function _recordFail(key) {
  const entry = _failCounters.get(key) || { count: 0, lastFail: 0 };
  entry.count++;
  entry.lastFail = Date.now();
  _failCounters.set(key, entry);
  _telemetry.failures++;
}

function _recordSuccess(key) {
  _failCounters.delete(key);
}

export function getTelemetry() {
  return { ..._telemetry, inflight: _inflight.size, cooldowned: _failCounters.size };
}

export function cancelPending(pattern) {
  let count = 0;
  for (const [key, controller] of _abortControllers) {
    if (key.includes(pattern)) {
      controller.abort();
      _abortControllers.delete(key);
      _inflight.delete(key);
      count++;
    }
  }
  if (count) { _telemetry.aborts += count; console.log(`[rq] cancelled ${count} pending requests matching "${pattern}"`); }
  return count;
}

export function clearFailCounters() {
  _failCounters.clear();
}

export function tagRequest(key, tag) {
  if (!_tagged.has(tag)) _tagged.set(tag, new Set());
  _tagged.get(tag).add(key);
}

export function cancelTag(tag) {
  const keys = _tagged.get(tag);
  if (!keys) return 0;
  let count = 0;
  for (const key of keys) {
    const controller = _abortControllers.get(key);
    if (controller) { controller.abort(); _abortControllers.delete(key); _inflight.delete(key); count++; }
  }
  _tagged.delete(tag);
  if (count) { _telemetry.aborts += count; console.log(`[rq] cancelled ${count} tagged "${tag}"`); }
  return count;
}

export function invalidateStale(pattern) {
  let count = 0;
  const now = Date.now();
  for (const [key, ts] of _timestamps) {
    if (!key.includes(pattern)) continue;
    if (now - ts > STALE_MS) {
      const controller = _abortControllers.get(key);
      if (controller) { controller.abort(); _inflight.delete(key); _abortControllers.delete(key); count++; }
      _timestamps.delete(key);
    }
  }
  return count;
}

export async function orchestratedFetch(url, options = {}) {
  const key = _cacheKey(url, options);
  const { retries = 0, dedup = true, signal, timeout = DEFAULT_TIMEOUT_MS, tag } = options;
  _telemetry.total++;

  if (_isOnCooldown(key)) {
    _telemetry.cooldownHits++;
    return { ok: false, status: 429, _cooldown: true };
  }

  if (dedup && _inflight.has(key)) {
    _telemetry.dedupHits++;
    return _inflight.get(key);
  }

  const controller = new AbortController();
  _abortControllers.set(key, controller);
  if (tag) tagRequest(key, tag);

  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeout);
  const combinedSignal = signal
    ? anySignal([signal, controller.signal])
    : controller.signal;

  const fetchOpts = { ...options, signal: combinedSignal };
  delete fetchOpts.dedup; delete fetchOpts.retries; delete fetchOpts.tag;

  const doFetch = async (attempt) => {
    try {
      const r = await fetch(url, fetchOpts);
      clearTimeout(timeoutId);
      if (r.ok) {
        _recordSuccess(key);
        _timestamps.set(key, Date.now());
        return r;
      }
      if (r.status >= 500 && attempt < (retries || MAX_RETRIES)) {
        _telemetry.retries++;
        await _delay(BACKOFF_MS * (attempt + 1));
        return doFetch(attempt + 1);
      }
      if (r.status >= 400) _recordFail(key);
      return r;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') throw e;
      if (attempt < (retries || MAX_RETRIES)) {
        _telemetry.retries++;
        await _delay(BACKOFF_MS * (attempt + 1));
        return doFetch(attempt + 1);
      }
      _recordFail(key);
      throw e;
    }
  };

  const promise = doFetch(0).finally(() => {
    _inflight.delete(key);
    _abortControllers.delete(key);
  });

  if (dedup) _inflight.set(key, promise);
  return promise;
}

function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function anySignal(signals) {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) { controller.abort(s.reason); return controller.signal; }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}
