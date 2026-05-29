import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import {
  getIdentity, buildOrderScopeFilter, buildVisitScopeFilter,
  aggregateOrdersByEmployee, aggregateVisitsByEmployee,
  rankEmployeesBySales,
} from '../../../services/storefront/governanceRuntime.js';
import { visitSelectFields, normalizeVisits } from '../../../services/contracts/visits.contract.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };

  return h;
}

async function _count(path) {
  try {
    const r = await fetch(`${API}/${path}`, { headers: { ..._h(), Prefer: 'count=exact' } });
    if (!r.ok) return 0;
    const cr = r.headers.get('content-range');
    return cr ? parseInt(cr.split('/')[1], 10) : 0;
  } catch (e) { console.warn('[dash] _count failed', path, e.message); return 0; }
}

async function _fetch(path) {
  try {
    const r = await fetch(`${API}/${path}`, { headers: _h() });
    if (!r.ok) { console.warn('[dash] _fetch failed', r.status, path); return []; }
    return r.json();
  } catch (e) { console.warn('[dash] _fetch exception', path, e.message); return []; }
}

export async function renderOpsDashboard(container) {
  try {
  container.innerHTML = '<div class="v2-ops-page v2-ops-command-center"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  getIdentity();
  const today = new Date().toISOString().slice(0, 10);
  const orderFilter = buildOrderScopeFilter();
  const visitFilter = buildVisitScopeFilter();
  const orderFilterAnd = orderFilter ? `&${orderFilter}` : '';
  const visitFilterAnd = visitFilter ? `&${visitFilter}` : '';
  const orderFilterQ = orderFilter ? `&${orderFilter}` : '';

  const [todayOrders, submittedOrders, reviewingOrders, preparingOrders, dispatchedOrders] = await Promise.all([
    _count(`runtime_order_visibility?select=id&created_at=gte.${today}${orderFilterAnd}&limit=0`),
    _count(`runtime_order_visibility?select=id&order_status=eq.submitted${orderFilterAnd}&limit=0`),
    _count(`runtime_order_visibility?select=id&order_status=eq.reviewing${orderFilterAnd}&limit=0`),
    _count(`runtime_order_visibility?select=id&order_status=eq.preparing${orderFilterAnd}&limit=0`),
    _count(`runtime_order_visibility?select=id&order_status=eq.dispatched${orderFilterAnd}&limit=0`),
  ]);

  // Section 1: Recent orders (isolated)
  const allOrders = await _fetch(`runtime_order_visibility?select=${orderListSelect()}&order=created_at.desc&limit=5`);

  // Section 2: Visits (isolated)
  const visitsResult = await _fetch(`runtime_visits_with_maps?select=${visitSelectFields()}${visitFilterAnd}&order=check_in_time.desc.nullslast&limit=200`);
  const visits = normalizeVisits(visitsResult);
  const activeVisits = visits.filter(v => (v.visit_status || v.status) === 'active' || (v.visit_status || v.status) === 'open').length;

  // Section 3: Top reps (isolated)
  let topRepsEnriched = [];
  let totalSalesAll = 0;
  try {
    const scopeOrders = await _fetch(`runtime_order_visibility?select=id,created_by_employee_id,total_amount,created_at${orderFilterQ}&order=created_at.desc&limit=200`);
    const byEmp = aggregateOrdersByEmployee(scopeOrders);
    totalSalesAll = scopeOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const topReps = rankEmployeesBySales(byEmp).slice(0, 5);
    const byEmpV = aggregateVisitsByEmployee(visits);
    const allEmpIds = Object.keys(byEmp);
    const empLookup = {};
    if (allEmpIds.length > 0) {
      const emps = await _fetch(`runtime_employee_capabilities?employee_id=in.(${allEmpIds.join(',')})&select=employee_id,full_name,employee_code`);
      for (const e of emps) empLookup[e.employee_id] = e;
    }
    topRepsEnriched = topReps.map(([eid, s]) => {
      const emp = empLookup[eid] || {};
      const vs = byEmpV[eid] || { visits: 0, active: 0, completed: 0 };
      return { eid, fullName: emp.full_name || '', employeeCode: emp.employee_code || '', ...s, ...vs };
    });
  } catch (e) { console.warn('[dash] top-reps section failed', e.message); }

  const submittedAlert = submittedOrders > 5;

  container.innerHTML = `<div class="v2-ops-page v2-ops-command-center">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
        <h2 style="font-size:1.125rem;font-weight:700">🎯 غرفة العمليات</h2>
        <span style="font-size:.75rem;color:#6b7280">${_d(new Date())}</span>
      </div>

      <!-- Priority Queues -->
      <div class="v2-ops-priority-queues">
        <div class="v2-ops-pq-item ${submittedAlert ? 'v2-pq-urgent' : submittedOrders > 0 ? 'v2-pq-delayed' : ''}" onclick="location.hash='#ops/orders?q=submitted'">
          <div class="v2-ops-pq-left"><span class="v2-ops-pq-dot v2-ops-pq-dot-yellow"></span><span class="v2-ops-pq-label">مُقدَّمة</span></div>
          <span class="v2-ops-pq-count${submittedAlert ? ' v2-ops-pq-count-alert' : ''}">${_n(submittedOrders)}</span>
          ${submittedAlert ? '<span class="v2-pq-badge-urgent">عاجل</span>' : ''}
        </div>
        <div class="v2-ops-pq-item" onclick="location.hash='#ops/orders?q=reviewing'">
          <div class="v2-ops-pq-left"><span class="v2-ops-pq-dot v2-ops-pq-dot-blue"></span><span class="v2-ops-pq-label">قيد المراجعة</span></div>
          <span class="v2-ops-pq-count">${_n(reviewingOrders)}</span>
        </div>
        <div class="v2-ops-pq-item" onclick="location.hash='#ops/orders?q=preparing'">
          <div class="v2-ops-pq-left"><span class="v2-ops-pq-dot v2-ops-pq-dot-purple"></span><span class="v2-ops-pq-label">قيد التجهيز</span></div>
          <span class="v2-ops-pq-count">${_n(preparingOrders)}</span>
          ${preparingOrders > 0 ? '<span class="v2-pq-badge-working">⚠️ قيد التنفيذ</span>' : ''}
        </div>
        <div class="v2-ops-pq-item" onclick="location.hash='#ops/orders?q=dispatched'">
          <div class="v2-ops-pq-left"><span class="v2-ops-pq-dot v2-ops-pq-dot-cyan"></span><span class="v2-ops-pq-label">مُرسلة</span></div>
          <span class="v2-ops-pq-count">${_n(dispatchedOrders)}</span>
        </div>
        <div class="v2-ops-pq-item" onclick="location.hash='#ops/reps'">
          <div class="v2-ops-pq-left"><span class="v2-ops-pq-dot v2-ops-pq-dot-green v2-ops-pq-active"></span><span class="v2-ops-pq-label">زيارات نشطة</span></div>
          <span class="v2-ops-pq-count">${_n(activeVisits)}</span>
          ${activeVisits > 0 ? '<span class="v2-pq-badge-live">🟢 مباشر</span>' : ''}
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="v2-dash-grid" style="grid-template-columns:repeat(auto-fill, minmax(140px, 1fr))">
        <div class="v2-dash-card v2-dash-card-0"><div class="v2-dash-ico">📋</div><div class="v2-dash-num">${_n(todayOrders)}</div><div class="v2-dash-lbl">طلبات اليوم</div></div>
        <div class="v2-dash-card ${submittedAlert ? 'v2-dash-alert' : 'v2-dash-card-1'}"><div class="v2-dash-ico">⏳</div><div class="v2-dash-num">${_n(submittedOrders)}</div><div class="v2-dash-lbl">مُقدَّمة</div></div>
        <div class="v2-dash-card v2-dash-card-0"><div class="v2-dash-ico">🔍</div><div class="v2-dash-num">${_n(reviewingOrders)}</div><div class="v2-dash-lbl">قيد المراجعة</div></div>
        <div class="v2-dash-card v2-dash-card-3"><div class="v2-dash-ico">💰</div><div class="v2-dash-num">${_money(totalSalesAll)}</div><div class="v2-dash-lbl">إجمالي المبيعات</div></div>
      </div>

      <!-- Top Reps (replaces chart) -->
      ${topRepsEnriched.length > 0 ? `
      <div class="v2-dash-section-header">
        <h3>🏆 أفضل المناديب</h3>
        <a href="#ops/reps" class="v2-dash-section-link">عرض الكل</a>
      </div>
      <div class="v2-odash-reps">${topRepsEnriched.map((r, i) => `
        <a href="#ops/reps/${r.eid}" class="v2-odash-rep-card">
          <div class="v2-odash-rep-avatar">${(r.fullName || '?')[0]}</div>
          <div class="v2-odash-rep-body">
            <div class="v2-odash-rep-name">${_e(r.fullName)}</div>
            <div class="v2-odash-rep-stats-row">
              <span class="v2-odash-rep-stat"><span class="v2-odash-rep-stat-val">${_money(r.total)}</span>مبيعات</span>
              <span class="v2-odash-rep-stat"><span class="v2-odash-rep-stat-val">${r.count}</span>فواتير</span>
              <span class="v2-odash-rep-stat"><span class="v2-odash-rep-stat-val">${r.visits}</span>زيارات</span>
            </div>
          </div>
          <div class="v2-odash-rep-rank">#${i + 1}</div>
        </a>`).join('')}</div>` : ''}

      <!-- Operational Rankings: Today / This Week -->
      <div class="v2-dash-section-header"><h3>⚡ آخر الطلبات</h3></div>
      ${allOrders.length === 0 ? '<p style="color:#6b7280;font-size:.875rem">لا توجد طلبات حديثة</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>المندوب</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>${allOrders.map(o => `<tr>
        <td><a href="#ops/orders/${o.id}">${_e(o.order_number)}</a><div style="font-size:.72rem;color:#6b7280">${_e(o.created_by_name || o.created_by_name_snapshot || '—')}</div></td>
        <td>${_e(o.customer_name || o.customer_name_snapshot || '—')}</td>
        <td>${_e(o.rep_name || o.sales_rep_name || o.created_by_name || o.created_by_name_snapshot || '—')}</td>
        <td>${_d(o.created_at)}</td>
        <td>${_money(o.total_amount)}</td>
        <td><span class="v2-badge ${o.order_status === 'cancelled' ? 'v2-badge-no' : o.order_status === 'delivered' ? 'v2-badge-ok' : o.order_status === 'approved' ? 'v2-badge-success' : 'v2-badge-info'}">${_e(o.order_status || '')}</span></td>
      </tr>`).join('')}</tbody></table></div>`}

      <div class="v2-odash-quick-row">
        <a href="#ops/orders" class="v2-odash-quick-btn"><span>📋</span> الطلبات</a>
        <a href="#ops/reps" class="v2-odash-quick-btn"><span>👥</span> المناديب</a>
        <a href="#ops/customers" class="v2-odash-quick-btn"><span>👤</span> العملاء</a>
      </div>
    </div>`;
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل البيانات</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsDashboard(container));
  }
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
function _n(v) { if (v == null) return '0'; return Number(v).toLocaleString('en-US'); }
