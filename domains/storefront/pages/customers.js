import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { setSelectedCustomer, setCustomerJustSelected } from '../../../services/storefront/cartApi.js';
import { showVisitStart } from '../components/activeVisitWorkspace.js';
import { scopeCustomerIds } from '../../../services/storefront/governanceRuntime.js';
import { customerListSelect } from '../../../services/contracts/customers.contract.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

export async function renderCustomersPage(container) {
  const hash = (location.hash || '').replace(/^#/, '');
  const isSelectMode = hash.includes('?select=');

  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل العملاء...</div></div>';
  try {
    const customers = await _fetch();
    if (!customers.length) {
      container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>لا يوجد عملاء</p></div></div>';
      return;
    }
    const bannerHtml = isSelectMode
      ? '<div class="v2-cust-select-banner">👤 اختر عميلك أولاً</div>'
      : '';
    container.innerHTML = `<div class="v2-page">${bannerHtml}<h1 class="v2-page-title">العملاء</h1><div class="v2-cust-grid" id="v2-cust-grid"></div></div>`;
    const grid = container.querySelector('#v2-cust-grid');
    grid.innerHTML = customers.map(c => _card(c)).join('');
    _initClicks(grid, isSelectMode);
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>فشل تحميل العملاء</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderCustomersPage(container));
  }
}

async function _fetch() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  const ids = await scopeCustomerIds();

  // null = "all customers" (admin), [] = no customers visible
  if (ids !== null && !ids.length) return [];

  const actorId = s?.actor?.type === 'employee' ? s.actor.id : null;
  const params = new URLSearchParams({
    select: customerListSelect(),
    order: 'customer_name.asc',
  });
  if (ids !== null) {
    if (ids.length === 1) {
      params.append('id', `eq.${ids[0]}`);
    } else {
      params.append('id', `in.(${ids.join(',')})`);
    }
  }

  const [customers, assignments] = await Promise.all([
    fetch(API + `/runtime_customer_visibility?${params}`, { headers: h }),
    ids !== null
      ? fetch(API + `/customer_assignments?customer_id=in.(${ids.join(',')})&select=customer_id,employee:employee_id(full_name)`, { headers: h })
      : fetch(API + `/customer_assignments?select=customer_id,employee:employee_id(full_name)`, { headers: h }),
  ]);
  if (!customers.ok) throw new Error('فشل تحميل العملاء');
  const custs = (await customers.json()).filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  const assignArr = assignments.ok ? await assignments.json() : [];

  // Build a map of customer_id → employee name (take first assignment only)
  const repMap = {};
  for (const a of assignArr) {
    const e = Array.isArray(a.employee) ? a.employee[0] : a.employee;
    if (!repMap[a.customer_id] && e?.full_name) repMap[a.customer_id] = e.full_name;
  }

  return custs.map(c => ({ ...c, _repName: repMap[c.id] || '' }));
}

function _card(c) {
  const active = c.is_active !== false;
  return `<div class="v2-cust-card" data-cid="${c.id}" data-cname="${_e(c.customer_name)}" data-cphone="${_e(c.phone || '')}">
    <div class="v2-cust-card-top" data-link="#customer/${c.id}">
      <div class="v2-cust-name">${_e(c.customer_name)}</div>
      ${c.phone ? `<div class="v2-cust-phone">📞 ${_e(c.phone)}</div>` : ''}
      ${c.address ? `<div class="v2-cust-addr">📍 ${_e(c.address)}</div>` : ''}
      <div class="v2-cust-meta">
        <span class="v2-cust-badge ${active ? 'v2-cust-badge-active' : 'v2-cust-badge-inactive'}">${active ? 'نشط' : 'غير نشط'}</span>
        ${c._repName ? `<span class="v2-cust-badge v2-cust-badge-rep">🧑‍💼 ${_e(c._repName)}</span>` : ''}
      </div>
    </div>
    <div class="v2-cust-actions">
      <button class="v2-cust-btn v2-cust-btn-visit" data-action="visit">📋 فتح زيارة</button>
      <button class="v2-cust-btn v2-cust-btn-invoice" data-action="invoice">📄 إنشاء فاتورة</button>
    </div>
  </div>`;
}

function _initClicks(parent, selectMode) {
  // Card top area → navigate to detail (or select in select mode)
  parent.querySelectorAll('[data-link]').forEach(el => {
    el.addEventListener('click', () => { location.hash = el.dataset.link; });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = el.dataset.link; });
  });

  // Action buttons
  parent.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = el.closest('[data-cid]');
      if (!card) return;
      const cid = card.dataset.cid;
      const cname = card.dataset.cname;
      const cphone = card.dataset.cphone;
      const action = el.dataset.action;

      if (action === 'visit') {
        const card = el.closest('[data-cid]');
        const addr = card?.querySelector('.v2-cust-addr')?.textContent?.replace(/^📍 /, '') || '';
        showVisitStart(cid, cname, cphone, addr);
      } else if (action === 'invoice') {
        setSelectedCustomer({ id: cid, name: cname });
        setCustomerJustSelected(cname);
        location.hash = '#products';
      }
    });
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
