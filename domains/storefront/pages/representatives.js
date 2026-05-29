import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { getIdentity, scopeEmployeeIds, renderForbidden } from '../../../services/storefront/governanceRuntime.js';
import { getVisits } from '../../../services/storefront/visitsApi.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';
import { fetchAllEmployeeProjections } from '../../../services/contracts/employeeProjectionService.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

export async function renderRepresentativesList(container) {
  const identity = getIdentity();
  if (!identity || identity.actorType !== 'employee') {
    renderForbidden(container, 'هذه الصفحة للموظفين فقط');
    return;
  }

  container.innerHTML = '<div class="v2-cw"><div class="v2-loading">جاري تحميل المناديب...</div></div>';
  try {
    const empIds = scopeEmployeeIds();
    let employees = [];
    if (empIds === null || empIds.length) {
      employees = await fetchAllEmployeeProjections();
      if (empIds && empIds.length) {
        employees = employees.filter(e => empIds.includes(e.id || e.employee_id));
      }
    }

    if (!employees.length) {
      container.innerHTML = '<div class="v2-cw" style="text-align:center;padding:3rem"><p style="color:var(--v2-text2)">لا يوجد مناديب</p></div>';
      return;
    }

    const viewerId = identity.employeeId;
    const isAdmin = identity.isAdmin;
    const empIds = isAdmin ? [] : (scopeEmployeeIds() || [viewerId]);
    const scopeFilter = empIds.length ? `&created_by_employee_id=in.(${empIds.join(',')})` : '';
    const ordersUrl = `${API}/runtime_order_visibility?select=${orderListSelect()}&order=created_at.desc${scopeFilter}`;
    const allEmpIds = employees.map(e => e.id || e.employee_id);
    const ordersR = await fetch(ordersUrl, { headers: _h() });
    const allOrders = ordersR.ok ? await ordersR.json() : [];

    // Aggregate per employee
    const byEmp = {};
    for (const o of allOrders) {
      const eid = o.created_by_employee_id;
      if (!byEmp[eid]) byEmp[eid] = { orders: [], total: 0, count: 0, lastDate: null };
      byEmp[eid].orders.push(o);
      byEmp[eid].total += Number(o.total_amount || 0);
      byEmp[eid].count++;
      if (!byEmp[eid].lastDate || o.created_at > byEmp[eid].lastDate) byEmp[eid].lastDate = o.created_at;
    }

    const myVisits = getVisits();
    const byEmpVisits = {};
    for (const v of myVisits) {
      const eid = v.employee_id;
      if (!byEmpVisits[eid]) byEmpVisits[eid] = { visits: 0, collected: 0 };
      byEmpVisits[eid].visits++;
      byEmpVisits[eid].collected += v.total_collected_amount || 0;
    }

    container.innerHTML = `<div class="v2-cw">
      <div class="v2-cw-nav"><h1 style="font-size:1.125rem;font-weight:700">👥 المناديب</h1></div>
      <div class="v2-rl-grid">${employees.map(e => _card(e, byEmp[e.id], byEmpVisits[e.id])).join('')}</div>
    </div>`;
  } catch {
    container.innerHTML = '<div class="v2-cw"><div class="v2-empty"><p>فشل تحميل المناديب</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderRepresentativesList(container));
  }
}

function _card(emp, stats, visitStats) {
  const s = stats || { total: 0, count: 0, lastDate: null };
  const vs = visitStats || { visits: 0, collected: 0 };
  const active = emp.is_active !== false;
  const initial = (emp.full_name || '?')[0];
  return `<a href="#reps/${emp.id}" class="v2-rl-card">
    <div class="v2-rl-card-top">
      <div class="v2-rl-avatar">${initial}</div>
      <div class="v2-rl-card-h">
        <div class="v2-rl-name">${_e(emp.full_name)}</div>
        <span class="v2-rl-badge ${active ? 'v2-rl-badge-on' : 'v2-rl-badge-off'}">${active ? 'نشط' : 'غير نشط'}</span>
      </div>
    </div>
    ${emp.region_name ? `<div class="v2-rl-region">📍 ${_e(emp.region_name)}</div>` : ''}
    <div class="v2-rl-stats-row">
      <div class="v2-rl-s"><span class="v2-rl-sv">${_money(s.total)}</span><span class="v2-rl-sl">مبيعات</span></div>
      <div class="v2-rl-s"><span class="v2-rl-sv">${s.count}</span><span class="v2-rl-sl">فواتير</span></div>
      <div class="v2-rl-s"><span class="v2-rl-sv">${vs.visits}</span><span class="v2-rl-sl">زيارات</span></div>
      <div class="v2-rl-s"><span class="v2-rl-sv">${_money(vs.collected)}</span><span class="v2-rl-sl">تحصيل</span></div>
    </div>
    ${emp.phone ? `<div class="v2-rl-phone">📞 ${_e(emp.phone)}</div>` : ''}
  </a>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
