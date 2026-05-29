import { logError } from '../../../utils/logger.js';
import { getSession, hasCapability } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { showModal, confirmDelete, apiPatch, apiDelete, apiPost, addStyles } from './crudHelper.js';
import { buildOrderScopeFilter, buildVisitScopeFilter, getIdentity } from '../../../services/storefront/governanceRuntime.js';
import { visitSelectFields, normalizeVisits } from '../../../services/contracts/visits.contract.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';
import { customerDetailSelect } from '../../../services/contracts/customers.contract.js';
import { fetchEmployeeIdentityByFilter } from '../../../services/contracts/employeeProjectionService.js';

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

function _api(method, path, body) {
  return fetch(`${readConfig().baseUrl}/${path}`, {
    method, headers: _h(), body: body ? JSON.stringify(body) : undefined,
  });
}

let _canEdit = false;

export async function renderOpsCustomer(container, params) {
  const { customerId } = params;
  if (!customerId) { container.innerHTML = '<div class="v2-ops-page"><p>معرف العميل غير موجود</p><a href="#ops/customers">العودة للعملاء</a></div>'; return; }

  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري تحميل بيانات العميل...</div></div>';
  try {
    addStyles();
    _canEdit = getIdentity()?.isAdmin || String(getSession()?.role?.roleCode || '').toUpperCase() === 'SUPER_ADMIN' || await hasCapability('can_manage_system').catch(() => false);
    const orderScope = buildOrderScopeFilter();
    const visitScope = buildVisitScopeFilter();

    const [custArr, orders, custAssign, allEmployees, visits] = await Promise.all([
      _fetch(`runtime_customer_visibility?select=${customerDetailSelect()}&id=eq.${customerId}${orderScope ? '&' + orderScope : ''}`),
      _fetch(`runtime_order_visibility?select=${orderListSelect()}&customer_id=eq.${customerId}&order=created_at.desc&limit=100${orderScope ? '&' + orderScope : ''}`),
      _fetch(`customer_assignments?select=employee_id,customer_id,assignment_role,is_active,assigned_at&customer_id=eq.${customerId}`),
      _fetch(`employees?select=id,full_name,employee_code,region_name&is_active=eq.true`),
      _fetch(`runtime_visits_with_maps?customer_id=eq.${customerId}&select=${visitSelectFields()}&order=check_in_time.desc.nullslast&limit=50${visitScope ? '&' + visitScope : ''}`).catch(() => []),
    ]);
    const cust = custArr[0];
    if (!cust) throw new Error('العميل غير موجود');

    const allVisits = normalizeVisits(visits);

    const activeAssign = custAssign.find(a => a.is_active !== false);
    const empLookup = {};
    for (const e of allEmployees) empLookup[e.id] = e;
    const rep = activeAssign ? empLookup[activeAssign.employee_id] : null;

    const totalSales = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const invoiceCount = orders.length;
    const avgOrder = invoiceCount ? totalSales / invoiceCount : 0;

    let topProducts = [];
    let frequentProducts = [];
    if (orders.length > 0) {
      try {
        const items = await _fetch(`order_items?select=product_id,product_name_snapshot,quantity,final_price,total_amount&order_id=in.(${orders.map(o => o.id).join(',')})&limit=200`).catch(() => []);
        const prodMap = {};
        for (const item of items) {
          const key = item.product_id || item.product_name_snapshot;
          if (!prodMap[key]) prodMap[key] = { name: item.product_name_snapshot || key, qty: 0, total: 0, count: 0 };
          prodMap[key].qty += Number(item.quantity || 0);
          prodMap[key].total += Number(item.total_amount || 0);
          prodMap[key].count += 1;
        }
        const prods = Object.values(prodMap);
        topProducts = prods.sort((a, b) => b.total - a.total).slice(0, 5);
        frequentProducts = prods.sort((a, b) => b.count - a.count).slice(0, 5);
      } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
    }

    let avgDaysBetween = 0;
    if (orders.length >= 2) {
      const dates = orders.map(o => new Date(o.created_at).getTime()).sort((a, b) => a - b);
      let totalDays = 0;
      for (let i = 1; i < dates.length; i++) totalDays += (dates[i] - dates[i - 1]) / 86400000;
      avgDaysBetween = totalDays / (dates.length - 1);
    }

    const lastOrder = orders.length ? orders[0] : null;
    const lastVisit = allVisits.length ? allVisits[0] : null;
    const visitCount = allVisits.length;

    const daysSinceLastOrder = lastOrder ? Math.floor((Date.now() - new Date(lastOrder.created_at).getTime()) / 86400000) : null;

    // === Operational Recommendations (replaces static behavior) ===
    const recommendations = _getRecommendations({ daysSinceLastOrder, invoiceCount, totalSales, avgOrder, avgDaysBetween, visitCount, lastVisit });

    let segment = {};
    if (totalSales >= 50000) segment = { label: 'VIP', cls: 'v2-occ-seg-vip' };
    else if (totalSales >= 20000) segment = { label: 'ذهبي', cls: 'v2-occ-seg-gold' };
    else if (totalSales >= 5000) segment = { label: 'فضي', cls: 'v2-occ-seg-silver' };
    else if (totalSales > 0) segment = { label: 'عادي', cls: 'v2-occ-seg-regular' };
    else segment = { label: 'جديد', cls: 'v2-occ-seg-new' };

    const active = cust.is_active !== false;

    container.innerHTML = `<div class="v2-ops-page">
      <nav style="margin-bottom:.75rem"><a href="#ops/customers" class="v2-ops-back-link">← العملاء</a></nav>

      <div class="v2-occp-header">
        <div class="v2-occp-avatar">${_e((cust.customer_name || '?')[0])}</div>
        <div class="v2-occp-h-body">
          <div class="v2-occp-h-top">
            <div class="v2-occp-name">${_e(cust.customer_name)}</div>
            <div class="v2-occp-meta">
              <span class="v2-cw-badge ${active ? 'v2-cw-badge-on' : 'v2-cw-badge-off'}">${active ? 'نشط' : 'غير نشط'}</span>
              ${segment.label ? `<span class="v2-occ-seg ${segment.cls}" style="font-size:11px;padding:2px 8px">${segment.label}</span>` : ''}
            </div>
          </div>
          <div class="v2-occp-info">
            <span>📞 ${_e(cust.phone || '—')}</span>
            <span>📍 ${_e(cust.address || '—')}</span>
          </div>
          <div class="v2-occp-links">
            ${rep ? `<a href="#ops/reps/${rep.id}" class="v2-occp-rep">🧑‍💼 ${_e(rep.full_name)}</a>` : '<span class="v2-occp-rep v2-occp-rep-none">— بدون مندوب</span>'}
            ${lastOrder ? `<span class="v2-occp-date">📅 آخر طلب: ${_d(lastOrder.created_at)}</span>` : ''}
          </div>
        </div>
        ${_canEdit ? `<div class="v2-occp-actions">
          <button class="v2-btn v2-btn-sm v2-btn-primary" id="oc-edit">تعديل</button>
          <button class="v2-btn v2-btn-sm v2-btn-danger" id="oc-del">حذف</button>
        </div>` : ''}
      </div>

      <div class="v2-occp-stats-row">
        <div class="v2-occp-stat"><span class="v2-occp-stat-val">${_money(totalSales)}</span><span class="v2-occp-stat-lbl">إجمالي المبيعات</span></div>
        <div class="v2-occp-stat"><span class="v2-occp-stat-val">${invoiceCount}</span><span class="v2-occp-stat-lbl">عدد الفواتير</span></div>
        <div class="v2-occp-stat"><span class="v2-occp-stat-val">${_money(avgOrder)}</span><span class="v2-occp-stat-lbl">متوسط الفاتورة</span></div>
        <div class="v2-occp-stat"><span class="v2-occp-stat-val">${visitCount}</span><span class="v2-occp-stat-lbl">الزيارات</span></div>
        <div class="v2-occp-stat"><span class="v2-occp-stat-val">${avgDaysBetween ? Math.round(avgDaysBetween) + ' ي' : '—'}</span><span class="v2-occp-stat-lbl">متوسط أيام الفواتير</span></div>
        <div class="v2-occp-stat"><span class="v2-occp-stat-val">${lastVisit ? _d(lastVisit.check_in_time) : '—'}</span><span class="v2-occp-stat-lbl">آخر زيارة</span></div>
      </div>

      <!-- Recommendations -->
      <div class="v2-occp-rec-row">${recommendations.map(r => `
        <div class="v2-occp-rec v2-occp-rec-${r.key}"><span class="v2-occp-rec-icon">${r.icon}</span><div><strong>${r.title}</strong><br><span class="v2-occp-rec-desc">${r.desc}</span></div></div>
      `).join('')}</div>

      ${_canEdit && rep ? `
      <div class="v2-occp-section">
        <div class="v2-occp-section-title">🔄 إعادة الربط</div>
        <p style="font-size:13px;color:#6b7280;margin:0 0 8px">ربط العميل بمندوب آخر ضمن النطاق المسموح</p>
        <button class="v2-btn v2-btn-sm" id="oc-reassign">تغيير المندوب</button>
      </div>` : ''}

      ${topProducts.length > 0 ? `
      <div class="v2-occp-section">
        <div class="v2-occp-section-title">📦 أكثر الأصناف شراء</div>
        <div class="v2-occp-list">${topProducts.map((p, i) => `
          <div class="v2-occp-list-item">
            <span class="v2-occp-list-l"><span class="v2-occp-rank-num">${i + 1}</span> ${_e(p.name)}</span>
            <span class="v2-occp-list-r">${_money(p.total)} <small style="color:#9ca3af">(${p.qty} وحدة)</small></span>
          </div>`).join('')}</div>
      </div>` : ''}

      ${frequentProducts.length > 0 && frequentProducts[0].name !== topProducts[0]?.name ? `
      <div class="v2-occp-section">
        <div class="v2-occp-section-title">🔄 الأكثر تكرارًا</div>
        <div class="v2-occp-list">${frequentProducts.map((p, i) => `
          <div class="v2-occp-list-item">
            <span class="v2-occp-list-l"><span class="v2-occp-rank-num">${i + 1}</span> ${_e(p.name)}</span>
            <span class="v2-occp-list-r">${p.count} مرة</span>
          </div>`).join('')}</div>
      </div>` : ''}

      <div class="v2-occp-section">
        <div class="v2-occp-section-title">📄 الفواتير (${orders.length})</div>
        ${orders.length === 0 ? '<p style="color:#6b7280;font-size:13px">لا توجد فواتير سابقة</p>' : `
        <div class="v2-occp-inv-list">${orders.slice(0, 20).map(o => `
          <a href="#ops/orders/${o.id}" class="v2-occp-inv-card">
            <div class="v2-occp-inv-top">
              <span class="v2-occp-inv-number">فاتورة ${_e(o.order_number || '—')}</span>
              <span class="v2-occp-inv-amount">${_money(o.total_amount)}</span>
            </div>
            <div class="v2-occp-inv-mid">
              <span>${_d(o.created_at)}</span>
              <span class="v2-badge ${o.order_status === 'cancelled' ? 'v2-badge-no' : o.order_status === 'delivered' ? 'v2-badge-ok' : 'v2-badge-info'}">${_e(o.order_status || '')}</span>
              ${(o.created_by_name || o.created_by_name_snapshot) ? `<span>🧑‍💼 ${_e(o.created_by_name || o.created_by_name_snapshot)}</span>` : ''}
            </div>
          </a>`).join('')}</div>`}
        ${orders.length > 20 ? `<a href="#ops/orders?customer=${customerId}" style="display:block;text-align:center;font-size:13px;color:#0052cc;margin-top:8px">عرض الكل (${orders.length})</a>` : ''}
      </div>

      <div class="v2-occp-section">
        <div class="v2-occp-section-title">📋 الزيارات (${allVisits.length})</div>
        ${allVisits.length === 0 ? '<p style="color:#6b7280;font-size:13px">لا توجد زيارات</p>' : `
        <div class="v2-occp-list">${allVisits.slice(0, 10).map(v => {
          const ds = new Date(v.check_in_time || v.created_at).toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
          const statusLabels = { active: 'نشطة', open: 'نشطة', completed: 'مكتملة', cancelled: 'ملغية' };
          const vs = v.visit_status || v.status || '';
          return `<div class="v2-occp-list-item">
            <span class="v2-occp-list-l"><span class="v2-orp-status-dot ${vs}"></span>${ds}</span>
            <span class="v2-occp-list-r">${statusLabels[vs] || vs}</span>
          </div>`;
        }).join('')}</div>`}
      </div>
    </div>`;

    if (_canEdit) {
      container.querySelector('#oc-edit')?.addEventListener('click', () => _editCustomer(cust, container, params));
      container.querySelector('#oc-del')?.addEventListener('click', () => _deleteCustomer(cust));
      container.querySelector('#oc-reassign')?.addEventListener('click', () => _reassignCustomer(cust, rep, container));
    }
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل بيانات العميل</p><a href="#ops/customers" class="v2-retry">العودة للعملاء</a></div></div>';
  }
}

function _getRecommendations({ daysSinceLastOrder, invoiceCount, totalSales, avgOrder, avgDaysBetween, visitCount, lastVisit }) {
  const recs = [];
  if (invoiceCount === 0) {
    recs.push({ key: 'visit', icon: '🆕', title: 'يحتاج زيارة', desc: 'لم يصدر أي طلب — يجب زيارته للتعريف بالمنتجات' });
  } else if (daysSinceLastOrder !== null && daysSinceLastOrder > 60) {
    recs.push({ key: 'reactivate', icon: '🐢', title: 'متوقف عن الشراء', desc: `آخر طلب منذ ${daysSinceLastOrder} يومًا — أعد التواصل` });
  } else if (daysSinceLastOrder !== null && daysSinceLastOrder > 30) {
    recs.push({ key: 'followup', icon: '📉', title: 'يحتاج متابعة', desc: `آخر طلب منذ ${daysSinceLastOrder} يومًا — فرصة لإعادة التنشيط` });
  }
  if (totalSales >= 20000 && avgOrder >= 300 && daysSinceLastOrder !== null && daysSinceLastOrder < 30) {
    recs.push({ key: 'upsell', icon: '📈', title: 'فرصة زيادة مبيعات', desc: 'عميل عالي القيمة — يمكن عرض منتجات جديدة' });
  }
  if (invoiceCount >= 5 && avgDaysBetween && avgDaysBetween >= 21) {
    recs.push({ key: 'frequency', icon: '⏰', title: 'فرصة زيادة التكرار', desc: `متوسط ${Math.round(avgDaysBetween)} يوم بين الفواتير — يمكن تقليصها` });
  }
  if (lastVisit && (Date.now() - new Date(lastVisit.check_in_time || lastVisit.created_at).getTime()) > 30 * 86400000) {
    recs.push({ key: 'visit_needed', icon: '📋', title: 'يحتاج زيارة', desc: 'آخر زيارة منذ أكثر من 30 يومًا' });
  }
  if (totalSales > 0 && invoiceCount > 0 && !recs.length) {
    recs.push({ key: 'stable', icon: 'âœ…', title: 'نشاط طبيعي', desc: 'العميل منتظم — حافظ على التواصل' });
  }
  return recs.length ? recs : [{ key: 'new', icon: '🆕', title: 'عميل جديد', desc: 'لم يصدر أي طلب بعد' }];
}

function _editCustomer(cust, container, params) {
  showModal('تعديل بيانات العميل', [
    { key: 'customer_name', label: 'الاسم', required: true },
    { key: 'phone', label: 'رقم الهاتف', type: 'tel' },
    { key: 'address', label: 'العنوان' },
    { key: 'region', label: 'المنطقة' },
    { key: 'is_active', label: 'نشط', type: 'checkbox' },
  ], cust, async vals => {
    await apiPatch('customers', cust.id, vals);
    renderOpsCustomer(container, params);
  });
}

function _deleteCustomer(cust) {
  confirmDelete(`حذف العميل "${cust.customer_name}"؟`).then(ok => {
    if (!ok) return;
    apiDelete('customers', cust.id).then(() => { location.hash = '#ops/customers'; });
  });
}

function _reassignCustomer(cust, currentRep, container) {
  _fetch(`employees?select=id,full_name,region_name&is_active=eq.true&order=full_name.asc`).then(employees => {
    const overlay = document.createElement('div');
    overlay.className = 'v2-modal-overlay';
    overlay.innerHTML = `<div class="v2-modal">
      <div class="v2-modal-h"><h3>🔄 إعادة ربط العميل</h3><button class="v2-modal-x" id="m-re-x">âœ•</button></div>
      <div class="v2-modal-f">
        <p style="font-size:13px;margin:0 0 4px"><strong>${_e(cust.customer_name)}</strong></p>
        ${currentRep ? `<p style="font-size:12px;color:#6b7280;margin:0 0 12px">الحالي: ${_e(currentRep.full_name)}</p>` : ''}
        <label class="v2-fl">المندوب الجديد
          <select class="v2-fi" id="m-re-select"><option value="">— اختر المندوب —</option>
          ${employees.map(e => `<option value="${e.id}">${_e(e.full_name)}${e.region_name ? ` (${_e(e.region_name)})` : ''}</option>`).join('')}
          </select></label>
      </div>
      <div class="v2-modal-actions">
        <button class="v2-btn v2-btn-cancel" id="m-re-cancel">إلغاء</button>
        <button class="v2-btn v2-btn-primary" id="m-re-confirm">تأكيد إعادة الربط</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#m-re-x')?.addEventListener('click', close);
    overlay.querySelector('#m-re-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#m-re-confirm')?.addEventListener('click', async () => {
      const newEmpId = document.getElementById('m-re-select')?.value;
      if (!newEmpId) { alert('يرجى اختيار مندوب'); return; }
      const btn = overlay.querySelector('#m-re-confirm');
      btn.disabled = true; btn.textContent = 'جاري...';
      try {
        if (currentRep) {
          await _api('PATCH', `customer_assignments?customer_id=eq.${cust.id}&employee_id=eq.${currentRep.id}`, { is_active: false });
        }
        await apiPost('customer_assignments', {
          customer_id: cust.id, employee_id: newEmpId, assignment_role: 'owner', is_primary: true, is_active: true,
        });
        close();
        renderOpsCustomer(container, { customerId: cust.id });
      } catch (err) {
        btn.disabled = false; btn.textContent = 'تأكيد إعادة الربط';
        alert('فشل إعادة الربط: ' + err.message);
      }
    });
  });
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }

