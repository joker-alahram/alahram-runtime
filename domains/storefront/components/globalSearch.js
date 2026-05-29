import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { getIdentity, buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';

const API = readConfig().baseUrl;
let _el = null;
let _timeout = null;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

export function renderGlobalSearch(container) {
  const existing = document.getElementById('v2-gs');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'v2-gs';
  el.className = 'v2-gs';
  el.innerHTML = `<div class="v2-gs-inner">
    <input type="text" class="v2-gs-input" id="v2-gs-input" placeholder="🔍 بحث في العملاء، الفواتير، المنتجات، المناديب..." autocomplete="off">
    <div class="v2-gs-results" id="v2-gs-results" style="display:none"></div>
  </div>`;
  container.appendChild(el);
  _el = el;
  _bind(el);
}

export function destroyGlobalSearch() {
  if (_el) { _el.remove(); _el = null; }
}

function _bind(el) {
  const input = el.querySelector('#v2-gs-input');
  const results = el.querySelector('#v2-gs-results');

  input.addEventListener('input', () => {
    clearTimeout(_timeout);
    const q = input.value.trim();
    if (q.length < 2) { results.style.display = 'none'; return; }
    _timeout = setTimeout(() => _search(q, results), 300);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) results.style.display = '';
  });

  document.addEventListener('click', (e) => {
    if (!el.contains(e.target)) results.style.display = 'none';
  });
}

async function _search(q, results) {
  const identity = getIdentity();
  const token = q.toLowerCase();
  results.innerHTML = '<div class="v2-gs-loading">جاري البحث...</div>';
  results.style.display = '';

  const queries = [];

  // Search customers
  queries.push(
    fetch(`${API}/runtime_customer_visibility?or=(customer_name.ilike.*${token}*,phone.ilike.*${token}*)&select=id,customer_name,phone&limit=5`, { headers: _h() })
      .then(r => r.ok ? r.json() : [])
      .then(arr => arr.map(c => ({ type: 'customer', label: c.customer_name, sub: c.phone || '', href: `#customer/${c.id}` })))
  );

  // Search invoices
  if (identity?.employeeId) {
    const scopeFilter = buildOrderScopeFilter();
    queries.push(
      fetch(`${API}/runtime_order_visibility?or=(order_number.ilike.*${token}*)${scopeFilter ? '&' + scopeFilter : ''}&select=id,order_number,total_amount,created_at&limit=5`, { headers: _h() })
        .then(r => r.ok ? r.json() : [])
        .then(arr => arr.map(o => ({ type: 'invoice', label: `فاتورة ${o.order_number || '—'}`, sub: _money(o.total_amount), href: `#invoices/${o.id}` })))
    );
  }

  // Search products
  queries.push(
    fetch(`${API}/products?or=(product_name.ilike.*${token}*,product_code.ilike.*${token}*)&select=id,product_name,product_code&is_active=eq.true&limit=5`, { headers: _h() })
      .then(r => r.ok ? r.json() : [])
      .then(arr => arr.map(p => ({ type: 'product', label: p.product_name, sub: p.product_code || '', href: `#products/${p.id}` })))
  );

  // Search employees (reps)
  if (identity?.actorType === 'employee') {
    queries.push(
      fetch(`${API}/employees?or=(full_name.ilike.*${token}*,phone.ilike.*${token}*)&select=id,full_name,phone,region_name&is_active=eq.true&limit=5`, { headers: _h() })
        .then(r => r.ok ? r.json() : [])
        .then(arr => arr.map(e => ({ type: 'rep', label: e.full_name, sub: e.region_name || e.phone || '', href: `#reps/${e.id}` })))
    );
  }

  try {
    const allResults = (await Promise.all(queries)).flat();
    if (!allResults.length) {
      results.innerHTML = '<div class="v2-gs-empty">لا توجد نتائج</div>';
      return;
    }
    results.innerHTML = allResults.map(r => {
      const icons = { customer: '👤', invoice: '📄', product: '📦', rep: '👥' };
      return `<a href="${r.href}" class="v2-gs-item" onclick="document.getElementById('v2-gs-input').value='';document.getElementById('v2-gs-results').style.display='none'">
        <span class="v2-gs-item-icon">${icons[r.type] || '●'}</span>
        <div class="v2-gs-item-body">
          <div class="v2-gs-item-label">${_e(r.label)}</div>
          ${r.sub ? `<div class="v2-gs-item-sub">${_e(r.sub)}</div>` : ''}
        </div>
      </a>`;
    }).join('');
  } catch {
    results.innerHTML = '<div class="v2-gs-empty">فشل البحث</div>';
  }
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
