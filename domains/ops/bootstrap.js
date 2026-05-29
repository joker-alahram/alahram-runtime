// /new — Standalone Production Runtime
// domains/ops/bootstrap.js — Ops shell. Execution-first.

import { createStore } from '../../state/store.js';
import { getSession } from '../../auth/sessionService.js';
import { getDomainContainer } from '../../registry.js';
import { parseOpsRoute } from './router.js';
import { registerPage, getPage } from './pages/registry.js';
import { getIdentity, hydrateIdentity } from '../../services/storefront/governanceRuntime.js';
import { checkRouteAccess } from '../../auth/authGuard.js';
import { renderOrdersList } from './pages/orders/list.js';
import { renderOrderDetail } from './pages/orders/detail.js';
import { renderInventoryList } from './pages/inventory/list.js';
import { renderInventoryDetail } from './pages/inventory/detail.js';
import { renderOpsDashboard } from './pages/dashboard.js';
import { renderOpsCustomers } from './pages/customers.js';
import { renderOpsCustomer } from './pages/customer.js';
import { renderOpsPricing } from './pages/pricing.js';
import { renderOpsPricingProduct } from './pages/pricingProduct.js';
import { renderOpsEmployees } from './pages/employees.js';
import { renderOpsEmployee } from './pages/employee.js';
import { renderOpsProductsList } from './pages/products/list.js';
import { renderOpsProductDetail } from './pages/products/detail.js';
import { renderOpsReps } from './pages/reps.js';
import { renderOpsRepProfile } from './pages/repProfile.js';
import { renderOpsWorkflow } from './pages/workflow.js';
import { renderOpsEvents } from './pages/events.js';
import { renderOpsAudit } from './pages/audit.js';
import { renderOpsReports } from './pages/reports.js';
import { renderOpsWarehouses } from './pages/warehouses.js';
import { renderOpsCampaigns } from './pages/campaigns.js';
import { renderOpsTreasury } from './pages/treasury.js';

let _booted = false, _store = null, _hh = null, _c = null;
let _renderGen = 0;
let _hashTimer = null;

const NAV_ITEMS = [
  { k: 'dashboard', l: 'الرئيسية' },
  { k: 'orders', l: 'الطلبات' },
  { k: 'customers', l: 'العملاء' },
  { k: 'inventory', l: 'المخزون' },
  { k: 'pricing', l: 'التسعير' },
  { k: 'products', l: 'المنتجات' },
  { k: 'employees', l: 'الموظفين' },
  { k: 'reps', l: 'المناديب' },
  { k: 'workflow', l: 'سير العمل' },
  { k: 'warehouses', l: 'المستودعات' },
  { k: 'events', l: 'الأحداث' },
  { k: 'audit', l: 'سجل المراجعة' },
  { k: 'reports', l: 'التقارير' },
  { k: 'campaigns', l: 'الحملات' },
  { k: 'treasury', l: 'الخزينة' },
];

const ROUTE_NAV = {
  'ops/dashboard': 'dashboard',
  'ops/orders': 'orders', 'ops/order': 'orders',
  'ops/customers': 'customers', 'ops/customer': 'customers',
  'ops/inventory': 'inventory', 'ops/inventory-product': 'inventory',
  'ops/pricing': 'pricing', 'ops/pricing-product': 'pricing',
  'ops/employees': 'employees', 'ops/employee': 'employees',
  'ops/products': 'products', 'ops/product': 'products',
  'ops/reps': 'reps', 'ops/rep': 'reps',
  'ops/workflow': 'workflow',
  'ops/warehouses': 'warehouses',
  'ops/events': 'events', 'ops/audit': 'audit',
  'ops/reports': 'reports',
  'ops/campaigns': 'campaigns',
  'ops/treasury': 'treasury',
};

const ADMIN_KEYS = new Set(['inventory', 'pricing', 'products', 'employees', 'workflow', 'warehouses', 'events', 'audit', 'reports', 'campaigns', 'treasury']);

function _filteredNavItems() {
  const identity = getIdentity();
  const session = getSession();
  const isAdmin = identity?.isAdmin
    || identity?.capabilities?.can_manage_system
    || identity?.capabilities?.can_view_all_reports
    || String(session?.role?.roleCode || '').toUpperCase() === 'SUPER_ADMIN';
  if (isAdmin) return NAV_ITEMS;
  return NAV_ITEMS.filter(i => !ADMIN_KEYS.has(i.k));
}

const INIT = () => ({
  route: { name: 'ops/dashboard', params: {} },
  nav: { active: 'dashboard', items: _filteredNavItems().map(i => ({ ...i, r: `ops/${i.k}` })) },
  ui: { sidebar: innerWidth > 768, loading: false },
});

function _routeNavKey(route) {
  return ROUTE_NAV[route.name] || route.name.replace('ops/', '').split('/')[0] || 'dashboard';
}

export async function bootstrapDomain() {
  if (_booted) return;
  _c = getDomainContainer('ops');
  if (!_c) return;

  // Ensure governance identity is hydrated (for nav scoping)
  if (!getIdentity()) {
    const ses = getSession();
    if (ses?.status === 'authenticated') await hydrateIdentity();
  }

  _store = createStore(INIT());

  registerPage('ops/dashboard', renderOpsDashboard);
  registerPage('ops/orders', renderOrdersList);
  registerPage('ops/order', renderOrderDetail);
  registerPage('ops/customers', renderOpsCustomers);
  registerPage('ops/customer', renderOpsCustomer);
  registerPage('ops/inventory', renderInventoryList);
  registerPage('ops/inventory-product', renderInventoryDetail);
  registerPage('ops/pricing', renderOpsPricing);
  registerPage('ops/pricing-product', renderOpsPricingProduct);
  registerPage('ops/employees', renderOpsEmployees);
  registerPage('ops/employee', renderOpsEmployee);
  registerPage('ops/products', renderOpsProductsList);
  registerPage('ops/product', renderOpsProductDetail);
  registerPage('ops/reps', renderOpsReps);
  registerPage('ops/rep', renderOpsRepProfile);
  registerPage('ops/workflow', renderOpsWorkflow);
  registerPage('ops/events', renderOpsEvents);
  registerPage('ops/audit', renderOpsAudit);
  registerPage('ops/reports', renderOpsReports);
  registerPage('ops/warehouses', renderOpsWarehouses);
  registerPage('ops/campaigns', renderOpsCampaigns);
  registerPage('ops/treasury', renderOpsTreasury);

  _hh = () => {
    clearTimeout(_hashTimer);
    _hashTimer = setTimeout(async () => {
      _hashTimer = null;
      const route = parseOpsRoute(location.hash);
      _store.patch({ route, nav: { ..._store.getState().nav, active: _routeNavKey(route) } });
      const { allowed, reason } = await checkRouteAccess(route.name);
      if (!allowed && reason !== 'auth_required') {
        const contentEl = _c?.querySelector('#v2-ops-content');
        if (contentEl) {
          contentEl.innerHTML = `<div style="text-align:center;padding:3rem">
            <div style="font-size:3rem;margin-bottom:0.5rem">🚫</div>
            <h2 style="font-size:1.5rem;color:#dc2626;margin-bottom:0.5rem">ليس لديك صلاحية الوصول</h2>
            <p style="color:#6b7280;font-size:1rem">لا تملك الصلاحية المطلوبة للوصول إلى هذه الصفحة</p>
          </div>`;
          return;
        }
      }
      render();
    }, 0);
  };
  window.addEventListener('hashchange', _hh);
  _hh();
  _booted = true;
  return () => {
    if (_hh) window.removeEventListener('hashchange', _hh);
    clearTimeout(_hashTimer); _hashTimer = null;
    _booted = false; _store = null; _c = null;
  };
}

function render() {
  if (!_c || !_store) return;
  _renderGen++;
  const s = _store.getState(), ses = getSession(), r = s.route;
  const a = ses.actor || {}, role = ses.role || {};
  _c.innerHTML = `<div class="v2-ops">
    <aside class="v2-ops-sb">
      <div class="v2-ops-sbh"><span>التشغيل</span></div>
      <div class="v2-ops-user"><span>${e(a.fullName)}</span><span class="v2-ops-role">${e(role.roleName)}</span></div>
      <nav>${s.nav.items.map(i => `<button class="v2-ops-ni ${i.k === s.nav.active ? 'v2-ops-na' : ''}" data-m="${i.k}">${i.l}</button>`).join('')}</nav>
    </aside>
    <main class="v2-ops-mn">
      <header class="v2-ops-tb"><span>${T[r.name] || 'التشغيل'}</span></header>
      <div class="v2-ops-ct" id="v2-ops-content"></div>
    </main>
  </div>`;
  const sb = _c.querySelector('.v2-ops-sb');
  if (sb) sb.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-m]');
    if (btn) location.hash = `#ops/${btn.dataset.m}`;
  });

  const contentEl = _c.querySelector('#v2-ops-content');
  if (contentEl) {
    const page = getPage(r.name);
    if (page) {
      const gen = _renderGen;
      const result = page(contentEl, r.params);
      if (result && typeof result.then === 'function') {
        result.then(() => { if (_renderGen !== gen && contentEl.isConnected) contentEl.innerHTML = ''; }).catch(() => {});
      }
    }
  }
}

const T = { 'ops/dashboard': 'الرئيسية', 'ops/orders': 'الطلبات', 'ops/order': 'تفاصيل الطلب', 'ops/customers': 'العملاء', 'ops/customer': 'تفاصيل العميل', 'ops/inventory': 'المخزون', 'ops/inventory-product': 'تفاصيل المنتج', 'ops/pricing': 'التسعير', 'ops/pricing-product': 'تسعير المنتج', 'ops/products': 'المنتجات', 'ops/product': 'إدارة المنتج', 'ops/employees': 'الموظفين', 'ops/employee': 'تفاصيل الموظف', 'ops/workflow': 'سير العمل', 'ops/warehouses': 'المستودعات', 'ops/events': 'الأحداث', 'ops/audit': 'سجل المراجعة', 'ops/reports': 'التقارير', 'ops/campaigns': 'الحملات', 'ops/treasury': 'الخزينة' };

function e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
