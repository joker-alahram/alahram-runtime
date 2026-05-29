// /new — Standalone Production Runtime
// domains/portal/router.js

const R = [
  { p: /^portal$/, n: 'portal/dashboard' }, { p: /^portal\/dashboard$/, n: 'portal/dashboard' },
  { p: /^portal\/orders$/, n: 'portal/orders' }, { p: /^portal\/orders\/([^/]+)$/, n: 'portal/order', a: ['orderId'] },
  { p: /^portal\/invoices$/, n: 'portal/invoices' }, { p: /^portal\/invoices\/([^/]+)$/, n: 'portal/invoice', a: ['invoiceId'] },
  { p: /^portal\/visits$/, n: 'portal/visits' }, { p: /^portal\/visits\/([^/]+)$/, n: 'portal/visit', a: ['visitId'] },
  { p: /^portal\/profile$/, n: 'portal/profile' },
];

export function parsePortalRoute(hash) {
  const r = String(hash || location.hash).replace(/^#/, '').split('?')[0];
  for (const rt of R) { const m = r.match(rt.p); if (m) { const p = {}; if (rt.a) rt.a.forEach((k, i) => p[k] = m[i + 1] || ''); return { name: rt.n, params: p }; } }
  return /^portal/.test(r) ? { name: 'portal/dashboard', params: {} } : { name: 'portal/dashboard', params: {} };
}
