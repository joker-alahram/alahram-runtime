import { readConfig } from '../../../config.js';
import { buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { customerListSelect } from '../../../services/contracts/customers.contract.js';

export async function renderFieldCustomers(container) {
  container.innerHTML = '<div class="v2-fv"><div class="v2-fv-loading">جاري التحميل...</div></div>';

  let customers;
  try {
    const API = readConfig().baseUrl;
    const headers = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
    const scopeFilter = buildOrderScopeFilter();
    const r = await fetch(`${API}/runtime_customer_visibility?select=${customerListSelect()}&order=customer_name.asc${scopeFilter ? '&' + scopeFilter : ''}`, { headers });
    customers = await r.json();
  } catch {
    container.innerHTML = '<div class="v2-fv"><div class="v2-fv-error"><p>فشل تحميل العملاء</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderFieldCustomers(container));
    return;
  }

  container.innerHTML = `<div class="v2-fv">
    <input type="text" class="v2-fv-inp v2-cust-search" id="v2-cust-search" placeholder="بحث عن عميل..." autocomplete="off">
    <div class="v2-cust-list" id="v2-cust-list">${customers.map(c => _card(c)).join('')}</div>
    ${customers.length === 0 ? '<div class="v2-fv-empty">لا يوجد عملاء</div>' : ''}
  </div>`;

  const search = container.querySelector('#v2-cust-search');
  const list = container.querySelector('#v2-cust-list');
  if (search && list) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      list.innerHTML = customers.filter(c => {
        const name = (c.customer_name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const address = (c.address || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || address.includes(q);
      }).map(c => _card(c)).join('');
      if (!list.innerHTML) list.innerHTML = '<div class="v2-fv-empty">لا توجد نتائج</div>';
    });
  }
}

function _card(c) {
  return `<a href="#field/customers/${c.id}" class="v2-cust-item">
    <div class="v2-cust-name">${_e(c.customer_name)}</div>
    <div class="v2-cust-info">
      ${c.phone ? `<span>${_e(c.phone)}</span>` : ''}
      ${c.address ? `<span>${_e(c.address)}</span>` : ''}
    </div>
  </a>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
