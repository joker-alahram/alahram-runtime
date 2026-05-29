const _authorities = new Map();

export const DOMAINS = {
  SESSION: 'session',
  ACTOR: 'actor',
  PROFILE: 'profile',
  PRICING: 'pricing',
  CART: 'cart',
  OFFERS: 'offers',
  VISITS: 'visits',
  INVOICES: 'invoices',
  ALERTS: 'alerts',
};

export function declareAuthority(domain, source) {
  _authorities.set(domain, { source, declaredAt: Date.now() });
  if (window.__v2_authorities) window.__v2_authorities = { ...window.__v2_authorities, [domain]: source };
}

export function getAuthority(domain) {
  return _authorities.get(domain) || null;
}

export function checkDivergence(domain, expectedSource) {
  const current = _authorities.get(domain);
  if (!current) return { ok: false, reason: `no authority declared for ${domain}` };
  if (current.source !== expectedSource) return { ok: false, reason: `divergence: expected ${expectedSource}, got ${current.source}`, current };
  return { ok: true };
}

export function getSnapshot() {
  const out = {};
  for (const [domain, info] of _authorities) out[domain] = info;
  return out;
}
