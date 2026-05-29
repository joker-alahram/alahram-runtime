import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { getIdentity, canViewEmployee, renderForbidden, buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { getVisits, formatDuration } from '../../../services/storefront/visitsApi.js';
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

let _activeTab = 'customers';

export async function renderRepresentativePage(container, params) {
  const eid = params.repId;
  if (!eid) { container.innerHTML = '<div class="v2-cw"><div class="v2-empty"><p>معرف المندوب غير صالح</p></div></div>'; return; }

  const guard = canViewEmployee(eid);
  if (!guard.allowed) { renderForbidden(container, guard.reason, 'المناديب', '#reps'); return; }

  container.innerHTML = '<div class="v2-cw"><div class="v2-loading">جاري تحميل بيانات المندوب...</div></div>';
  try {
    const emp = await fetchSingleEmployeeProjection(eid);
    if (!emp) throw new Error('not_found');

    // Batch data
    const scopeFilter = buildOrderScopeFilter();
    const [orders, custAssignments, custDetail] = await Promise.all([
      fetch(`${API}/runtime_order_visibility?created_by_employee_id=eq.${eid}${scopeFilter ? '&' + scopeFilter : ''}&select=${orderListSelect()}&order=created_at.desc&limit=100`, { headers: _h() }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/customer_assignments?employee_id=eq.${eid}&select=customer_id`, { headers: _h() }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/runtime_customer_visibility?select=${customerListSelect()}&is_active=eq.true${scopeFilter ? '&' + scopeFilter : ''}`, { headers: _h() }).then(r => r.ok ? r.json() : []),
    ]);

    const custIds = custAssignments.map(a => a.customer_id);
    const customers = custDetail.filter(c => custIds.includes(c.id));
    const custMap = {};
    for (const c of custDetail) custMap[c.id] = c;

    // Aggregations
    const totalSales = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const avgOrder = orders.length ? totalSales / orders.length : 0;
    const lastOrder = orders.length ? orders[0] : null;

    // Visits from localStorage (self only for this device)
    const allVisits = getVisits().filter(v => v.employee_id === eid);
    const visitCount = allVisits.length;
    const totalCollected = allVisits.reduce((s, v) => s + (v.total_collected_amount || 0), 0);
    const activeVisits = allVisits.filter(v => v.status === 'active').length;

    // Build monthly chart data from orders
    const monthlyMap = {};
    for (const o of orders) {
      const m = (o.created_at || '').slice(0, 7); // YYYY-MM
      if (!monthlyMap[m]) monthlyMap[m] = 0;
      monthlyMap[m] += Number(o.total_amount || 0);
    }
    const months = Object.keys(monthlyMap).sort();
    const maxMonth = Math.max(...Object.values(monthlyMap), 1);

    _activeTab = 'customers';
    _render(container, emp, { orders, customers, custMap, totalSales, avgOrder, lastOrder, allVisits, visitCount, totalCollected, activeVisits, months, monthlyMap, maxMonth, custIds });
  } catch {
    container.innerHTML = '<div class="v2-cw"><div class="v2-empty"><p>فشل تحميل بيانات المندوب</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderRepresentativePage(container, params));
  }
}

function _render(container, emp, data) {
  const active = emp.is_active !== false;
  container.innerHTML = `<div class="v2-cw">
    <nav class="v2-cw-nav"><a href="#reps" class="v2-cw-back">← المناديب</a></nav>

    <!-- Header -->
    <div class="v2-rp-header">
      <div class="v2-rp-avatar">${_e((emp.full_name || '?')[0])}</div>
      <div class="v2-rp-h-body">
        <div class="v2-rp-name">${_e(emp.full_name)}</div>
        ${emp.employee_code ? `<div class="v2-rp-code">${_e(emp.employee_code)}</div>` : ''}
        ${emp.region_name ? `<div class="v2-rp-region">📍 ${_e(emp.region_name)}</div>` : ''}
        ${emp.phone ? `<div class="v2-rp-phone">📞 ${_e(emp.phone)}</div>` : ''}
        <div class="v2-cw-meta" style="margin-top:.375rem">
          <span class="v2-cw-badge ${active ? 'v2-cw-badge-on' : 'v2-cw-badge-off'}">${active ? 'نشط' : 'غير نشط'}</span>
          ${emp.created_at ? `<span class="v2-cw-badge v2-cw-badge-info">منذ ${_monthSince(emp.created_at)}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="v2-cw-stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="v2-cw-stat"><div class="v2-cw-stat-val">${_money(data.totalSales)}</div><div class="v2-cw-stat-lbl">المبيعات</div></div>
      <div class="v2-cw-stat"><div class="v2-cw-stat-val">${data.orders.length}</div><div class="v2-cw-stat-lbl">الفواتير</div></div>
      <div class="v2-cw-stat"><div class="v2-cw-stat-val">${_money(data.avgOrder)}</div><div class="v2-cw-stat-lbl">المتوسط</div></div>
      <div class="v2-cw-stat"><div class="v2-cw-stat-val">${data.visitCount}</div><div class="v2-cw-stat-lbl">الزيارات</div></div>
      <div class="v2-cw-stat"><div class="v2-cw-stat-val">${data.customers.length}</div><div class="v2-cw-stat-lbl">العملاء</div></div>
      <div class="v2-cw-stat"><div class="v2-cw-stat-val">${_money(data.totalCollected)}</div><div class="v2-cw-stat-lbl">التحصيل</div></div>
    </div>

    <!-- Chart -->
    ${_chartHtml(data)}

    <!-- Tabs -->
    <div class="v2-rp-tabs">
      <button class="v2-rp-tab v2-rp-tab-active" data-tab="customers">العملاء (${data.customers.length})</button>
      <button class="v2-rp-tab" data-tab="visits">الزيارات (${data.visitCount})</button>
      <button class="v2-rp-tab" data-tab="invoices">الفواتير (${data.orders.length})</button>
      <button class="v2-rp-tab" data-tab="collections">التحصيلات</button>
    </div>

    <!-- Tab Content -->
    <div id="v2-rp-tab-content">${_tabCustomers(data)}</div>
  </div>`;

  _bindTabs(container, data);
  _bindActions(container, emp);
}

function _chartHtml(data) {
  if (!data.months.length) return '';
  const bars = data.months.map(m => {
    const val = data.monthlyMap[m] || 0;
    const pct = (val / data.maxMonth) * 80;
    const label = m.slice(5); // MM
    return `<div class="v2-rp-chart-bar-wrap"><div class="v2-rp-chart-bar" style="height:${pct}%"><span class="v2-rp-chart-val">${_money(val)}</span></div><span class="v2-rp-chart-label">${label}</span></div>`;
  }).join('');
  return `<div class="v2-rp-chart"><div class="v2-rp-chart-title">📊 المبيعات الشهرية</div><div class="v2-rp-chart-bars">${bars}</div></div>`;
}

function _tabCustomers(data) {
  if (!data.customers.length) return '<div class="v2-rp-tab-empty">لا يوجد عملاء</div>';
  return `<div class="v2-rp-cust-list">${data.customers.map(c => {
    const custOrders = data.orders.filter(o => o.customer_id === c.id);
    const spent = custOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const last = custOrders.length ? custOrders[0] : null;
    return `<a href="#customer/${c.id}" class="v2-rp-cust-item">
      <div class="v2-rp-cust-info">
        <div class="v2-rp-cust-name">${_e(c.customer_name)}</div>
        ${c.phone ? `<div class="v2-rp-cust-phone">📞 ${_e(c.phone)}</div>` : ''}
      </div>
      <div class="v2-rp-cust-stats">
        <div class="v2-rp-cust-stat">${_money(spent)}</div>
        <div class="v2-rp-cust-stat-sub">${custOrders.length} فاتورة</div>
      </div>
    </a>`;
  }).join('')}</div>`;
}

function _tabVisits(data) {
  if (!data.allVisits.length) return '<div class="v2-rp-tab-empty">لا توجد زيارات</div>';
  return `<div class="v2-rp-tab-list">${data.allVisits.map(v => {
    const d = new Date(v.opened_at);
    const ds = d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
    return `<a href="#visits/${v.id}" class="v2-rp-tab-item">
      <div class="v2-rp-tab-item-left"><span class="v2-rp-status-dot ${v.status}"></span>${_e(v.customer_name)}</div>
      <div class="v2-rp-tab-item-right">${ds} · ${v.total_orders || 0} طلبات · ${_money(v.total_collected_amount || 0)}</div>
    </a>`;
  }).join('')}</div>`;
}

function _tabInvoices(data) {
  if (!data.orders.length) return '<div class="v2-rp-tab-empty">لا توجد فواتير</div>';
  return `<div class="v2-rp-tab-list">${data.orders.map(o => {
    const d = new Date(o.created_at);
    const ds = d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
    const cname = data.custMap[o.customer_id]?.customer_name || '';
    return `<a href="#invoices/${o.id}" class="v2-rp-tab-item">
      <div class="v2-rp-tab-item-left"><strong>فاتورة ${_e(o.order_number || '—')}</strong>${cname ? `<br><small style="color:var(--v2-text2);font-size:.75rem">${_e(cname)}</small>` : ''}</div>
      <div class="v2-rp-tab-item-right" style="text-align:left">${_money(o.total_amount)}<br><small style="font-size:.6875rem;color:var(--v2-text2)">${ds} · ${formatStatus(o.order_status)}</small></div>
    </a>`;
  }).join('')}</div>`;
}

function _tabCollections(data) {
  const cols = [];
  for (const v of data.allVisits) {
    for (const c of (v.collections || [])) {
      cols.push({ ...c, customer_name: v.customer_name, visit_id: v.id });
    }
  }
  cols.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (!cols.length) return '<div class="v2-rp-tab-empty">لا توجد تحصيلات</div>';
  return `<div class="v2-rp-tab-list">${cols.map(c => {
    const d = new Date(c.timestamp);
    const ds = d.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
    const methodLabels = { cash: 'نقداً', card: 'بطاقة', bank: 'تحويل', wallet: 'محفظة' };
    return `<div class="v2-rp-tab-item">
      <div class="v2-rp-tab-item-left"><strong>${_money(c.amount)}</strong><br><small style="color:var(--v2-text2);font-size:.75rem">${_e(c.customer_name || '')}</small></div>
      <div class="v2-rp-tab-item-right" style="text-align:left">${methodLabels[c.method] || c.method}<br><small style="font-size:.6875rem;color:var(--v2-text2)">${ds}</small></div>
    </div>`;
  }).join('')}</div>`;
}

function _bindTabs(container, data) {
  container.querySelectorAll('.v2-rp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.v2-rp-tab').forEach(t => t.classList.remove('v2-rp-tab-active'));
      tab.classList.add('v2-rp-tab-active');
      const tabName = tab.dataset.tab;
      const content = container.querySelector('#v2-rp-tab-content');
      if (tabName === 'customers') content.innerHTML = _tabCustomers(data);
      else if (tabName === 'visits') content.innerHTML = _tabVisits(data);
      else if (tabName === 'invoices') content.innerHTML = _tabInvoices(data);
      else if (tabName === 'collections') content.innerHTML = _tabCollections(data);
    });
  });
}

function _bindActions(container, emp) {
  // Any action buttons can be added here
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
