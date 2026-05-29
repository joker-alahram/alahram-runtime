import { readConfig } from '../../../config.js';
import { getSession } from '../../../auth/sessionService.js';
import { formatStatus } from '../../../services/storefront/invoicesApi.js';
import { getVisits, formatDuration, visitStatusIcon } from '../../../services/storefront/visitsApi.js';
import { setSelectedCustomer, setCustomerJustSelected } from '../../../services/storefront/cartApi.js';
import { showVisitStart } from '../components/activeVisitWorkspace.js';
import { getIdentity, buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';
import { orderListSelect } from '../../../services/contracts/orders.contract.js';
import { customerDetailSelect } from '../../../services/contracts/customers.contract.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

export async function renderCustomerDetailPage(container, params) {
  const cid = params.customerId;
  if (!cid) { container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>معرف العميل غير صالح</p></div></div>'; return; }

  container.innerHTML = '<div class="v2-page"><div class="v2-loading">جاري تحميل مساحة العميل...</div></div>';
  try {
    const actorParam = buildOrderScopeFilter();
    const [custArr, orders] = await Promise.all([
      fetch(`${API}/runtime_customer_visibility?id=eq.${cid}&select=${customerDetailSelect()}${actorParam ? '&' + actorParam : ''}`, { headers: _h() }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/runtime_order_visibility?customer_id=eq.${cid}&select=${orderListSelect()}&order=created_at.desc&limit=50${actorParam ? '&' + actorParam : ''}`, { headers: _h() }).then(r => r.ok ? r.json() : []),
    ]);
    if (!custArr.length) throw new Error('not_found');
    const cust = custArr[0];

    const totalSpent = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const lastOrder = orders.length ? orders[0] : null;
    const avgOrder = orders.length ? totalSpent / orders.length : 0;
    const active = cust.is_active !== false;
    const ses = getSession();

    // Get visits for this customer from local storefront visits
    const allVisits = getVisits().filter(v => v.customer_id === cid);
    const totalVisits = allVisits.length;
    const lastVisit = allVisits.length ? allVisits[0] : null;
    const totalCollections = allVisits.reduce((s, v) => s + (v.total_collected_amount || 0), 0);
    const visitCount = allVisits.length;

    // Build combined timeline
    const timeline = [];
    for (const o of orders) {
      timeline.push({ type: 'order', id: o.id, title: `فاتورة ${o.order_number || ''}`, amount: o.total_amount, status: o.order_status, ts: o.created_at });
    }
    for (const v of allVisits) {
      timeline.push({ type: 'visit', id: v.id, title: `زيارة ${visitStatusIcon(v.status)}`, status: v.status, ts: v.opened_at, dur: v.duration_ms });
      for (const c of (v.collections || [])) {
        timeline.push({ type: 'collection', title: `تحصيل ${_money(c.amount)}`, ts: c.timestamp, method: c.method });
      }
    }
    timeline.sort((a, b) => new Date(b.ts) - new Date(a.ts));

    const phoneDigits = (cust.phone || '').replace(/^0|\D/g, '');
    const identity = getIdentity();
    const isEmployee = identity?.actorType === 'employee';

    container.innerHTML = `<div class="v2-cw">
      <nav class="v2-cw-nav"><a href="#customers" class="v2-cw-back">← العملاء</a></nav>

      <!-- Profile Header -->
      <div class="v2-cw-header">
        <div class="v2-cw-avatar">${_e((cust.customer_name || '?')[0])}</div>
        <div class="v2-cw-h-body">
          <div class="v2-cw-name">${_e(cust.customer_name)}</div>
          ${cust.phone ? `<div class="v2-cw-phone">📞 ${_e(cust.phone)}</div>` : ''}
          ${cust.address ? `<div class="v2-cw-addr">📍 ${_e(cust.address)}</div>` : ''}
          <div class="v2-cw-meta">
            <span class="v2-cw-badge ${active ? 'v2-cw-badge-on' : 'v2-cw-badge-off'}">${active ? 'نشط' : 'غير نشط'}</span>
            ${lastOrder ? `<span class="v2-cw-badge v2-cw-badge-info">آخر طلب ${_d(lastOrder.created_at)}</span>` : ''}
            ${lastVisit ? `<span class="v2-cw-badge v2-cw-badge-info">آخر زيارة ${_d(lastVisit.opened_at)}</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="v2-cw-stats">
        <div class="v2-cw-stat"><div class="v2-cw-stat-val">${_money(totalSpent)}</div><div class="v2-cw-stat-lbl">إجمالي المشتريات</div></div>
        <div class="v2-cw-stat"><div class="v2-cw-stat-val">${orders.length}</div><div class="v2-cw-stat-lbl">الفواتير</div></div>
        <div class="v2-cw-stat"><div class="v2-cw-stat-val">${_money(avgOrder)}</div><div class="v2-cw-stat-lbl">متوسط الفاتورة</div></div>
        <div class="v2-cw-stat"><div class="v2-cw-stat-val">${_money(totalCollections)}</div><div class="v2-cw-stat-lbl">التحصيلات</div></div>
        <div class="v2-cw-stat"><div class="v2-cw-stat-val">${visitCount}</div><div class="v2-cw-stat-lbl">الزيارات</div></div>
        ${lastOrder ? `<div class="v2-cw-stat"><div class="v2-cw-stat-val">${_money(Number(lastOrder.total_amount || 0))}</div><div class="v2-cw-stat-lbl">آخر فاتورة</div></div>` : ''}
      </div>

      <!-- Quick Actions -->
      <div class="v2-cw-actions">
        ${isEmployee ? `<button class="v2-cw-action v2-cw-action-primary" data-q="visit">📋 فتح زيارة</button>` : ''}
        ${isEmployee ? `<button class="v2-cw-action" data-q="invoice">📄 إنشاء فاتورة</button>` : ''}
        <a href="#invoices?customer=${cid}" class="v2-cw-action v2-cw-action-outline">📋 الفواتير</a>
        <a href="tel:${_e(cust.phone || '')}" class="v2-cw-action v2-cw-action-outline">📞 اتصال</a>
        ${phoneDigits ? `<a href="https://wa.me/${phoneDigits}" target="_blank" class="v2-cw-action v2-cw-action-outline" style="color:#25d366;border-color:#25d366">📱 واتساب</a>` : ''}
      </div>

      <!-- Timeline -->
      <div class="v2-cw-card">
        <div class="v2-cw-card-title">📋 النشاطات</div>
        <div class="v2-cw-tl">
          ${timeline.length ? timeline.slice(0, 30).map(t => _tlItem(t)).join('') : '<div class="v2-cw-tl-empty">لا توجد نشاطات</div>'}
        </div>
      </div>
    </div>`;

    _bindQuickActions(container, cid, cust.customer_name, cust.phone, cust.address);
  } catch {
    container.innerHTML = '<div class="v2-page"><div class="v2-empty"><p>فشل تحميل بيانات العميل</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderCustomerDetailPage(container, params));
  }
}

function _bindQuickActions(container, cid, cname, cphone, caddress) {
  container.querySelectorAll('[data-q]').forEach(el => {
    el.addEventListener('click', () => {
      const q = el.dataset.q;
      if (q === 'visit') {
        showVisitStart(cid, cname, cphone, caddress || '');
      } else if (q === 'invoice') {
        setSelectedCustomer({ id: cid, name: cname });
        setCustomerJustSelected(cname);
        location.hash = '#products';
      }
    });
  });
}

function _tlItem(t) {
  const ts = new Date(t.ts);
  const dateStr = ts.toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' });
  const timeStr = ts.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });

  if (t.type === 'order') {
    return `<a href="#invoices/${t.id}" class="v2-cw-tl-item">
      <span class="v2-cw-tl-icon v2-cw-tl-icon-order">📄</span>
      <div class="v2-cw-tl-body">
        <div class="v2-cw-tl-title">${_e(t.title)}</div>
        <div class="v2-cw-tl-detail">${_money(t.amount)} · ${formatStatus(t.status)}</div>
        <div class="v2-cw-tl-time">${dateStr} ${timeStr}</div>
      </div>
    </a>`;
  }
  if (t.type === 'visit') {
    const dur = t.status === 'active' ? 'جارية' : formatDuration(t.dur);
    return `<a href="#visits/${t.id}" class="v2-cw-tl-item">
      <span class="v2-cw-tl-icon v2-cw-tl-icon-visit">📋</span>
      <div class="v2-cw-tl-body">
        <div class="v2-cw-tl-title">${_e(t.title)}</div>
        <div class="v2-cw-tl-detail">${dur}</div>
        <div class="v2-cw-tl-time">${dateStr} ${timeStr}</div>
      </div>
    </a>`;
  }
  if (t.type === 'collection') {
    return `<div class="v2-cw-tl-item">
      <span class="v2-cw-tl-icon v2-cw-tl-icon-collect">💰</span>
      <div class="v2-cw-tl-body">
        <div class="v2-cw-tl-title">${_e(t.title)}</div>
        <div class="v2-cw-tl-detail">${t.method === 'cash' ? 'نقداً' : t.method === 'card' ? 'بطاقة' : t.method === 'bank' ? 'تحويل' : 'محفظة'}</div>
        <div class="v2-cw-tl-time">${dateStr} ${timeStr}</div>
      </div>
    </div>`;
  }
  return '';
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return '0 ج.م'; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _d(d) { if (!d) return ''; return new Date(d).toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric' }); }
