import { getSession, logout } from '../../../auth/sessionService.js';
import { getRuntimeState } from '../../../services/storefront/runtimeContext.js';
import { resolveProfile, PROFILES } from '../../../services/storefront/runtimeProfile.js';
import { showVisitStart, showActiveWorkspace } from './activeVisitWorkspace.js';

let _btn = null;
let _sheet = null;

function _profileItems(profileId) {
  const roleSpecific = {
    guest: [
      { id: 'login', label: 'دخول', icon: '🔑', hash: '#login' },
    ],
    customer: [
      { id: 'orders', label: 'طلباتي', icon: '📦', hash: '#orders' },
    ],
    field_rep: [
      { id: 'visits', label: 'زياراتي', icon: '📍', hash: '#field/visits' },
      { id: 'orders', label: 'طلباتي', icon: '📦', hash: '#field/orders' },
      { id: 'dashboard', label: 'لوحة الميدان', icon: '📊', hash: '#field/dashboard' },
    ],
    supervisor: [
      { id: 'teamVisits', label: 'زيارات الفريق', icon: '👥', hash: '#ops/reps' },
      { id: 'reports', label: 'التقارير', icon: '📊', hash: '#ops/reports' },
      { id: 'dashboard', label: 'لوحة التشغيل', icon: '📋', hash: '#ops/dashboard' },
    ],
    manager: [
      { id: 'opsCenter', label: 'مركز التشغيل', icon: '🎛️', hash: '#ops/dashboard' },
      { id: 'monitor', label: 'مراقبة التنفيذ', icon: '👁️', hash: '#ops/reps' },
      { id: 'teams', label: 'الفرق', icon: '👥', hash: '#ops/employees' },
      { id: 'liveReports', label: 'التقارير الحية', icon: '📊', hash: '#ops/reports' },
      { id: 'intervention', label: 'التدخل التشغيلي', icon: '⚡', hash: '#ops/orders' },
    ],
    admin: [
      { id: 'opsCenter', label: 'مركز التشغيل', icon: '🎛️', hash: '#ops/dashboard' },
      { id: 'monitor', label: 'مراقبة التنفيذ', icon: '👁️', hash: '#ops/reps' },
      { id: 'teams', label: 'الفرق', icon: '👥', hash: '#ops/employees' },
      { id: 'liveReports', label: 'التقارير الحية', icon: '📊', hash: '#ops/reports' },
      { id: 'intervention', label: 'التدخل التشغيلي', icon: '⚡', hash: '#ops/orders' },
      { id: 'audit', label: 'سجل التدقيق', icon: '📋', hash: '#ops/audit' },
    ],
  };

  // These appear in every authenticated profile (Runtime Navigation Hub)
  const universalNav = [
    { id: 'customers', label: 'عملائي', icon: '👥', hash: '#customers' },
    { id: 'invoices', label: 'فواتيري', icon: '📄', hash: '#invoices' },
  ];

  if (profileId === 'guest') {
    return [
      ...roleSpecific.guest,
      { id: 'divider' },
      { id: 'install', label: 'تثبيت التطبيق', icon: '📱', action: 'installPwa' },
    ];
  }

  const roleActions = [];
  if (profileId !== 'customer') {
    roleActions.push({ id: 'startVisit', label: 'فتح زيارة', icon: '🟢', action: 'startVisit' });
    roleActions.push({ id: 'createOrder', label: 'إنشاء طلب', icon: '➕', action: 'createOrder' });
  }
  roleActions.push({ id: 'store', label: 'المتجر', icon: '🏪', hash: '#home' });

  const items = [
    ...(roleSpecific[profileId] || roleSpecific.guest),
    { id: 'divider' },
    ...universalNav,
    { id: 'divider' },
    ...roleActions,
    { id: 'divider' },
    { id: 'install', label: 'تثبيت التطبيق', icon: '📱', action: 'installPwa' },
    { id: 'logout', label: 'تسجيل الخروج', icon: '🚪', action: 'logout' },
  ];

  return items;
}

function _initial(name) {
  if (!name) return '?';
  return name.charAt(0);
}

function _e(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function _renderButton() {
  _removeButton();
  const btn = document.createElement('button');
  btn.id = 'v2-ras-btn';
  const s = getSession();
  const profile = resolveProfile();
  const authenticated = profile.id !== 'guest';
  const name = s?.actor?.fullName || '';
  const initial = _initial(name);

  if (authenticated) {
    btn.className = 'v2-ras-btn v2-ras-btn-auth';
    btn.innerHTML = `<span class="v2-ras-avatar">${_e(initial)}</span>`;
    btn.title = name || 'الحساب';
  } else {
    btn.className = 'v2-ras-btn v2-ras-btn-guest';
    btn.innerHTML = '<span class="v2-ras-guest-icon">🔑</span>';
    btn.title = 'دخول';
  }

  btn.addEventListener('click', _toggleSheet);
  document.body.appendChild(btn);
  _btn = btn;
}

function _removeButton() {
  const existing = document.getElementById('v2-ras-btn');
  if (existing) existing.remove();
  _btn = null;
}

function _removeSheet() {
  const existing = document.getElementById('v2-ras-sheet');
  if (existing) existing.remove();
  _sheet = null;
}

function _toggleSheet() {
  if (_sheet) {
    _closeSheet();
    return;
  }
  _openSheet();
}

function _openSheet() {
  _removeSheet();
  const s = getSession();
  const profile = resolveProfile();
  console.log('[runtime] openSheet', { sessionStatus: s?.status, actorType: s?.actor?.type, fullName: s?.actor?.fullName, profileId: profile?.id, profileLabel: profile?.label });
  const items = _profileItems(profile.id);
  const authenticated = profile.id !== 'guest';
  const name = s?.actor?.fullName || '';
  const roleLabel = profile.label || '';
  const initial = _initial(name);

  const sheet = document.createElement('div');
  sheet.id = 'v2-ras-sheet';
  sheet.className = 'v2-ras-sheet';
  sheet.innerHTML = `
    <div class="v2-ras-backdrop" id="v2-ras-backdrop"></div>
    <div class="v2-ras-panel" id="v2-ras-panel">
      ${authenticated ? `<div class="v2-ras-profile">
        <div class="v2-ras-avatar-lg">${_e(initial)}</div>
        <div class="v2-ras-profile-info">
          <div class="v2-ras-profile-name">${_e(name)}</div>
          <div class="v2-ras-profile-role">${_e(roleLabel)}</div>
        </div>
        <div class="v2-ras-status-dot"></div>
      </div>` : `<div class="v2-ras-profile v2-ras-profile-guest">
        <div class="v2-ras-avatar-lg" style="background:#6b7280">ز</div>
        <div class="v2-ras-profile-info">
          <div class="v2-ras-profile-name">زائر</div>
          <div class="v2-ras-profile-role">اكتشف متجر الأهرام</div>
        </div>
      </div>`}
      <div class="v2-ras-items" id="v2-ras-items">
        ${items.map(item => {
          if (item.id === 'divider') return '<div class="v2-ras-divider"></div>';
          return `<button class="v2-ras-item" data-id="${item.id}" data-action="${item.action || ''}" data-hash="${item.hash || ''}">
            <span class="v2-ras-item-icon">${item.icon}</span>
            <span class="v2-ras-item-label">${_e(item.label)}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="v2-ras-footer">
        <span class="v2-ras-footer-text">متجر الأهرام v2</span>
      </div>
    </div>`;

  document.body.appendChild(sheet);
  _sheet = sheet;
  _bindSheet(sheet);

  requestAnimationFrame(() => {
    const panel = document.getElementById('v2-ras-panel');
    if (panel) panel.classList.add('v2-ras-panel-open');
  });
}

function _closeSheet() {
  _sheet = null;
  const panel = document.getElementById('v2-ras-panel');
  if (panel) panel.classList.remove('v2-ras-panel-open');
  setTimeout(() => {
    _removeSheet();
    _renderButton();
  }, 250);
}

function _bindSheet(el) {
  const backdrop = el.querySelector('#v2-ras-backdrop');
  backdrop?.addEventListener('click', _closeSheet);
  backdrop?.addEventListener('touchstart', _closeSheet);

  el.querySelectorAll('.v2-ras-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const hash = btn.dataset.hash;
      if (hash) {
        _closeSheet();
        setTimeout(() => { location.hash = hash; }, 100);
        return;
      }
      if (action === 'logout') {
        _closeSheet();
        setTimeout(() => { logout(); location.hash = '#home'; }, 100);
        return;
      }
      if (action === 'installPwa') {
        _closeSheet();
        _triggerPwaInstall();
        return;
      }
      if (action === 'startVisit') {
        _closeSheet();
        setTimeout(() => {
          const state = getRuntimeState();
          if (state.activeVisit) {
            showActiveWorkspace();
          } else {
            location.hash = '#customers';
          }
        }, 100);
        return;
      }
      if (action === 'createOrder') {
        _closeSheet();
        setTimeout(() => { location.hash = '#customers'; }, 100);
        return;
      }
    });
  });
}

let _deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredPrompt = e;
});

function _triggerPwaInstall() {
  if (!_deferredPrompt) {
    alert('يمكنك تثبيت التطبيق من قائمة المتصفح');
    return;
  }
  _deferredPrompt.prompt();
  _deferredPrompt.userChoice.then(() => { _deferredPrompt = null; });
}

export function initActionSheet() {
  _renderButton();
}

export function destroyActionSheet() {
  _removeButton();
  _removeSheet();
}

export function refreshActionSheet() {
  _removeButton();
  _renderButton();
}

export function toggleActionSheet() {
  _toggleSheet();
}
