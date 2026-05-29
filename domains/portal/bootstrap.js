import { getDomainContainer } from '../../registry.js';
import { parsePortalRoute } from './router.js';
import { registerPage, getPage } from './pages/registry.js';
import { renderPortalDashboard } from './pages/dashboard.js';
import { renderPortalOrders } from './pages/orders.js';
import { renderPortalOrder } from './pages/order.js';
import { renderPortalInvoices } from './pages/invoices.js';
import { renderPortalInvoice } from './pages/invoice.js';
import { renderPortalVisits } from './pages/visits.js';
import { renderPortalProfile } from './pages/profile.js';

let _booted = false, _hh = null, _c = null;

export async function bootstrapDomain() {
  if (_booted) return;
  _c = getDomainContainer('portal');
  if (!_c) return;

  registerPage('portal/dashboard', renderPortalDashboard);
  registerPage('portal/orders', renderPortalOrders);
  registerPage('portal/order', renderPortalOrder);
  registerPage('portal/invoices', renderPortalInvoices);
  registerPage('portal/invoice', renderPortalInvoice);
  registerPage('portal/visits', renderPortalVisits);
  registerPage('portal/profile', renderPortalProfile);

  _hh = () => render();
  window.addEventListener('hashchange', _hh);
  render();
  _booted = true;
  return () => {
    if (_hh) window.removeEventListener('hashchange', _hh);
    _booted = false; _c = null;
  };
}

function render() {
  if (!_c) return;
  const r = parsePortalRoute(location.hash);
  const page = getPage(r.name);
  _c.innerHTML = '<div class="v2-portal">'
    + '<header class="v2-ph"><span>' + _pageTitle(r.name) + '</span></header>'
    + '<nav class="v2-pn">'
    + '<a href="#portal/dashboard" class="v2-pni ' + (r.name === 'portal/dashboard' ? 'v2-pna' : '') + '">الرئيسية</a>'
    + '<a href="#portal/orders" class="v2-pni ' + (r.name === 'portal/orders' ? 'v2-pna' : '') + '">طلباتي</a>'
    + '<a href="#portal/invoices" class="v2-pni ' + (r.name === 'portal/invoices' ? 'v2-pna' : '') + '">فواتيري</a>'
    + '<a href="#portal/visits" class="v2-pni ' + (r.name === 'portal/visits' ? 'v2-pna' : '') + '">زياراتي</a>'
    + '<a href="#portal/profile" class="v2-pni ' + (r.name === 'portal/profile' ? 'v2-pna' : '') + '">بياناتي</a>'
    + '</nav>'
    + '<main class="v2-pc" id="v2-pc-main"></main>'
    + '</div>';

  const contentEl = _c.querySelector('#v2-pc-main');
  if (page) {
    page(contentEl, r.params);
  } else {
    contentEl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--v2-text2)">جاري التحميل...</div>';
  }
}

function _pageTitle(name) {
  const t = { 'portal/dashboard': 'البوابة', 'portal/orders': 'طلباتي', 'portal/order': 'تفاصيل الطلب',
    'portal/invoices': 'فواتيري', 'portal/invoice': 'تفاصيل الفاتورة', 'portal/visits': 'زياراتي', 'portal/profile': 'بياناتي' };
  return t[name] || 'البوابة';
}
