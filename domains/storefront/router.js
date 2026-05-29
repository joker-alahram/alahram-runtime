// /new — Standalone Production Runtime
// domains/storefront/router.js — Storefront route definitions.

const ROUTES = [
  { p: /^$|^home$/, n: 'home' },
  { p: /^products$/, n: 'products' },
  { p: /^products\/([^/]+)$/, n: 'product', params: ['productId'] },
  { p: /^cart$/, n: 'cart' },
  { p: /^checkout$/, n: 'checkout' },
  { p: /^orders$/, n: 'orders' },
  { p: /^orders\/([^/]+)$/, n: 'order', params: ['orderId'] },
  { p: /^offers$/, n: 'offers' },
  { p: /^dailydeal$/, n: 'dailydeal' },
  { p: /^flashoffer$/, n: 'flashoffer' },
  { p: /^login$/, n: 'login' },
  { p: /^register$/, n: 'register' },
  { p: /^search$/, n: 'search' },
  { p: /^companies$/, n: 'companies' },
  { p: /^company\/([^/]+)$/, n: 'company', params: ['companyId'] },
  { p: /^tiers$/, n: 'tiers' },
  { p: /^invoices$/, n: 'invoices' },
  { p: /^invoices\/([^/]+)$/, n: 'invoice', params: ['invoiceId'] },
  { p: /^account$/, n: 'account' },
  { p: /^customers$/, n: 'customers' },
  { p: /^customer\/([^/]+)$/, n: 'customer', params: ['customerId'] },
  { p: /^visits$/, n: 'visits' },
  { p: /^visits\/([^/]+)$/, n: 'visit', params: ['visitId'] },
  { p: /^reps$/, n: 'reps' },
  { p: /^reps\/([^/]+)$/, n: 'rep', params: ['repId'] },
];

export function parseStorefrontRoute(hash) {
  const r = String(hash || location.hash).replace(/^#/, '').split('?')[0];
  for (const rt of ROUTES) {
    const m = r.match(rt.p);
    if (m) {
      const params = {};
      if (rt.params) rt.params.forEach((k, i) => { params[k] = m[i + 1] || ''; });
      return { name: rt.n, params };
    }
  }
  return { name: 'home', params: {} };
}
