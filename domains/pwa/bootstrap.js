import { getDomainContainer } from '../../registry.js';
import { parsePwaRoute } from './router.js';
import { registerPage, getPage } from './pages/registry.js';
import { renderPwaInstall } from './pages/install.js';
import { renderPwaSettings } from './pages/settings.js';
import { isStandalone } from '../../pwa/pwaRuntime.js';

let _booted = false, _hh = null, _c = null;

export async function bootstrapDomain() {
  if (_booted) return;
  _c = getDomainContainer('pwa');
  if (!_c) return;

  registerPage('pwa/dashboard', renderPwaDashboard);
  registerPage('pwa/install', renderPwaInstall);
  registerPage('pwa/settings', renderPwaSettings);

  // Listen for SW update notifications from pwaRuntime
  const updateHandler = (e) => _showUpdateBanner(e.detail);
  window.addEventListener('v2:sw-update', updateHandler);

  _hh = () => render();
  window.addEventListener('hashchange', _hh);
  render();
  _booted = true;
  return () => {
    if (_hh) window.removeEventListener('hashchange', _hh);
    window.removeEventListener('v2:sw-update', updateHandler);
    _booted = false; _c = null;
  };
}

function renderPwaDashboard(container) {
  const installed = isStandalone();
  container.innerHTML = '<div class="v2-pwadash">'
    + '<div class="v2-pwadash-welcome">'
    + '<h2>مرحباً بك في التطبيق</h2>'
    + '<p>متجر الأهرام للتجارة والتوزيع</p>'
    + '</div>'
    + '<div class="v2-pwadash-links">'
    + (installed
      ? '<div class="v2-pwadash-installed"><p>✓ التطبيق مثبت على جهازك</p></div>'
      : '<a href="#pwa/install" class="v2-btn v2-btn-p v2-btn-b">تثبيت التطبيق</a>')
    + '<a href="#pwa/settings" class="v2-btn v2-btn-b">إعدادات التطبيق</a>'
    + '<a href="#home" class="v2-btn v2-btn-b">العودة للمتجر</a>'
    + '</div></div>';
}

function render() {
  if (!_c) return;
  const route = parsePwaRoute(location.hash);
  _c.innerHTML = '<div class="v2-pwa">'
    + '<header class="v2-pwa-h"><span>' + _pageTitle(route.name) + '</span></header>'
    + '<nav class="v2-pwa-n">'
    + '<a href="#pwa" class="v2-pwa-ni ' + (route.name === 'pwa/dashboard' ? 'v2-pwa-na' : '') + '">الرئيسية</a>'
    + '<a href="#pwa/install" class="v2-pwa-ni ' + (route.name === 'pwa/install' ? 'v2-pwa-na' : '') + '">تثبيت</a>'
    + '<a href="#pwa/settings" class="v2-pwa-ni ' + (route.name === 'pwa/settings' ? 'v2-pwa-na' : '') + '">إعدادات</a>'
    + '</nav>'
    + '<main class="v2-pwa-c" id="v2-pwa-main"></main>'
    + '</div>';
  const contentEl = _c.querySelector('#v2-pwa-main');
  const page = getPage(route.name);
  if (page) {
    page(contentEl, route.params);
  } else {
    contentEl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--v2-text2)">جاري التحميل...</div>';
  }
}

function _pageTitle(name) {
  const t = { 'pwa/dashboard': 'التطبيق', 'pwa/install': 'تثبيت', 'pwa/settings': 'إعدادات' };
  return t[name] || 'التطبيق';
}

function _showUpdateBanner(detail) {
  const msg = detail?.message || 'نسخة جديدة متاحة';
  const existing = document.querySelector('.v2-pwa-update');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.className = 'v2-pwa-update';
  banner.innerHTML = '<span class="v2-pwa-update-text">' + msg + '</span>'
    + '<button class="v2-pwa-update-btn" id="v2-pwa-update-now">تحديث الآن</button>'
    + '<button class="v2-pwa-update-close" id="v2-pwa-update-later">لاحقاً</button>';
  document.body.appendChild(banner);

  banner.querySelector('#v2-pwa-update-now')?.addEventListener('click', () => {
    window.location.reload();
  });
  banner.querySelector('#v2-pwa-update-later')?.addEventListener('click', () => {
    banner.remove();
  });
}
