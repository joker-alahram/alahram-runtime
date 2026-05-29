// /new — Standalone Production Runtime
// domains/field/router.js

const R = [
  { p: /^field$/, n: 'field/dashboard' }, { p: /^field\/dashboard$/, n: 'field/dashboard' },
  { p: /^field\/visits$/, n: 'field/visits' }, { p: /^field\/visits\/([^/]+)$/, n: 'field/visit', a: ['visitId'] },
  { p: /^field\/customers$/, n: 'field/customers' }, { p: /^field\/customers\/([^/]+)$/, n: 'field/customer', a: ['customerId'] },
  { p: /^field\/orders$/, n: 'field/orders' }, { p: /^field\/orders\/([^/]+)$/, n: 'field/order', a: ['orderId'] },
  { p: /^field\/collections$/, n: 'field/collections' }, { p: /^field\/collections\/([^/]+)$/, n: 'field/collection', a: ['collectionId'] },
  { p: /^field\/tasks$/, n: 'field/tasks' }, { p: /^field\/tasks\/([^/]+)$/, n: 'field/task', a: ['taskId'] },
  { p: /^field\/location$/, n: 'field/location' }, { p: /^field\/today$/, n: 'field/dashboard' },
];

export function parseFieldRoute(hash) {
  const r = String(hash || location.hash).replace(/^#/, '').split('?')[0];
  for (const rt of R) { const m = r.match(rt.p); if (m) { const p = {}; if (rt.a) rt.a.forEach((k, i) => p[k] = m[i + 1] || ''); return { name: rt.n, params: p }; } }
  return /^field/.test(r) ? { name: 'field/dashboard', params: {} } : { name: 'field/dashboard', params: {} };
}
