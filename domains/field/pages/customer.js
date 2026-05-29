import { readConfig } from '../../../config.js';
import { buildOrderScopeFilter, buildVisitScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { visitSelectFields, normalizeVisits } from '../../../services/contracts/visits.contract.js';
import { customerDetailSelect } from '../../../services/contracts/customers.contract.js';

export async function renderFieldCustomer(container, params) {
  const customerId = params?.customerId;
  if (!customerId) {
    container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-error"><p>معرف العميل غير موجود</p><a href="#field/customers">العودة</a></div></div>';
    return;
  }

  container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-loading">جاري التحميل...</div></div>';

  let customer, visits;
  try {
    const API = readConfig().baseUrl;
    const headers = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
    const orderScope = buildOrderScopeFilter();
    const visitScope = buildVisitScopeFilter();
    const [cr, vr] = await Promise.all([
      fetch(`${API}/runtime_customer_visibility?select=${customerDetailSelect()}&id=eq.${customerId}${orderScope ? '&' + orderScope : ''}`, { headers }),
      fetch(`${API}/runtime_visits_with_maps?select=${visitSelectFields()}&customer_id=eq.${customerId}&order=check_in_time.desc.nullslast&limit=5${visitScope ? '&' + visitScope : ''}`, { headers }),
    ]);
    const cdata = await cr.json();
    customer = Array.isArray(cdata) ? cdata[0] : cdata;
    visits = normalizeVisits(await vr.json());
  } catch {
    container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-error"><p>فشل تحميل بيانات العميل</p><a href="#field/customers" class="v2-retry">العودة</a></div></div>';
    return;
  }

  if (!customer) {
    container.innerHTML = '<div class="v2-fv-d"><div class="v2-fv-error"><p>العميل غير موجود</p><a href="#field/customers">العودة</a></div></div>';
    return;
  }

  const el = container.querySelector('.v2-fv-d');
  if (!el) return;
  el.innerHTML = `
    <a href="#field/customers" class="v2-fv-back">← العودة</a>
    <div class="v2-fv-dh">
      <h2 class="v2-fv-dc">${_e(customer.customer_name)}</h2>
      ${customer.is_active ? '<span class="v2-cust-active">نشط</span>' : '<span class="v2-cust-inactive">غير نشط</span>'}
    </div>
    <div class="v2-fv-di">
      ${customer.phone ? `<div><span class="v2-fv-lbl">الهاتف:</span> ${_e(customer.phone)}</div>` : ''}
      ${customer.address ? `<div><span class="v2-fv-lbl">العنوان:</span> ${_e(customer.address)}</div>` : ''}
      ${customer.customer_type ? `<div><span class="v2-fv-lbl">النوع:</span> ${_e(customer.customer_type)}</div>` : ''}
    </div>
    <div class="v2-dash-actions">
      <a href="#field/visits" class="v2-dash-btn">بدء زيارة</a>
      <a href="#field/orders" class="v2-dash-btn">عرض الطلبات</a>
      <a href="#field/customers/${customerId}" class="v2-dash-btn">تعديل البيانات</a>
    </div>
    <div class="v2-fv-evts"><h3>آخر الزيارات</h3>${visits.length === 0 ? '<p>لا توجد زيارات سابقة</p>' : visits.map(v => _visitCard(v)).join('')}</div>
  `;
}

function _visitCard(v) {
  const s = v.visit_status || 'scheduled';
  const icon = s === 'completed' ? '✅' : s === 'open' ? '🟢' : s === 'cancelled' ? '❌' : '📋';
  const lbl = s === 'completed' ? 'مكتملة' : s === 'open' ? 'قيد التنفيذ' : s === 'cancelled' ? 'ملغية' : 'مجدولة';
  return `<a href="#field/visits/${v.id}" class="v2-fv-card">
    <div class="v2-fv-ch"><span>${_dt(v.created_at)}</span><span>${icon} ${lbl}</span></div>
    ${v.check_in_time ? `<div class="v2-fv-time">${_t(v.check_in_time)}${v.check_out_time ? ` - ${_t(v.check_out_time)}` : ''}</div>` : ''}
  </a>`;
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); }
function _t(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); }
