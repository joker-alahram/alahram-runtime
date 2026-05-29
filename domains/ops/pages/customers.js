import { logError } from '../../../utils/logger.js';
import { getSession, hasCapability } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { showModal, confirmDelete, apiPost, apiPatch, apiDelete, addStyles } from './crudHelper.js';
import { scopeCustomerIds, buildOrderScopeFilter, buildVisitScopeFilter, getIdentity } from '../../../services/storefront/governanceRuntime.js';
import { visitSelectFields, normalizeVisits } from '../../../services/contracts/visits.contract.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';
import { customerListSelect } from '../../../services/contracts/customers.contract.js';

function _h() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

async function _fetch(path) {
  const r = await fetch(`${readConfig().baseUrl}/${path}`, { headers: _h() });
  if (!r.ok) throw new Error('فشل التحميل');
  return r.json();
}

let _container = null;
let _allCustomers = [];
let _allOrders = [];
let _allVisits = [];
let _allAssign = [];
let _empLookup = {};
let _canEdit = false;

export async function renderOpsCustomers(container) {
  addStyles();
  _container = container;
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري تحميل العملاء...</div></div>';

  try {
    _canEdit = getIdentity()?.isAdmin || String(getSession()?.role?.roleCode || '').toUpperCase() === 'SUPER_ADMIN' || await hasCapability('can_manage_system').catch(() => false);
    await _load();
    _render('');
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل العملاء</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsCustomers(container));
  }
}

async function _load() {
  const ids = await scopeCustomerIds();
  let filterStr;
  if (ids === null) {
    filterStr = '';
  } else if (ids.length === 1) {
    filterStr = `&id=eq.${ids[0]}`;
  } else if (ids.length) {
    filterStr = `&id=in.(${ids.join(',')})`;
  } else {
    _allCustomers = [];
    _allOrders = [];
    _allVisits = [];
    _allAssign = [];
    _empLookup = {};
    return;
  }

  const orderScope = buildOrderScopeFilter();
  const visitScope = buildVisitScopeFilter();
  const [customers, allOrders, allVisits, allAssign, employees] = await Promise.all([
    _fetch(`runtime_customer_visibility?select=${customerListSelect()}&order=customer_name.asc&limit=200${filterStr}${orderScope ? '&' + orderScope : ''}`),
    _fetch(`runtime_order_visibility?select=${orderListSelect()}${filterStr ? '&' + filterStr.replace('id=in.(', 'customer_id=in.(').replace('id=eq.', 'customer_id=eq.') : ''}${orderScope ? '&' + orderScope : ''}&order=created_at.desc`),
    _fetch(`runtime_visits_with_maps?select=${visitSelectFields()}&order=check_in_time.desc.nullslast&limit=500${visitScope ? '&' + visitScope : ''}`).catch(() => []),
    _fetch(`customer_assignments?select=employee_id,customer_id,assignment_role,is_active`).catch(() => []),
    _fetch(`employees?select=id,full_name,employee_code&is_active=eq.true`).catch(() => []),
  ]);

  _allCustomers = customers.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  _allOrders = allOrders;
  _allVisits = normalizeVisits(allVisits);
  _allAssign = allAssign;
  _empLookup = {};
  for (const e of employees) _empLookup[e.id] = e;
}

function _render(filter) {
  const q = (filter || '').toLowerCase();
  const filtered = _allCustomers.filter(c =>
    (c.customer_name || '').toLowerCase().includes(q) ||
    (c.phone || '').includes(q)
  );

  _container.innerHTML = `<div class="v2-ops-page">
    <div class="v2-occ-bar">
      <h2 class="v2-occ-title">👤 العملاء</h2>
      <span class="v2-occ-count">${_allCustomers.length}</span>
      ${_canEdit ? '<button class="v2-btn v2-btn-primary v2-occ-add">+ إضافة عميل</button>' : ''}
    </div>
    <div class="v2-occ-search"><input type="text" class="v2-occ-search-inp" placeholder="🔍 بحث بالاسم أو رقم الهاتف..." value="${_e(filter || '')}"></div>
    ${filtered.length === 0 ? '<div class="v2-occ-empty">لا يوجد عملاء</div>' : `
    <div class="v2-occ-grid">${filtered.map(c => _card(c)).join('')}</div>`}
  </div>`;

  _container.querySelector('.v2-occ-add')?.addEventListener('click', () => _addCustomer());
  const inp = _container.querySelector('.v2-occ-search-inp');
  if (inp) inp.addEventListener('input', () => _render(inp.value));
}

function _card(c) {
  // Get customer orders
  const custOrders = _allOrders.filter(o => o.customer_id === c.id);
  const totalSpent = custOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const invoiceCount = custOrders.length;
  const lastOrder = custOrders.length ? custOrders[0] : null;

  // Get customer visits
  const custVisits = _allVisits.filter(v => v.customer_id === c.id);
  const lastVisit = custVisits.length ? custVisits[0] : null;
  const visitCount = custVisits.length;

  // Get assigned rep
  const assign = _allAssign.find(a => a.customer_id === c.id && a.is_active !== false);
  const rep = assign ? _empLookup[assign.employee_id] : null;

  // Segment badge based on total spent
  let segment = { label: '', cls: '' };
  if (totalSpent >= 50000) { segment = { label: 'VIP', cls: 'v2-occ-seg-vip' }; }
  else if (totalSpent >= 20000) { segment = { label: 'ذهبي', cls: 'v2-occ-seg-gold' }; }
  else if (totalSpent >= 5000) { segment = { label: 'فضي', cls: 'v2-occ-seg-silver' }; }
  else if (totalSpent > 0) { segment = { label: 'عادي', cls: 'v2-occ-seg-regular' }; }
  else { segment = { label: 'جديد', cls: 'v2-occ-seg-new' }; }

  const active = c.is_active !== false;

  return `<a href="#ops/customers/${c.id}" class="v2-occ-card">
    <div class="v2-occ-card-top">
      <div class="v2-occ-avatar">${_e((c.customer_name || '?')[0])}</div>
      <div class="v2-occ-card-h">
        <div class="v2-occ-card-name">${_e(c.customer_name)}</div>
        <div class="v2-occ-card-meta">
          <span class="v2-occ-badge ${active ? 'v2-occ-badge-on' : 'v2-occ-badge-off'}">${active ? 'نشط' : 'غير نشط'}</span>
          ${segment.label ? `<span class="v2-occ-seg ${segment.cls}">${segment.label}</span>` : ''}
        </div>
      </div>
      <div class="v2-occ-card-amount">${_money(totalSpent)}</div>
    </div>

    <div class="v2-occ-card-body">
      <div class="v2-occ-card-info">
        <span>📞 ${_e(c.phone || '—')}</span>
        <span>📍 ${_e(c.address || '—')}</span>
      </div>

      <div class="v2-occ-card-stats">
        <div class="v2-occ-stat"><span class="v2-occ-stat-val">${invoiceCount}</span><span class="v2-occ-stat-lbl">فواتير</span></div>
        <div class="v2-occ-stat"><span class="v2-occ-stat-val">${visitCount}</span><span class="v2-occ-stat-lbl">زيارات</span></div>
        <div class="v2-occ-stat"><span class="v2-occ-stat-val">${_money(totalSpent)}</span><span class="v2-occ-stat-lbl">إجمالي</span></div>
      </div>

      <div class="v2-occ-card-footer">
        ${rep ? `<span class="v2-occ-rep">🧑‍💼 ${_e(rep.full_name)}</span>` : '<span class="v2-occ-rep v2-occ-rep-none">— بدون مندوب</span>'}
        ${lastOrder ? `<span class="v2-occ-date">📅 ${_d(lastOrder.created_at)}</span>` : ''}
        ${lastVisit ? `<span class="v2-occ-date">📋 ${_d(lastVisit.check_in_time)}</span>` : ''}
      </div>
    </div>

    ${_canEdit ? `<div class="v2-occ-card-actions">
      <span class="v2-occ-action-edit" data-id="${c.id}" onclick="event.stopPropagation();event.target.closest('.v2-occ-card').dispatchEvent(new CustomEvent('edit-cust',{detail:'${c.id}'}))">تعديل</span>
      ${rep ? `<span class="v2-occ-action-reassign" data-id="${c.id}" onclick="event.stopPropagation();event.target.closest('.v2-occ-card').dispatchEvent(new CustomEvent('reassign-cust',{detail:'${c.id}'}))">إعادة ربط</span>` : ''}
    </div>` : ''}
  </a>`;
}

async function _addCustomer() {
  // Fetch employees for rep assignment
  let employees = [];
  try {
    employees = await _fetch(`employees?select=id,full_name&is_active=eq.true&order=full_name.asc`);
  } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }

  showModal('â‍• إضافة عميل جديد', [
    { key: 'customer_name', label: 'الاسم', required: true },
    { key: 'phone', label: 'رقم الهاتف', type: 'tel' },
    { key: 'address', label: 'العنوان' },
    { key: 'region', label: 'المنطقة' },
    { key: 'is_active', label: 'نشط', type: 'checkbox', default: 'true' },
  ], null, async vals => {
    const newCust = await apiPost('customers', vals);
    // After creation, prompt for rep assignment
    if (newCust && newCust.id && employees.length > 0) {
      _promptAssign(newCust.id, employees);
    }
    await _load();
    _render('');
  }, { noAutoClose: true });
}

function _promptAssign(customerId, employees) {
  const overlay = document.createElement('div');
  overlay.className = 'v2-modal-overlay';
  overlay.innerHTML = `<div class="v2-modal v2-modal-sm">
    <div class="v2-modal-h"><h3>🔄 ربط العميل بمندوب</h3><button class="v2-modal-x" id="m-assign-x">âœ•</button></div>
    <div class="v2-modal-f">
      <p style="font-size:13px;color:#6b7280;margin:0 0 12px">اختر المندوب المسؤول عن هذا العميل</p>
      <select class="v2-fi" id="m-assign-select">
        <option value="">— بدون مندوب —</option>
        ${employees.map(e => `<option value="${e.id}">${_e(e.full_name)}</option>`).join('')}
      </select>
    </div>
    <div class="v2-modal-actions">
      <button class="v2-btn v2-btn-cancel" id="m-assign-skip">تخطي</button>
      <button class="v2-btn v2-btn-primary" id="m-assign-confirm">تأكيد الربط</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#m-assign-x')?.addEventListener('click', close);
  overlay.querySelector('#m-assign-skip')?.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('#m-assign-confirm')?.addEventListener('click', async () => {
    const empId = document.getElementById('m-assign-select')?.value;
    if (empId) {
      try {
        await apiPost('customer_assignments', {
          customer_id: customerId,
          employee_id: empId,
          assignment_role: 'owner',
          is_primary: true,
          is_active: true,
        });
      } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
    }
    close();
  });
}

function _editCustomer(custId) {
  const cust = _allCustomers.find(c => c.id === custId);
  if (!cust) return;

  showModal('تعديل العميل', [
    { key: 'customer_name', label: 'الاسم', required: true },
    { key: 'phone', label: 'رقم الهاتف', type: 'tel' },
    { key: 'address', label: 'العنوان' },
    { key: 'region', label: 'المنطقة' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
  ], cust, async vals => {
    await apiPatch('customers', cust.id, vals);
    await _load();
    _render('');
  });
}

function _reassignCustomer(custId) {
  const cust = _allCustomers.find(c => c.id === custId);
  if (!cust) return;

  const currentAssign = _allAssign.find(a => a.customer_id === custId && a.is_active !== false);
  const currentRepId = currentAssign?.employee_id;
  const currentRep = currentRepId ? _empLookup[currentRepId] : null;

  // Fetch available employees for reassignment
  _fetch(`employees?select=id,full_name,region_name&is_active=eq.true&order=full_name.asc`).then(employees => {
    const overlay = document.createElement('div');
    overlay.className = 'v2-modal-overlay';
    overlay.innerHTML = `<div class="v2-modal">
      <div class="v2-modal-h"><h3>🔄 إعادة ربط العميل</h3><button class="v2-modal-x" id="m-reassign-x">âœ•</button></div>
      <div class="v2-modal-f">
        <p style="font-size:13px;color:#6b7280;margin:0 0 4px"><strong>${_e(cust.customer_name)}</strong></p>
        ${currentRep ? `<p style="font-size:12px;color:#6b7280;margin:0 0 12px">الحالي: ${_e(currentRep.full_name)}</p>` : ''}
        <label class="v2-fl">المندوب الجديد
          <select class="v2-fi" id="m-reassign-select">
            <option value="">— اختر المندوب —</option>
            ${employees.map(e => `<option value="${e.id}" ${e.id === currentRepId ? 'disabled' : ''}>${_e(e.full_name)}${e.region_name ? ` (${_e(e.region_name)})` : ''}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="v2-modal-actions">
        <button class="v2-btn v2-btn-cancel" id="m-reassign-cancel">إلغاء</button>
        <button class="v2-btn v2-btn-primary" id="m-reassign-confirm">تأكيد إعادة الربط</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#m-reassign-x')?.addEventListener('click', close);
    overlay.querySelector('#m-reassign-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#m-reassign-confirm')?.addEventListener('click', async () => {
      const newEmpId = document.getElementById('m-reassign-select')?.value;
      if (!newEmpId) { alert('يرجى اختيار مندوب'); return; }
      const btn = overlay.querySelector('#m-reassign-confirm');
      btn.disabled = true; btn.textContent = 'جاري...';
      try {
        // Deactivate old assignment
        if (currentAssign) {
          await fetch(`${readConfig().baseUrl}/customer_assignments?customer_id=eq.${custId}&employee_id=eq.${currentRepId}`, {
            method: 'PATCH',
            headers: _h(),
            body: JSON.stringify({ is_active: false }),
          });
        }
        // Create new assignment
        await apiPost('customer_assignments', {
          customer_id: custId,
          employee_id: newEmpId,
          assignment_role: 'owner',
          is_primary: true,
          is_active: true,
        });
        close();
        await _load();
        _render('');
      } catch (err) {
        btn.disabled = false; btn.textContent = 'تأكيد إعادة الربط';
        alert('فشل إعادة الربط: ' + err.message);
      }
    });
  });
}

// Handle custom events from cards
document.addEventListener('edit-cust', e => {
  if (_container?.contains(e.target)) _editCustomer(e.detail);
});
document.addEventListener('reassign-cust', e => {
  if (_container?.contains(e.target)) _reassignCustomer(e.detail);
});

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }

