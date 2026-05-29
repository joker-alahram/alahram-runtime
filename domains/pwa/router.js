const R = [
  { p: /^pwa$/, n: 'pwa/dashboard' },
  { p: /^pwa\/install$/, n: 'pwa/install' },
  { p: /^pwa\/settings$/, n: 'pwa/settings' },
];

export function parsePwaRoute(hash) {
  const r = String(hash || location.hash).replace(/^#/, '').split('?')[0];
  for (const rt of R) {
    const m = r.match(rt.p);
    if (m) return { name: rt.n, params: {} };
  }
  return /^pwa/.test(r) ? { name: 'pwa/dashboard', params: {} } : { name: 'pwa/dashboard', params: {} };
}
