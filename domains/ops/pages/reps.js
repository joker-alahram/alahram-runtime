import { logError } from '../../../utils/logger.js';
import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import {
  getIdentity, scopeEmployeeIds, renderForbidden,
  buildOrderScopeFilter, buildVisitScopeFilter,
  aggregateOrdersByEmployee, aggregateVisitsByEmployee,
} from '../../../services/storefront/governanceRuntime.js';
import { hasCapability } from '../../../auth/sessionService.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';
import { fetchAllEmployeeProjections } from '../../../services/contracts/employeeProjectionService.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

let _sortKey = 'sales';
let _sortDir = 'desc';
let _from = '';
let _to = '';

export async function renderOpsReps(container) {
  const identity = getIdentity();
  if (!identity || identity.actorType !== 'employee') {
    renderForbidden(container, 'هذه الصفحة للموظفين فقط');
    return;
  }

  _from = localStorage.getItem('ops_reps_from') || '';
  _to = localStorage.getItem('ops_reps_to') || '';

  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري تحميل المنديب...</div></div>';
  try {
    // Check if user can add reps (can_manage_system = admin-level operational access)
    // SUPER_ADMIN bypass: check identity/session first before RPC (which requires Supabase JWT)
    let canAddRep = getIdentity()?.isAdmin || String(getSession()?.role?.roleCode || '').toUpperCase() === 'SUPER_ADMIN';
    if (!canAddRep) {
      try { canAddRep = await hasCapability('can_manage_system'); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
    }

    await _load(container, canAddRep);
  } catch (e) {
    console.error('[v2] failed: reps', e);
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل المناديب</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsReps(container).catch(e => console.error('[v2] reps retry', e)));
  }
}

async function _load(container, canAddRep) {
  const identity = getIdentity();
  const empIds = scopeEmployeeIds();

  let employees;
  if (empIds === null) {
    employees = await fetchAllEmployeeProjections();
  } else if (empIds.length) {
    employees = await fetchAllEmployeeProjections();
    employees = employees.filter(e => empIds.includes(e.employee_id || e.id));
  } else {
    employees = [];
  }

  if (!employees.length && !canAddRep) {
    container.innerHTML = '<div class="v2-ops-page" style="text-align:center;padding:3rem"><p style="color:#6b7280">لا يوجد مناديب</p></div>';
    return;
  }

  const orderFilter = buildOrderScopeFilter();
  const visitFilter = buildVisitScopeFilter();

  let orderDateQ = '';
  let visitDateQ = '';
  if (_from || _to) {
    const parts = [];
    if (_from) parts.push(`created_at=gte.${_from}`);
    if (_to) parts.push(`created_at=lte.${_to}`);
    orderDateQ = '&' + parts.join('&');
    const vparts = [];
    if (_from) vparts.push(`check_in_time=gte.${_from}`);
    if (_to) vparts.push(`check_in_time=lte.${_to}`);
    visitDateQ = '&' + vparts.join('&');
  }
  const orderQ = orderFilter ? `&${orderFilter}` : '';
  const visitQ = visitFilter ? `&${visitFilter}` : '';

  const [ordersR, visitsR, custAssignR] = await Promise.all([
    fetch(`${API}/runtime_order_visibility?select=${orderListSelect()}${orderQ}${orderDateQ}&order=created_at.desc`, { headers: _h() }),
    fetch(`${API}/visits?select=id,employee_id,visit_status,check_in_time,created_at${visitQ}${visitDateQ}`, { headers: _h() }),
    empIds === null
      ? fetch(`${API}/customer_assignments?select=employee_id,customer_id`, { headers: _h() }).then(r => r.ok ? r.json() : [])
      : fetch(`${API}/customer_assignments?employee_id=in.(${(empIds.length ? empIds : [identity.employeeId]).join(',')})&select=employee_id,customer_id`, { headers: _h() }).then(r => r.ok ? r.json() : []),
  ]);
  const allOrders = ordersR.ok ? await ordersR.json() : [];
  const allVisits = visitsR.ok ? await visitsR.json() : [];
  const allAssign = Array.isArray(custAssignR) ? custAssignR : [];

  const byEmp = aggregateOrdersByEmployee(allOrders);
  const byEmpV = aggregateVisitsByEmployee(allVisits);

  const custCount = {};
  for (const a of allAssign) {
    if (!custCount[a.employee_id]) custCount[a.employee_id] = new Set();
    custCount[a.employee_id].add(a.customer_id);
  }

  const enriched = employees.map(e => {
    const s = byEmp[e.employee_id || e.id] || { total: 0, count: 0, lastDate: null };
    const vs = byEmpV[e.employee_id || e.id] || { visits: 0, active: 0, completed: 0 };
    const active = e.is_active !== false;
    const customerAssignments = custCount[e.employee_id || e.id]?.size || 0;
    return { ...e, _stats: s, _visits: vs, _active: active, _custCount: customerAssignments };
  });

  const totalSales = enriched.reduce((s, e) => s + e._stats.total, 0);
  const totalInvoices = enriched.reduce((s, e) => s + e._stats.count, 0);
  const totalVisits = enriched.reduce((s, e) => s + e._visits.visits, 0);
  const totalCustomers = enriched.reduce((s, e) => s + e._custCount, 0);

  const bySalesDesc = [...enriched].sort((a, b) => b._stats.total - a._stats.total);
  const byVisitsDesc = [...enriched].sort((a, b) => b._visits.visits - a._visits.visits);
  const byCustDesc = [...enriched].sort((a, b) => b._custCount - a._custCount);
  const maxSales = bySalesDesc.length ? bySalesDesc[0]._stats.total : 1;

  const sorted = [...enriched].sort((a, b) => {
    const dir = _sortDir === 'desc' ? -1 : 1;
    switch (_sortKey) {
      case 'sales': return (a._stats.total - b._stats.total) * dir;
      case 'invoices': return (a._stats.count - b._stats.count) * dir;
      case 'visits': return (a._visits.visits - b._visits.visits) * dir;
      case 'customers': return (a._custCount - b._custCount) * dir;
      case 'name': return (a.full_name || '').localeCompare(b.full_name || '') * dir;
      default: return (a._stats.total - b._stats.total) * dir;
    }
  });

  const html = `
    <div class="v2-ops-page">
      <!-- Date Filter Bar + Add Rep Button -->
      <div class="v2-rpr-filter">
        <label class="v2-rpr-filter-lbl">من:</label>
        <input type="date" class="v2-rpr-filter-inp" id="rpr-from" value="${_from}">
        <label class="v2-rpr-filter-lbl">إلى:</label>
        <input type="date" class="v2-rpr-filter-inp" id="rpr-to" value="${_to}">
        <button class="v2-btn v2-btn-sm" id="rpr-filter-apply">تطبيق</button>
        ${_from || _to ? '<button class="v2-btn v2-btn-sm v2-btn-ghost" id="rpr-filter-clear">إلغاء</button>' : ''}
        ${canAddRep ? '<button class="v2-btn v2-btn-sm v2-btn-primary" id="rpr-add-rep" style="margin-right:auto">+ إضافة مندوب</button>' : ''}
      </div>

      <!-- KPI Header -->
      <div class="v2-rpr-kpi-row">
        <div class="v2-rpr-kpi"><span class="v2-rpr-kpi-icon">💰</span><span class="v2-rpr-kpi-val">${_money(totalSales)}</span><span class="v2-rpr-kpi-lbl">إجمالي المبيعات</span></div>
        <div class="v2-rpr-kpi"><span class="v2-rpr-kpi-icon">📄</span><span class="v2-rpr-kpi-val">${totalInvoices}</span><span class="v2-rpr-kpi-lbl">عدد الفواتير</span></div>
        <div class="v2-rpr-kpi"><span class="v2-rpr-kpi-icon">📋</span><span class="v2-rpr-kpi-val">${totalVisits}</span><span class="v2-rpr-kpi-lbl">إجمالي الزيارات</span></div>
        <div class="v2-rpr-kpi"><span class="v2-rpr-kpi-icon">👤</span><span class="v2-rpr-kpi-val">${totalCustomers}</span><span class="v2-rpr-kpi-lbl">إجمالي العملاء</span></div>
      </div>

      <div class="v2-ops-page-header"><h2>👥 أداء المناديب</h2><span class="v2-ops-page-count">${enriched.length}</span></div>

      <!-- Ranking: Top Sales -->
      <div class="v2-rpr-section">
        <div class="v2-rpr-section-title">🏆 أعلى المبيعات</div>
        <div class="v2-rpr-list">${bySalesDesc.slice(0, 5).map((e, i) => `
          <a href="#ops/reps/${e.id}" class="v2-rpr-card">
            <div class="v2-rpr-rank v2-rpr-rank-${i}">#${i + 1}</div>
            <div class="v2-rpr-avatar">${_e((e.full_name || '?')[0])}</div>
            <div class="v2-rpr-body">
              <div class="v2-rpr-name">${_e(e.full_name)}</div>
              <div class="v2-rpr-region">${_e(e.region_name || '—')}</div>
              <div class="v2-rpr-metrics">
                <span class="v2-rpr-metric"><span class="v2-rpr-metric-val">${_money(e._stats.total)}</span> مبيعات</span>
                <span class="v2-rpr-metric"><span class="v2-rpr-metric-val">${e._stats.count}</span> فواتير</span>
              </div>
              <div class="v2-rpr-bar"><div class="v2-rpr-bar-fill" style="width:${Math.max((e._stats.total / maxSales) * 100, 2)}%"></div></div>
            </div>
            <div class="v2-rpr-status ${e._active ? 'v2-rpr-status-on' : 'v2-rpr-status-off'}">${e._active ? 'نشط' : 'غير نشط'}</div>
          </a>`).join('')}</div>
      </div>

      <!-- Ranking: Most Visits -->
      <div class="v2-rpr-section">
        <div class="v2-rpr-section-title">📋 الأكثر زيارة</div>
        <div class="v2-rpr-list">${byVisitsDesc.slice(0, 5).map((e, i) => `
          <a href="#ops/reps/${e.id}" class="v2-rpr-card">
            <div class="v2-rpr-rank v2-rpr-rank-${i}">#${i + 1}</div>
            <div class="v2-rpr-avatar">${_e((e.full_name || '?')[0])}</div>
            <div class="v2-rpr-body">
              <div class="v2-rpr-name">${_e(e.full_name)}</div>
              <div class="v2-rpr-region">${_e(e.region_name || '—')}</div>
              <div class="v2-rpr-metrics">
                <span class="v2-rpr-metric"><span class="v2-rpr-metric-val">${e._visits.visits}</span> زيارات</span>
                <span class="v2-rpr-metric"><span class="v2-rpr-metric-val">${e._visits.active}</span> نشطة</span>
                <span class="v2-rpr-metric"><span class="v2-rpr-metric-val">${e._visits.completed}</span> مكتملة</span>
              </div>
              <div class="v2-rpr-bar"><div class="v2-rpr-bar-fill v2-rpr-bar-green" style="width:${Math.max((e._visits.visits / (byVisitsDesc[0]._visits.visits || 1)) * 100, 2)}%"></div></div>
            </div>
          </a>`).join('')}</div>
      </div>

      <!-- Ranking: Customer Coverage -->
      <div class="v2-rpr-section">
        <div class="v2-rpr-section-title">👤 الأكثر تغطية للعملاء</div>
        <div class="v2-rpr-list">${byCustDesc.slice(0, 5).map((e, i) => `
          <a href="#ops/reps/${e.id}" class="v2-rpr-card">
            <div class="v2-rpr-rank v2-rpr-rank-${i}">#${i + 1}</div>
            <div class="v2-rpr-avatar">${_e((e.full_name || '?')[0])}</div>
            <div class="v2-rpr-body">
              <div class="v2-rpr-name">${_e(e.full_name)}</div>
              <div class="v2-rpr-region">${_e(e.region_name || '—')}</div>
              <div class="v2-rpr-metrics">
                <span class="v2-rpr-metric"><span class="v2-rpr-metric-val">${e._custCount}</span> عملاء</span>
                <span class="v2-rpr-metric"><span class="v2-rpr-metric-val">${_money(e._stats.total)}</span> مبيعات</span>
              </div>
              <div class="v2-rpr-bar"><div class="v2-rpr-bar-fill v2-rpr-bar-purple" style="width:${Math.max((e._custCount / (byCustDesc[0]._custCount || 1)) * 100, 2)}%"></div></div>
            </div>
          </a>`).join('')}</div>
      </div>

      <!-- Ranking Table -->
      <div class="v2-rpr-section">
        <div class="v2-rpr-section-title">📊 جدول الترتيب</div>
        <div class="v2-rpr-tbl-wrap">
          <table class="v2-rpr-tbl">
            <thead>
              <tr>
                <th class="v2-rpr-tbl-rank">#</th>
                <th class="v2-rpr-tbl-sort" data-sort="name">الاسم ${_sortKey === 'name' ? (_sortDir === 'desc' ? '⬇' : '⬆') : ''}</th>
                <th>المنطقة</th>
                <th class="v2-rpr-tbl-sort" data-sort="sales">المبيعات ${_sortKey === 'sales' ? (_sortDir === 'desc' ? '⬇' : '⬆') : ''}</th>
                <th class="v2-rpr-tbl-sort" data-sort="invoices">الفواتير ${_sortKey === 'invoices' ? (_sortDir === 'desc' ? '⬇' : '⬆') : ''}</th>
                <th class="v2-rpr-tbl-sort" data-sort="visits">الزيارات ${_sortKey === 'visits' ? (_sortDir === 'desc' ? '⬇' : '⬆') : ''}</th>
                <th class="v2-rpr-tbl-sort" data-sort="customers">العملاء ${_sortKey === 'customers' ? (_sortDir === 'desc' ? '⬇' : '⬆') : ''}</th>
                <th>نشاط</th>
                <th>آخر نشاط</th>
              </tr>
            </thead>
            <tbody>${sorted.map((e, i) => _rankRow(e, i + 1)).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  container.innerHTML = html;

  container.querySelector('#rpr-from')?.addEventListener('change', e => { _from = e.target.value; });
  container.querySelector('#rpr-to')?.addEventListener('change', e => { _to = e.target.value; });
  const _reload = () => { _load(container, canAddRep).catch(e => console.error('[v2] reps reload', e)); };

  container.querySelector('#rpr-filter-apply')?.addEventListener('click', () => {
    if (_from) localStorage.setItem('ops_reps_from', _from);
    else localStorage.removeItem('ops_reps_from');
    if (_to) localStorage.setItem('ops_reps_to', _to);
    else localStorage.removeItem('ops_reps_to');
    _reload();
  });
  container.querySelector('#rpr-filter-clear')?.addEventListener('click', () => {
    _from = ''; _to = '';
    localStorage.removeItem('ops_reps_from');
    localStorage.removeItem('ops_reps_to');
    _reload();
  });

  container.querySelectorAll('.v2-rpr-tbl-sort').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (_sortKey === key) _sortDir = _sortDir === 'desc' ? 'asc' : 'desc';
      else { _sortKey = key; _sortDir = 'desc'; }
      _reload();
    });
  });

  if (canAddRep) {
    container.querySelector('#rpr-add-rep')?.addEventListener('click', () => _showAddRepModal(container));
  }
}

async function _showAddRepModal(container) {
  // Fetch all active employees for manager select
  let managers = [];
  try {
    const r = await fetch(`${API}/employees?select=id,full_name,region_name&is_active=eq.true&order=full_name.asc`, { headers: _h() });
    managers = r.ok ? await r.json() : [];
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }

  const overlay = document.createElement('div');
  overlay.className = 'v2-modal-overlay';
  overlay.innerHTML = `<div class="v2-modal v2-modal-add-rep">
    <div class="v2-modal-h"><h3>â‍• إضافة مندوب جديد</h3><button class="v2-modal-x" id="m-add-rep-x">âœ•</button></div>
    <div class="v2-modal-f">
      <div class="v2-add-rep-form">
        <label class="v2-fl">الاسم <input type="text" class="v2-fi" id="m-rep-name" placeholder="الاسم الكامل" required></label>
        <label class="v2-fl">رقم الهاتف <input type="tel" class="v2-fi" id="m-rep-phone" placeholder="01XXXXXXXXX" dir="ltr" required></label>
        <label class="v2-fl">المنطقة <input type="text" class="v2-fi" id="m-rep-region" placeholder="المنطقة / المدينة"></label>
        <label class="v2-fl">مسؤول البيع التابع له
          <select class="v2-fi" id="m-rep-manager">
            <option value="">— بدون مدير —</option>
            ${managers.map(m => `<option value="${m.id}">${_e(m.full_name)}${m.region_name ? ` (${_e(m.region_name)})` : ''}</option>`).join('')}
          </select>
        </label>
        <label class="v2-fl" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" class="v2-fi-chk" id="m-rep-active" checked> نشط</label>
      </div>
    </div>
    <div class="v2-modal-actions">
      <button class="v2-btn v2-btn-cancel" id="m-add-rep-cancel">إلغاء</button>
      <button class="v2-btn v2-btn-primary" id="m-add-rep-confirm">â‍• إنشاء الحساب</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#m-add-rep-x')?.addEventListener('click', close);
  overlay.querySelector('#m-add-rep-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#m-add-rep-confirm')?.addEventListener('click', async () => {
    const name = document.getElementById('m-rep-name')?.value.trim();
    const phone = document.getElementById('m-rep-phone')?.value.trim();
    const region = document.getElementById('m-rep-region')?.value.trim();
    const managerId = document.getElementById('m-rep-manager')?.value;
    const isActive = document.getElementById('m-rep-active')?.checked;

    if (!name) { alert('يرجى إدخال الاسم'); return; }
    if (!phone || !/^01\d{9}$/.test(phone)) { alert('يرجى إدخال رقم هاتف صحيح (01XXXXXXXXX)'); return; }

    const btn = overlay.querySelector('#m-add-rep-confirm');
    btn.disabled = true; btn.textContent = 'جاري الإنشاء...';

    try {
      // 1. Generate employee code
      const code = 'REP-' + Date.now().toString(36).toUpperCase();
      // 2. Create employee record
      const empBody = {
        employee_code: code,
        full_name: name,
        phone: phone,
        region_name: region || null,
        is_active: isActive !== false,
      };
      const empR = await fetch(`${API}/employees`, {
        method: 'POST',
        headers: { ..._h(), Prefer: 'return=representation' },
        body: JSON.stringify(empBody),
      });
      if (!empR.ok) throw new Error('فشل إنشاء المندوب');
      const newEmp = await empR.json();

      // 3. If manager selected, create hierarchy link
      if (managerId && newEmp.id) {
        await fetch(`${API}/employee_hierarchy`, {
          method: 'POST',
          headers: _h(),
          body: JSON.stringify({
            employee_id: newEmp.id,
            manager_employee_id: managerId,
            is_active: true,
          }),
        });
      }

      // 4. Assign default role (sales_rep)
      // First find the sales_rep role
      const rolesR = await fetch(`${API}/roles?role_code=eq.sales_rep&select=id`, { headers: _h() });
      const roles = rolesR.ok ? await rolesR.json() : [];
      const salesRepRole = roles[0];
      if (salesRepRole) {
        await fetch(`${API}/employee_roles`, {
          method: 'POST',
          headers: _h(),
          body: JSON.stringify({
            employee_id: newEmp.id,
            role_id: salesRepRole.id,
            is_active: true,
          }),
        });
      }

      close();
      _load(container, true).catch(e => console.error('[v2] reps reload after add', e));
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'â‍• إنشاء الحساب';
      alert('فشل إنشاء المندوب: ' + err.message);
    }
  });
}

function _rankRow(e, rank) {
  const badge = rank <= 3 ? `<span class="v2-rpr-rank-badge v2-rpr-rank-badge-${rank}">${['🥇','🥈','🥉'][rank - 1]}</span>` : `<span class="v2-rpr-rank-num">${rank}</span>`;
  const lastAct = e._stats.lastDate ? _d(e._stats.lastDate) : '—';
  const pct = e._visits.visits > 0 ? Math.round((e._visits.completed / e._visits.visits) * 100) : 0;
  return `<tr class="v2-rpr-tbl-row">
    <td class="v2-rpr-tbl-rank">${badge}</td>
    <td><a href="#ops/reps/${e.id}" class="v2-rpr-tbl-name">${_e(e.full_name)}</a></td>
    <td>${_e(e.region_name || '—')}</td>
    <td class="v2-rpr-tbl-num">${_money(e._stats.total)}</td>
    <td class="v2-rpr-tbl-num">${e._stats.count}</td>
    <td class="v2-rpr-tbl-num">${e._visits.visits}</td>
    <td class="v2-rpr-tbl-num">${e._custCount}</td>
    <td><span class="v2-rpr-pct ${pct >= 70 ? 'v2-rpr-pct-high' : pct >= 40 ? 'v2-rpr-pct-mid' : 'v2-rpr-pct-low'}">${pct}%</span></td>
    <td class="v2-rpr-tbl-num" style="font-size:11px;color:#6b7280">${lastAct}</td>
  </tr>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }

