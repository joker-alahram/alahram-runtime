// /new — Standalone Production Runtime
// domains/ops/router.js

const R = [
  { p: /^ops$/, n: 'ops/dashboard' }, { p: /^ops\/dashboard$/, n: 'ops/dashboard' },
  { p: /^ops\/orders$/, n: 'ops/orders' }, { p: /^ops\/orders\/([^/]+)$/, n: 'ops/order', a: ['orderId'] },
  { p: /^ops\/customers$/, n: 'ops/customers' }, { p: /^ops\/customers\/([^/]+)$/, n: 'ops/customer', a: ['customerId'] },
  { p: /^ops\/inventory$/, n: 'ops/inventory' }, { p: /^ops\/inventory\/([^/]+)$/, n: 'ops/inventory-product', a: ['productId'] },
  { p: /^ops\/pricing$/, n: 'ops/pricing' }, { p: /^ops\/pricing\/([^/]+)$/, n: 'ops/pricing-product', a: ['productId'] },
  { p: /^ops\/employees$/, n: 'ops/employees' }, { p: /^ops\/employees\/([^/]+)$/, n: 'ops/employee', a: ['employeeId'] },
  { p: /^ops\/workflow$/, n: 'ops/workflow' },
  { p: /^ops\/warehouses$/, n: 'ops/warehouses' }, { p: /^ops\/events$/, n: 'ops/events' },
  { p: /^ops\/products$/, n: 'ops/products' }, { p: /^ops\/products\/([^/]+)$/, n: 'ops/product', a: ['productId'] },
  { p: /^ops\/reps$/, n: 'ops/reps' }, { p: /^ops\/reps\/([^/]+)$/, n: 'ops/rep', a: ['repId'] },
  { p: /^ops\/audit$/, n: 'ops/audit' }, { p: /^ops\/reports$/, n: 'ops/reports' },
  { p: /^ops\/campaigns$/, n: 'ops/campaigns' },
  { p: /^ops\/treasury$/, n: 'ops/treasury' },
];

export function parseOpsRoute(hash) {
  const r = String(hash || location.hash).replace(/^#/, '').split('?')[0];
  for (const rt of R) { const m = r.match(rt.p); if (m) { const p = {}; if (rt.a) rt.a.forEach((k, i) => p[k] = m[i + 1] || ''); return { name: rt.n, params: p }; } }
  return /^ops/.test(r) ? { name: 'ops/dashboard', params: {} } : { name: 'ops/dashboard', params: {} };
}
