import { readConfig } from '../../config.js';

const API = readConfig().baseUrl;

function _headers() {
  return {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'count=exact',
  };
}

let _gen = 0;

export function searchGen() { return _gen; }

export function nextGen() { return ++_gen; }

export async function globalSearch(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const r = await fetch(`${API}/rpc/global_search`, {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify({ p_query: query.trim() }),
    });
    if (r.ok) return r.json();
  } catch { /* RPC not available, fallback */ }

  // Fallback: search in search_index_runtime
  try {
    const r = await fetch(`${API}/search_index_runtime?is_active=eq.true&or=(title.ilike.*${encodeURIComponent(query.trim())}*,subtitle.ilike.*${encodeURIComponent(query.trim())}*)&limit=20`, { headers: _headers() });
    if (r.ok) return r.json();
  } catch { /* ignore */ }
  return [];
}

export async function searchByType(query, entityType, { limit = 20, offset = 0 } = {}) {
  if (!query || query.trim().length < 2) return { data: [], count: 0 };
  const q = query.trim().toLowerCase();
  const params = new URLSearchParams({
    entity_type: `eq.${entityType}`,
    is_active: 'eq.true',
    or: `(normalized_text.ilike.%${encodeURIComponent(q)}%,title.ilike.%${encodeURIComponent(q)}%,subtitle.ilike.%${encodeURIComponent(q)}%)`,
    order: 'title.asc',
    limit: String(limit),
    offset: String(offset),
  });
  const r = await fetch(`${API}/search_index_runtime?${params}`, { headers: _headers() });
  if (!r.ok) return { data: [], count: 0 };
  const count = parseInt(r.headers.get('content-range')?.split('/')[1] || '0', 10);
  return { data: await r.json(), count };
}

export async function searchCompanies(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();
  try {
    const r = await fetch(`${API}/companies?select=id,company_name,company_code,company_logo_url&is_active=eq.true&or=(company_name.ilike.*${encodeURIComponent(q)}*,company_code.ilike.*${encodeURIComponent(q)}*)&limit=10`, { headers: _headers() });
    if (r.ok) return r.json();
  } catch { /* ignore */ }
  return [];
}

export async function unifiedSearch(query) {
  const [global, companies] = await Promise.all([
    globalSearch(query),
    searchCompanies(query),
  ]);
  return {
    companies,
    products: global.filter(r => r.entity_type === 'product'),
    customers: global.filter(r => r.entity_type === 'customer'),
    employees: global.filter(r => r.entity_type === 'employee'),
  };
}
