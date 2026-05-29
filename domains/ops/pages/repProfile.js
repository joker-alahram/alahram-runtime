import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { canViewEmployee, renderForbidden } from '../../../services/storefront/governanceRuntime.js';
import { formatStatus } from '../../../services/storefront/invoicesApi.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';
import { customerListSelect } from '../../../services/contracts/customers.contract.js';
import { fetchSingleEmployeeProjection } from '../../../services/contracts/employeeProjectionService.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

let _activeTab = 'operational';

export async function renderOpsRepProfile(container, params) {
  const eid = params.repId;
  if (!eid) { container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>معرف المندوب غير صالح</p></div></div>'; return; }

  const guard = canViewEmployee(eid);
  if (!guard.allowed) { renderForbidden(container, guard.reason, 'المناديب', '#ops/reps'); return; }

  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري تحميل بيانات المندوب...</div></div>';
  try {
    const [emp, orders, custAssignments, custDetail, visits] = await Promise.all([
      fetchSingleEmployeeProjection(eid),
      fetch(`${API}/runtime_order_visibility?created_by_employee_id=eq.${eid}&select=${orderListSelect()}&order=created_at.desc&limit=100`, { headers: _h() }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/customer_assignments?employee_id=eq.${eid}&select=customer_id`, { headers: _h() }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/runtime_customer_visibility?select=${customerListSelect()}&is_active=eq.true`, { headers: _h() }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/runtime_visits_with_maps?employee_id=eq.${eid}&order=check_in_time.desc.nullslast`, { headers: _h() }).then(r => r.ok ? r.json() : []),
    ]);
    if (!emp) throw new Error('not_found');

    // Normalize runtime_visits_with_maps view to canonical visits contract
    const normalizedVisits = visits.map(v => ({
      id: v.visit_id,
      customer_id: v.customer_id,
      customer_name: v.customer_name || '',
      employee_id: v.employee_id,
      visit_status: v.visit_status,
      check_in_time: v.check_in_time,
      check_out_time: v.check_out_time,
      created_at: v.created_at,
      note: v.note,
    }));

    const custIds = custAssignments.map(a => a.customer_id);
    const customers = custDetail.filter(c => custIds.includes(c.id));
    const custMap = {};
    for (const c of custDetail) custMap[c.id] = c;

    const totalSales = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const avgOrder = orders.length ? totalSales / orders.length : 0;
    const visitCount = normalizedVisits.length;
    const activeVisits = normalizedVisits.filter(v => v.visit_status === 'active' || v.visit_status === 'open').length;
    const completedVisits = normalizedVisits.filter(v => v.visit_status === 'completed').length;

    _activeTab = 'operational';
    _render(container, emp, { orders, customers, custMap, totalSales, avgOrder, visits: normalizedVisits, visitCount, activeVisits, completedVisits, custIds });
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل بيانات المندوب</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsRepProfile(container, params));
  }
}

function _render(container, emp, data) {
  const active = emp.is_active !== false;

  // Top 5 customers by spend
  const topCustomers = data.customers.map(c => {
    const custOrders = data.orders.filter(o => o.customer_id === c.id);
    const spent = custOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return { ...c, spent, orderCount: custOrders.length };
  }).sort((a, b) => b.spent - a.spent).slice(0, 5);

  // Today's activity
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayVisits = data.visits.filter(v => (v.check_in_time || v.created_at || '').startsWith(todayStr));
  const todayOrders = data.orders.filter(o => (o.created_at || '').startsWith(todayStr));
  const todayInvoices = todayOrders.length;
  const todaySales = todayOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  container.innerHTML = `<div class="v2-ops-page">
    <nav style="margin-bottom:.75rem"><a href="#ops/reps" class="v2-ops-back-link">← المناديب</a></nav>

    <div class="v2-orp-header">
      <div class="v2-orp-avatar">${_e((emp.full_name || '?')[0])}</div>
      <div class="v2-orp-h-body">
        <div class="v2-orp-name">${_e(emp.full_name)}</div>
        ${emp.employee_code ? `<div class="v2-orp-code">${_e(emp.employee_code)}</div>` : ''}
        ${emp.region_name ? `<div class="v2-orp-region">📍 ${_e(emp.region_name)}</div>` : ''}
        ${emp.phone ? `<div class="v2-orp-phone">📞 ${_e(emp.phone)}</div>` : ''}
        <div class="v2-orp-meta" style="margin-top:.375rem">
          <span class="v2-cw-badge ${active ? 'v2-cw-badge-on' : 'v2-cw-badge-off'}">${active ? 'نشط' : 'غير نشط'}</span>
          ${emp.created_at ? `<span class="v2-cw-badge v2-cw-badge-info">منذ ${_monthSince(emp.created_at)}</span>` : ''}
          ${data.activeVisits > 0 ? `<span class="v2-cw-badge" style="background:#fef3c7;color:#92400e">${data.activeVisits} زيارة نشطة</span>` : ''}
        </div>
      </div>
    </div>

    <!-- Stats Header -->
    <div class="v2-orp-stats">
      <div class="v2-orp-stat"><div class="v2-orp-stat-val">${_money(data.totalSales)}</div><div class="v2-orp-stat-lbl">إجمالي المبيعات</div></div>
      <div class="v2-orp-stat"><div class="v2-orp-stat-val">${data.orders.length}</div><div class="v2-orp-stat-lbl">الفواتير</div></div>
      <div class="v2-orp-stat"><div class="v2-orp-stat-val">${_money(data.avgOrder)}</div><div class="v2-orp-stat-lbl">متوسط الفاتورة</div></div>
      <div class="v2-orp-stat"><div class="v2-orp-stat-val">${data.visitCount}</div><div class="v2-orp-stat-lbl">إجمالي الزيارات</div></div>
      <div class="v2-orp-stat"><div class="v2-orp-stat-val">${data.completedVisits}</div><div class="v2-orp-stat-lbl">زيارات مكتملة</div></div>
      <div class="v2-orp-stat"><div class="v2-orp-stat-val">${data.customers.length}</div><div class="v2-orp-stat-lbl">العملاء</div></div>
    </div>

    <!-- Today's Activity -->
    <div class="v2-orp-today">
      <div class="v2-orp-today-title">⚡ نشاط اليوم</div>
      <div class="v2-orp-today-row">
        <div class="v2-orp-today-stat"><span class="v2-orp-today-val">${todayInvoices}</span><span class="v2-orp-today-lbl">فواتير اليوم</span></div>
        <div class="v2-orp-today-stat"><span class="v2-orp-today-val">${_money(todaySales)}</span><span class="v2-orp-today-lbl">مبيعات اليوم</span></div>
        <div class="v2-orp-today-stat"><span class="v2-orp-today-val">${todayVisits.length}</span><span class="v2-orp-today-lbl">زيارات اليوم</span></div>
      </div>
    </div>

    <!-- Top Customers -->
    <div class="v2-orp-section">
      <div class="v2-orp-section-title">🏆 أفضل العملاء</div>
      ${topCustomers.length ? `<div class="v2-orp-list">${topCustomers.map((c, i) => `
        <a href="#ops/customers/${c.id}" class="v2-orp-list-item">
          <div class="v2-orp-list-l"><span class="v2-orp-rank-badge-sm v2-orp-rank-badge-sm-${i}">${['🥇','🥈','🥉','4','5'][i]}</span><span>${_e(c.customer_name)}</span></div>
          <div class="v2-orp-list-r"><span class="v2-orp-list-val">${_money(c.spent)}</span><span class="v2-orp-list-sub">${c.orderCount} فاتورة</span></div>
        </a>`).join('')}</div>` : '<div class="v2-orp-empty">لا يوجد عملاء</div>'}
    </div>

    <!-- Recent Invoices -->
    <div class="v2-orp-section">
      <div class="v2-orp-section-title">📄 آخر الفواتير</div>
      ${data.orders.length ? `<div class="v2-orp-list">${data.orders.slice(0, 8).map(o => {
        const d = new Date(o.created_at);
        const ds = d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
        const cname = data.custMap[o.customer_id]?.customer_name || '';
        return `<a href="#ops/orders/${o.id}" class="v2-orp-list-item">
          <div class="v2-orp-list-l"><strong>فاتورة ${_e(o.order_number || '—')}</strong><br><small style="color:#6b7280;font-size:.75rem">${_e(cname)}</small></div>
          <div class="v2-orp-list-r"><span class="v2-orp-list-val">${_money(o.total_amount)}</span><span class="v2-orp-list-sub">${ds}</span></div>
        </a>`;
      }).join('')}</div>` : '<div class="v2-orp-empty">لا توجد فواتير</div>'}
    </div>

    <!-- Recent Visits -->
    <div class="v2-orp-section">
      <div class="v2-orp-section-title">📋 آخر الزيارات</div>
      ${data.visits.length ? `<div class="v2-orp-list">${data.visits.slice(0, 8).map(v => {
        const d = new Date(v.check_in_time || v.created_at);
        const ds = d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
        const statusLabels = { active: 'نشطة', open: 'نشطة', completed: 'مكتملة', cancelled: 'ملغية' };
        return `<div class="v2-orp-list-item">
          <div class="v2-orp-list-l"><span class="v2-orp-status-dot ${v.visit_status}"></span>${_e(v.customer_name)}</div>
          <div class="v2-orp-list-r"><span>${ds}</span><span class="v2-orp-list-sub">${statusLabels[v.visit_status] || v.visit_status}</span></div>
        </div>`;
      }).join('')}</div>` : '<div class="v2-orp-empty">لا توجد زيارات</div>'}
    </div>

    <!-- Tabs: full Customers, Visits, Invoices -->
    <div class="v2-orp-tabs">
      <button class="v2-orp-tab v2-orp-tab-active" data-tab="customers">العملاء (${data.customers.length})</button>
      <button class="v2-orp-tab" data-tab="visits">الزيارات (${data.visitCount})</button>
      <button class="v2-orp-tab" data-tab="invoices">الفواتير (${data.orders.length})</button>
    </div>
    <div id="v2-orp-tab-content">${_tabCustomers(data)}</div>
  </div>`;

  _bindTabs(container, data);
}

function _tabCustomers(data) {
  if (!data.customers.length) return '<div class="v2-orp-tab-empty">لا يوجد عملاء</div>';
  return `<div class="v2-orp-tab-list">${data.customers.map(c => {
    const custOrders = data.orders.filter(o => o.customer_id === c.id);
    const spent = custOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    return `<a href="#ops/customers/${c.id}" class="v2-orp-tab-item">
      <div class="v2-orp-tab-item-left">
        <div class="v2-orp-cust-name">${_e(c.customer_name)}</div>
        ${c.phone ? `<div class="v2-orp-cust-phone">📞 ${_e(c.phone)}</div>` : ''}
      </div>
      <div class="v2-orp-tab-item-right">
        <div class="v2-orp-cust-stat">${_money(spent)}</div>
        <div class="v2-orp-cust-stat-sub">${custOrders.length} فاتورة</div>
      </div>
    </a>`;
  }).join('')}</div>`;
}

function _tabVisits(data) {
  if (!data.visits.length) return '<div class="v2-orp-tab-empty">لا توجد زيارات</div>';
  return `<div class="v2-orp-tab-list">${data.visits.map(v => {
    const d = new Date(v.check_in_time || v.created_at);
    const ds = d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
    const statusLabels = { active: 'نشطة', open: 'نشطة', completed: 'مكتملة', cancelled: 'ملغية' };
    return `<div class="v2-orp-tab-item">
      <div class="v2-orp-tab-item-left"><span class="v2-orp-status-dot ${v.visit_status}"></span>${_e(v.customer_name)}</div>
      <div class="v2-orp-tab-item-right">${ds} · ${statusLabels[v.visit_status] || v.visit_status}</div>
    </div>`;
  }).join('')}</div>`;
}

function _tabInvoices(data) {
  if (!data.orders.length) return '<div class="v2-orp-tab-empty">لا توجد فواتير</div>';
  return `<div class="v2-orp-tab-list">${data.orders.map(o => {
    const d = new Date(o.created_at);
    const ds = d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
    const cname = data.custMap[o.customer_id]?.customer_name || '';
    return `<a href="#ops/orders/${o.id}" class="v2-orp-tab-item">
      <div class="v2-orp-tab-item-left"><strong>فاتورة ${_e(o.order_number || '—')}</strong>${cname ? `<br><small style="color:#6b7280;font-size:.75rem">${_e(cname)}</small>` : ''}</div>
      <div class="v2-orp-tab-item-right" style="text-align:left">${_money(o.total_amount)}<br><small style="font-size:.6875rem;color:#6b7280">${ds} · ${formatStatus(o.order_status)}</small></div>
    </a>`;
  }).join('')}</div>`;
}

function _bindTabs(container, data) {
  container.querySelectorAll('.v2-orp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.v2-orp-tab').forEach(t => t.classList.remove('v2-orp-tab-active'));
      tab.classList.add('v2-orp-tab-active');
      const tabName = tab.dataset.tab;
      const content = container.querySelector('#v2-orp-tab-content');
      if (tabName === 'customers') content.innerHTML = _tabCustomers(data);
      else if (tabName === 'visits') content.innerHTML = _tabVisits(data);
      else if (tabName === 'invoices') content.innerHTML = _tabInvoices(data);
    });
  });
}

function _monthSince(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr).getTime();
  const months = Math.floor(ms / (30 * 86400000));
  if (months < 1) return 'أقل من شهر';
  if (months === 1) return 'شهر';
  return `${months} أشهر`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
