import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import { buildVisitScopeFilter } from '../../services/storefront/governanceRuntime.js';
import { getDomainContainer } from '../../registry.js';
import { parseFieldRoute } from './router.js';
import { registerPage, getPage } from './pages/registry.js';
import { renderFieldVisitsList } from './pages/visits/list.js';
import { renderFieldVisitDetail } from './pages/visits/detail.js';
import { renderFieldDashboard } from './pages/dashboard.js';
import { renderFieldCustomers } from './pages/customers.js';
import { renderFieldCustomer } from './pages/customer.js';
import { renderFieldOrders } from './pages/orders.js';
import { renderFieldOrder } from './pages/order.js';
import { renderFieldCollections } from './pages/collections.js';
import { renderFieldCollection } from './pages/collection.js';
import { renderFieldTasks } from './pages/tasks.js';
import { renderFieldTask } from './pages/task.js';
import { renderFieldLocation } from './pages/location.js';

let _booted = false, _hh = null, _c = null, _activeVisit = null;
let _renderGen = 0;
let _hashTimer = null;
let _intervalId = null;

const NAV = [
  { l: 'اليوم', r: 'field/dashboard' }, { l: 'الزيارات', r: 'field/visits' },
  { l: 'العملاء', r: 'field/customers' }, { l: 'الطلبات', r: 'field/orders' },
  { l: 'التحصيل', r: 'field/collections' }, { l: 'المهام', r: 'field/tasks' },
];

const HEADER_TITLES = {
  'field/dashboard': 'اليوم', 'field/visits': 'الزيارات', 'field/visit': 'تفاصيل الزيارة',
  'field/customers': 'العملاء', 'field/orders': 'الطلبات', 'field/collections': 'التحصيل',
  'field/tasks': 'المهام', 'field/location': 'الموقع',
};

export async function bootstrapDomain() {
  if (_booted) return;
  _c = getDomainContainer('field');
  if (!_c) return;

  registerPage('field/dashboard', renderFieldDashboard);
  registerPage('field/visits', renderFieldVisitsList);
  registerPage('field/visit', renderFieldVisitDetail);
  registerPage('field/customers', renderFieldCustomers);
  registerPage('field/customer', renderFieldCustomer);
  registerPage('field/orders', renderFieldOrders);
  registerPage('field/order', renderFieldOrder);
  registerPage('field/collections', renderFieldCollections);
  registerPage('field/collection', renderFieldCollection);
  registerPage('field/tasks', renderFieldTasks);
  registerPage('field/task', renderFieldTask);
  registerPage('field/location', renderFieldLocation);

  _intervalId = setInterval(_fetchActiveVisit, 30000);
  // Pause polling when page is hidden, resume when visible
  const _visHandler = () => {
    if (document.hidden && _intervalId !== null) {
      clearInterval(_intervalId); _intervalId = null;
    } else if (!document.hidden && _intervalId === null) {
      _fetchActiveVisit();
      _intervalId = setInterval(_fetchActiveVisit, 30000);
    }
  };
  document.addEventListener('visibilitychange', _visHandler);
  _hh = () => {
    clearTimeout(_hashTimer);
    _hashTimer = setTimeout(() => { _hashTimer = null; render(); }, 0);
  };
  window.addEventListener('hashchange', _hh);
  render(); _booted = true;
  return () => {
    if (_hh) window.removeEventListener('hashchange', _hh);
    document.removeEventListener('visibilitychange', _visHandler);
    clearTimeout(_hashTimer); _hashTimer = null;
    if (_intervalId !== null) { clearInterval(_intervalId); _intervalId = null; }
    _booted = false; _c = null;
  };
}

async function _fetchActiveVisit() {
  try {
    const s = getSession();
    if (!s.actor?.id) return;
    const today = new Date().toISOString().split('T')[0];
    const API = readConfig().baseUrl;
    const headers = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

    const visitScope = buildVisitScopeFilter();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const r = await fetch(`${API}/visits?select=id,customer_name,check_in_time&check_in_time=gte.${today}&check_in_time=lt.${tomorrow}&visit_status=eq.open&limit=1${visitScope ? '&' + visitScope : ''}`, { headers });
    const arr = await r.json();
    _activeVisit = arr.length > 0 ? arr[0] : null;
    _updateActiveBar();
  } catch { _activeVisit = null; _updateActiveBar(); }
}

function _updateActiveBar() {
  const existing = _c?.querySelector('.v2-field-active-bar');
  if (!_activeVisit || !_c) {
    if (existing) existing.remove();
    return;
  }
  if (existing) {
    existing.querySelector('.v2-field-active-name').textContent = _activeVisit.customer_name || 'زيارة نشطة';
    return;
  }
  const bar = document.createElement('div');
  bar.className = 'v2-field-active-bar';
  bar.innerHTML = `<div class="v2-field-active-left"><span class="v2-fh-dot v2-fh-dot-live"></span><span class="v2-field-active-name">${_e(_activeVisit.customer_name || 'زيارة نشطة')}</span></div>
    <div class="v2-field-active-right">
      <span class="v2-field-gps v2-field-gps-ok" id="v2-field-gps">📍 نشط</span>
      <a href="#field/visits/${_activeVisit.id}" style="color:var(--v2-primary);font-weight:600;text-decoration:none">فتح ←</a>
    </div>`;
  _c.insertBefore(bar, _c.firstChild);
}

function render() {
  if (!_c) return;
  _renderGen++;
  const s = getSession(), r = parseFieldRoute(location.hash), a = s.actor || {};
  const navActive = r.name === 'field/visit' ? 'field/visits' : r.name;

  _c.innerHTML = `<div class="v2-field">
    <header class="v2-fh">
      <span>${HEADER_TITLES[r.name] || 'الميدان'}</span>
      <span class="v2-fh-stats">
        <span class="v2-fh-indicator"></span>
        <span>${e(a.fullName)}</span>
      </span>
    </header>
    <nav class="v2-fn">${NAV.map(i => `<a href="#${i.r}" class="v2-fni ${i.r === navActive ? 'v2-fna' : ''}">${i.l}</a>`).join('')}</nav>
    <main class="v2-fc" id="v2-fc-content"></main>
  </div>`;

  const content = _c.querySelector('#v2-fc-content');
  if (content) {
    const page = getPage(r.name);
    if (page) {
      const gen = _renderGen;
      const result = page(content, r.params);
      if (result && typeof result.then === 'function') {
        result.catch(() => {});
      }
    }
  }
}

function e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
