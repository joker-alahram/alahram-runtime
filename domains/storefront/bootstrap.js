import { getSession, subscribe } from '../../auth/sessionService.js';
import { getDomainContainer } from '../../registry.js';
import { parseStorefrontRoute } from './router.js';
import { renderLoginPage, bindLoginForm } from '../../auth/loginPage.js';
import { renderRegisterPage } from './pages/register.js';
import { registerPage, getPage } from './pages/registry.js';
import { renderSearchPage } from './pages/search.js';
import { renderProductList } from './pages/products/list.js';
import { renderProductDetail } from './pages/products/detail.js';
import { renderInvoicesList } from './pages/invoices/list.js';
import { renderInvoiceDetail } from './pages/invoices/detail.js';
import { renderCartPage } from './pages/cart.js';
import { renderCheckoutPage } from './pages/checkout.js';
import { renderCompaniesPage } from './pages/companies.js';
import { renderCompanyPage } from './pages/company.js';
import { renderOrdersPage } from './pages/orders.js';
import { renderOffersPage } from './pages/offers.js';
import { renderDailyDealPage } from './pages/dailyDeal.js';
import { renderFlashOfferPage } from './pages/flashOffer.js';
import { renderTiersPage } from './pages/tiers.js';
import { renderAccountPage } from './pages/account.js';
import { renderCustomersPage } from './pages/customers.js';
import { renderCustomerDetailPage } from './pages/customerDetail.js';
import { renderVisitsList } from './pages/visits/list.js';
import { renderVisitDetail } from './pages/visits/detail.js';
import { initWorkspace, destroyWorkspace, refreshWorkspace } from './components/activeVisitWorkspace.js';
import { initActionSheet, destroyActionSheet, refreshActionSheet, toggleActionSheet } from './components/runtimeActionSheet.js';
import { initRuntime, setActiveVisit, clearActiveVisit, restoreLastContext } from '../../services/storefront/runtimeContext.js';
import { syncActiveVisit } from '../../services/storefront/visitsApi.js';
import { getCartRaw } from '../../services/storefront/cartApi.js';
import { readConfig } from '../../config.js';
import { hydrateIdentity, clearIdentity, getIdentity } from '../../services/storefront/governanceRuntime.js';
import { renderGlobalSearch, destroyGlobalSearch } from './components/globalSearch.js';
import { renderFloatingBar, destroyFloatingBar } from '../../runtime/components/mobile-floating-bar.js';
import { renderHome } from './pages/home.js';
import { emit, EVENTS } from '../../services/runtime/eventBus.js';
import { declareAuthority, DOMAINS } from '../../services/runtime/storageGovernance.js';

let _booted = false;
let _container = null;
let _hashHandler = null;
let _renderGen = 0;
let _hashTimer = null;

function _scheduleRender() {
  clearTimeout(_hashTimer);
  _hashTimer = setTimeout(() => { _hashTimer = null; render(); }, 0);
}

export async function bootstrapDomain() {
   if (_booted) return;
   _container = getDomainContainer('storefront');
   if (!_container) return;

   registerPage('home', renderHome);
   registerPage('login', renderLoginPage);
   registerPage('register', renderRegisterPage);
   registerPage('search', renderSearchPage);
   registerPage('products', renderProductList);
   registerPage('product', renderProductDetail);
   registerPage('invoices', renderInvoicesList);
   registerPage('invoice', renderInvoiceDetail);
   registerPage('cart', renderCartPage);
   registerPage('checkout', renderCheckoutPage);
   registerPage('companies', renderCompaniesPage);
   registerPage('company', renderCompanyPage);
   registerPage('orders', renderOrdersPage);
   registerPage('order', (container, params) => { location.hash = '#invoices/' + params.orderId; });
   registerPage('offers', renderOffersPage);
   registerPage('dailydeal', renderDailyDealPage);
   registerPage('flashoffer', renderFlashOfferPage);
   registerPage('tiers', renderTiersPage);
   registerPage('account', renderAccountPage);
   registerPage('customers', renderCustomersPage);
   registerPage('customer', renderCustomerDetailPage);
   registerPage('visits', renderVisitsList);
   registerPage('visit', renderVisitDetail);

   _hashHandler = () => _scheduleRender();
   window.addEventListener('hashchange', _hashHandler);

   declareAuthority(DOMAINS.PROFILE, 'bootstrap');

   // Hydrate governance identity after session is ready
   const ses = getSession();
   console.log('[runtime] bootstrapDomain: initial session', { status: ses?.status, actorType: ses?.actor?.type, fullName: ses?.actor?.fullName });
   if (ses?.status === 'authenticated') {
     await hydrateIdentity();
     emit(EVENTS.ACTOR_CHANGED, { actorType: ses.actor?.type, fullName: ses.actor?.fullName, phase: 'initial' });
   }

   // Initialize runtime context (profile, state)
   const profile = initRuntime();
   console.log('[runtime] bootstrapDomain: initRuntime complete', { profileId: profile?.id, profileLabel: profile?.label });

   // Restore active visit from DB (survives page refresh, cross-domain nav)
   const restoredVisit = await syncActiveVisit();
   if (restoredVisit) setActiveVisit(restoredVisit);
   restoreLastContext();

   console.log('[runtime] bootstrapDomain: about to render');
   render();
   _booted = true;

   console.log('[runtime] bootstrapDomain: initializing workspace and action sheet');
   initWorkspace();
   initActionSheet();

   // Re-hydrate runtime whenever auth state changes
   // Registered after boot — if boot fails, subscriber never registers (no leak)
   // Generation-gated: after every await, verify session is still current
   // (prevents identity leakage from rapid login/logout races)
   let _subGen = 0;
   const _unsub = subscribe(async (ses) => {
     try {
       const gen = ++_subGen;
       console.log('[runtime] subscriber fired', { status: ses?.status, hasActor: !!ses?.actor, fullName: ses?.actor?.fullName, gen });
       if (ses?.status === 'authenticated') {
         await hydrateIdentity();
         if (_subGen !== gen) { console.log('[runtime] subscriber: superseded (auth)'); return; }
         const profile = initRuntime();
         console.log('[runtime] subscriber: runtime updated', { profileId: profile?.id, profileLabel: profile?.label });
         refreshActionSheet();
       } else {
         clearIdentity();
         clearActiveVisit();
         if (_subGen !== gen) { console.log('[runtime] subscriber: superseded (anon)'); return; }
         const profile = initRuntime();
         console.log('[runtime] subscriber: cleared, runtime reset', { profileId: profile?.id });
         refreshActionSheet();
       }
     } catch (e) {
       console.error('[runtime] subscriber error:', e);
     }
   });

    // Re-sync active visit on visibility change (mobile suspend/resume, background tab)
    let _lastVisSync = 0;
    const _visHandler = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && getSession()?.status === 'authenticated' && now - _lastVisSync > 30000) {
        _lastVisSync = now;
        syncActiveVisit().then(restored => { refreshWorkspace(); });
      }
    };
    document.addEventListener('visibilitychange', _visHandler);

   // Keyboard-aware: toggle body class when input focused (hides bottom nav)
   const _keyboardHandler = (e) => {
     if (e.type === 'focusin' && e.target?.tagName === 'INPUT') {
       document.body.classList.add('v2-keyboard-open');
     } else if (e.type === 'focusout') {
       document.body.classList.remove('v2-keyboard-open');
     }
   };
   document.addEventListener('focusin', _keyboardHandler);
   document.addEventListener('focusout', _keyboardHandler);

   return () => {
     if (_hashHandler) window.removeEventListener('hashchange', _hashHandler);
     document.removeEventListener('visibilitychange', _visHandler);
     document.removeEventListener('focusin', _keyboardHandler);
     document.removeEventListener('focusout', _keyboardHandler);
     clearTimeout(_hashTimer); _hashTimer = null;
     destroyWorkspace();
     destroyActionSheet();
     if (_unsub) _unsub();
     _booted = false; _container = null;
   };
 }

function render() {
   console.log('[runtime] render called', { hash: location.hash, _container: !!_container });
   if (!_container) {
     console.error('[runtime] render: no container');
     return;
   }
   _renderGen++;
   const route = parseStorefrontRoute(location.hash);
   const page = getPage(route.name);
   const ses = getSession();
   const raw = getCartRaw();
   const count = raw.reduce((s, i) => s + i.qty, 0);
   const hideNav = route.name === 'login' || route.name === 'register' || route.name === 'checkout';

   const bottomLinks = [
     { hash: '#home', icon: '🏠', label: 'الرئيسية' },
     { hash: '#companies', icon: '🏢', label: 'الشركات' },
     { hash: '#cart', icon: '🛒', label: 'السلة', badge: count },
   ];
   if (ses?.status === 'authenticated') {
     bottomLinks.push({ trigger: 'actionSheet', icon: '👤', label: 'حسابي' });
   } else {
     bottomLinks.push({ trigger: 'actionSheet', icon: '🔑', label: 'دخول' });
   }

   _container.innerHTML = hideNav
     ? '<div class="v2-sf-shell"><main class="v2-sf-main" id="v2-sf-main"></main></div>'
     : `<div class="v2-sf-shell">
           <main class="v2-sf-main" id="v2-sf-main"></main>
           <div id="v2-gs-container"></div>
           <nav class="v2-bottom-nav" id="v2-bottom-nav">${bottomLinks.map(l => {
            if (l.trigger === 'actionSheet') {
              return `<button class="v2-bottom-nav-item v2-ras-trigger" type="button"><span class="v2-bottom-nav-icon">${l.icon}</span><span class="v2-bottom-nav-label">${l.label}</span></button>`;
            }
            const active = (l.hash === '#home' && route.name === 'home') || location.hash.startsWith(l.hash);
            const badgeHtml = l.badge ? `<span class="v2-bottom-nav-badge" data-count="${l.badge > 99 ? '99+' : l.badge}"></span>` : '';
            return `<a href="${l.hash}" class="v2-bottom-nav-item${active ? ' v2-bottom-nav-item-active' : ''}"><span class="v2-bottom-nav-icon">${l.icon}${badgeHtml}</span><span class="v2-bottom-nav-label">${l.label}</span></a>`;
           }).join('')}</nav>
         </div>`;

   const contentEl = _container.querySelector('#v2-sf-main');
   if (page) {
     const gen = _renderGen;
     console.log('[runtime] render: calling page function', { route: route.name, gen });
     const result = page(contentEl, route.params);
     if (result && typeof result.then === 'function') {
       result.then(() => { 
         if (_renderGen !== gen && contentEl.isConnected) {
           console.log('[runtime] render: clearing content due to generation mismatch', { gen, currentGen: _renderGen });
           contentEl.innerHTML = ''; 
         }
       })
             .catch(e => {
               console.error('Page render promise rejected:', e);
               contentEl.innerHTML = `<div style="padding:2rem;text-align:center;color:red;">خطأ في rendering الصفحة: ${e.message}</div>`;
             });
     }
   } else {
     console.warn('[runtime] render: no page function for route', { route: route.name });
     contentEl.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--v2-text2)">جاري التحميل...</div>';
   }
   if (route.name === 'login') bindLoginForm(contentEl);

   // Global search bar
   destroyGlobalSearch();
   if (!hideNav) {
     const gsContainer = document.getElementById('v2-gs-container');
     if (gsContainer) renderGlobalSearch(gsContainer);
   }

   // Floating order summary bar
   destroyFloatingBar();
   if (!hideNav && route.name !== 'cart' && route.name !== 'invoice' && route.name !== 'checkout') {
     const shell = _container.querySelector('.v2-sf-shell');
     if (shell) renderFloatingBar(shell);
   }

   // Bind action sheet trigger in bottom nav
   const triggers = _container.querySelectorAll('.v2-ras-trigger');
   triggers.forEach(el => el.addEventListener('click', toggleActionSheet));
 }


