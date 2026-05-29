import { readConfig } from '../../../config.js';
import { getSession, logout } from '../../../auth/sessionService.js';
import { customerDetailSelect } from '../../../services/contracts/customers.contract.js';

export async function renderPortalProfile(container) {
  const ses = getSession();
  if (ses?.status !== 'authenticated') { location.hash = '#login'; return; }
  container.innerHTML = '<div class="v2-loading">جاري تحميل البيانات...</div>';
  try {
    const customer = await _fetchCustomer(ses.actor.id);
    _render(container, ses, customer);
  } catch {
    container.innerHTML = '<div class="v2-error"><p>فشل تحميل البيانات</p><button class="v2-retry" id="v2-ppro-retry">إعادة المحاولة</button></div>';
    container.querySelector('#v2-ppro-retry')?.addEventListener('click', () => renderPortalProfile(container));
  }
}

async function _fetchCustomer(cid) {
  const r = await fetch(readConfig().baseUrl + '/runtime_customer_visibility?select=' + customerDetailSelect() + '&id=eq.' + cid, { headers: _headers() });
  if (!r.ok) return null;
  const arr = await r.json();
  return arr.length ? arr[0] : null;
}

function _render(container, ses, customer) {
  const actor = ses.actor || {};
  container.innerHTML = '<div class="v2-ppro">'
    + '<div class="v2-ppro-card">'
    + '<div class="v2-ppro-avatar">' + (actor.fullName ? actor.fullName.charAt(0) : '') + '</div>'
    + '<h2>' + _e(actor.fullName || '') + '</h2>'
    + '</div>'
    + '<div class="v2-ppro-info">'
    + (customer ? '<div class="v2-ppro-row"><span>الاسم</span><span>' + _e(customer.customer_name || '') + '</span></div>' : '')
    + (customer?.phone ? '<div class="v2-ppro-row"><span>الهاتف</span><span>' + _e(customer.phone) + '</span></div>' : '')
    + (customer?.address ? '<div class="v2-ppro-row"><span>العنوان</span><span>' + _e(customer.address) + '</span></div>' : '')
    + (customer?.customer_type ? '<div class="v2-ppro-row"><span>النوع</span><span>' + _e(customer.customer_type) + '</span></div>' : '')
    + (customer?.branch_id ? '<div class="v2-ppro-row"><span>الفرع</span><span>' + _e(customer.branch_id) + '</span></div>' : '')
    + '</div>'
    + '<div class="v2-ppro-actions">'
    + '<button class="v2-btn v2-btn-d" id="v2-ppro-logout">تسجيل الخروج</button>'
    + '</div></div>';
  container.querySelector('#v2-ppro-logout')?.addEventListener('click', async () => {
    await logout();
    location.hash = '#home';
  });
}

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
