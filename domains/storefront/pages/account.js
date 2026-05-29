import { getSession, logout } from '../../../auth/sessionService.js';

export async function renderAccountPage(container) {
  const ses = getSession();
  if (ses?.status !== 'authenticated') {
    location.hash = '#login';
    return;
  }

  const actor = ses.actor || {};
  const role = ses.role || {};

  container.innerHTML = '<div class="v2-page"><div class="v2-account"><h1 class="v2-page-title">الحساب</h1>'
    + '<div class="v2-account-card"><div class="v2-account-body">'
    + '<div class="v2-account-row"><span>الاسم</span><span>' + _e(actor.fullName || '') + '</span></div>'
    + '<div class="v2-account-row"><span>الهاتف</span><span>' + _e(actor.phone || '') + '</span></div>'
    + '<div class="v2-account-row"><span>الدور</span><span>' + _e(role.roleName || '') + '</span></div>'
    + (actor.employeeCode ? '<div class="v2-account-row"><span>كود الموظف</span><span>' + _e(actor.employeeCode) + '</span></div>' : '')
    + '<div class="v2-account-row"><span>حالة الجلسة</span><span class="v2-account-status v2-account-status-ok">' + _e(ses.status) + '</span></div>'
    + '</div></div>'
    + '<div class="v2-account-actions"><button class="v2-btn v2-btn-b v2-account-logout" id="v2-account-logout">تسجيل الخروج</button></div>'
    + '</div></div>';

  container.querySelector('#v2-account-logout')?.addEventListener('click', async () => {
    await logout();
    location.hash = '#home';
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
