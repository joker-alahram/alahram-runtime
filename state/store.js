// /new — Standalone Production Runtime
// state/store.js — Immutable store factory.
//
// Each call to createStore() produces an isolated state container.
// No global mutable state. No shared slices.
// Domain-scoped: ops, field, portal each get their own store instance.

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function clone(v) { return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
function merge(t, p) {
  if (!isObject(t) || !isObject(p)) return p;
  const n = Array.isArray(t) ? [...t] : { ...t };
  for (const [k, v] of Object.entries(p)) {
    if (Array.isArray(v)) n[k] = [...v];
    else if (isObject(v) && isObject(t[k])) n[k] = merge(t[k], v);
    else n[k] = v;
  }
  return n;
}

export function createStore(initial) {
  let state = clone(initial);
  const subs = new Set();

  function _notify(meta) {
    for (const fn of Array.from(subs)) fn(state, meta);
  }

  return {
    getState: () => state,

    setState: (next, meta = {}) => {
      state = typeof next === 'function' ? next(clone(state)) : clone(next);
      if (!meta.silent) _notify(meta);
      return state;
    },

    patch: (partial, meta = {}) => {
      state = merge(state, partial);
      if (!meta.silent) _notify(meta);
      return state;
    },

    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}
