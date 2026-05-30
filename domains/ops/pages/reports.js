import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { buildOrderScopeFilter } from '../../../services/storefront/governanceRuntime.js';

function _h() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return h;
}

const API = readConfig().baseUrl;

async function _fetch(url) {
  try {
    const r = await fetch(url, { headers: _h() });
    if (!r.ok) return [];
    return r.json();
  } catch { return []; }
}

async function _count(path) {
  const r = await fetch(`${API}/${path}`, { headers: { ..._h(), Prefer: 'count=exact' } });
  if (!r.ok) return 0;
  const cr = r.headers.get('content-range');
  return cr ? parseInt(cr.split('/')[1], 10) : 0;
}

function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
function _n(v) { if (v == null) return '0'; return Number(v).toLocaleString('en-US'); }
function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

let _section = null;

export async function renderOpsReports(container) {
  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    const scopeFilter = buildOrderScopeFilter();

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(); monthStart.setDate(1);
    const ms = monthStart.toISOString().slice(0, 10);

    const [
      totalOrders, totalProducts, totalCustomers,
      todayOrders, todayCustomers,
      monthOrders,
    ] = await Promise.all([
      _count('orders?select=id&limit=0'),
      _count('products?select=id&is_active=eq.true&limit=0'),
      _count(`runtime_customer_visibility?select=id&is_active=eq.true${scopeFilter ? '&' + scopeFilter : ''}&limit=0`),
      _count(`orders?select=id&created_at=gte.${today}&created_at=lt.${today}T23:59:59&limit=0`),
      _count(`runtime_customer_visibility?select=id&created_at=gte.${today}&limit=0${scopeFilter ? '&' + scopeFilter : ''}`),
      _count(`orders?select=id&created_at=gte.${ms}&limit=0`),
    ]);

    container.innerHTML = `<div class="v2-ops-page">
      <button class="v2-od-back" id="v2-rpt-back" style="display:none">← التقارير</button>
      <h2 style="margin:8px 0">التقارير</h2>
      <div class="v2-dash-grid">
        <div class="v2-dash-card"><div class="v2-dash-num">${_n(todayOrders)}</div><div class="v2-dash-lbl">طلبات اليوم</div></div>
        <div class="v2-dash-card"><div class="v2-dash-num">${_n(monthOrders)}</div><div class="v2-dash-lbl">طلبات هذا الشهر</div></div>
        <div class="v2-dash-card"><div class="v2-dash-num">${_n(totalOrders)}</div><div class="v2-dash-lbl">إجمالي الطلبات</div></div>
        <div class="v2-dash-card"><div class="v2-dash-num">${_n(todayCustomers)}</div><div class="v2-dash-lbl">عملاء جدد اليوم</div></div>
        <div class="v2-dash-card"><div class="v2-dash-num">${_n(totalCustomers)}</div><div class="v2-dash-lbl">إجمالي العملاء</div></div>
        <div class="v2-dash-card"><div class="v2-dash-num">${_n(totalProducts)}</div><div class="v2-dash-lbl">منتجات نشطة</div></div>
      </div>
      <div class="v2-report-sections" id="v2-rpt-sections">
        <div class="v2-card"><div class="v2-card-h"><h3>المبيعات</h3></div><div class="v2-card-b">
          <button class="v2-report-btn" data-report="sales-daily">تقرير المبيعات اليومي</button>
          <button class="v2-report-btn" data-report="sales-monthly">تقرير المبيعات الشهري</button>
        </div></div>
        <div class="v2-card"><div class="v2-card-h"><h3>المخزون</h3></div><div class="v2-card-b">
          <button class="v2-report-btn" data-report="inventory-low">المخزون المنخفض</button>
          <button class="v2-report-btn" data-report="inventory-movements">حركة المخزون</button>
        </div></div>
        <div class="v2-card"><div class="v2-card-h"><h3>العملاء</h3></div><div class="v2-card-b">
          <button class="v2-report-btn" data-report="customers-top">أفضل العملاء</button>
          <button class="v2-report-btn" data-report="customers-inactive">عملاء غير نشطين</button>
        </div></div>
        <div class="v2-card"><div class="v2-card-h"><h3>المنتجات</h3></div><div class="v2-card-b">
          <button class="v2-report-btn" data-report="products-top">أفضل المنتجات</button>
          <button class="v2-report-btn" data-report="products-no-movement">منتجات بدون حركة</button>
        </div></div>
      </div>
      <div id="v2-rpt-detail"></div>
    </div>`;

    container.querySelectorAll('.v2-report-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        _section = btn.dataset.report;
        const detail = container.querySelector('#v2-rpt-detail');
        const back = container.querySelector('#v2-rpt-back');
        back.style.display = '';
        detail.innerHTML = '<div class="v2-ol-loading">جاري التحميل...</div>';
        await _renderReport(_section, detail);
      });
    });

    container.querySelector('#v2-rpt-back')?.addEventListener('click', () => {
      _section = null;
      container.querySelector('#v2-rpt-back').style.display = 'none';
      container.querySelector('#v2-rpt-detail').innerHTML = '';
      container.querySelector('#v2-rpt-sections').style.display = '';
    });
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل التقارير</p><button class="v2-retry">إعادة المحاولة</button></div></div>';
    container.querySelector('.v2-retry')?.addEventListener('click', () => renderOpsReports(container));
  }
}

async function _renderReport(type, el) {
  let html = '';
  try {
    switch (type) {
      case 'sales-daily': html = await _reportDailySales(); break;
      case 'sales-monthly': html = await _reportMonthlySales(); break;
      case 'inventory-low': html = await _reportLowInventory(); break;
      case 'inventory-movements': html = await _reportInventoryMovements(); break;
      case 'customers-top': html = await _reportTopCustomers(); break;
      case 'customers-inactive': html = await _reportInactiveCustomers(); break;
      case 'products-top': html = await _reportTopProducts(); break;
      case 'products-no-movement': html = await _reportNoMovementProducts(); break;
      default: html = '<p>تقرير غير معروف</p>';
    }
  } catch { html = '<div class="v2-ol-error"><p>فشل تحميل التقرير</p></div>'; }
  el.innerHTML = html;
}

async function _reportDailySales() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await _fetch(`${API}/orders?select=id,order_number,customer_name,total_amount,created_at,rep_name&created_at=gte.${today}&created_at=lt.${today}T23:59:59&order=created_at.desc&limit=50`);
  if (!rows.length) return '<div class="v2-rpt-empty">لا توجد مبيعات اليوم</div>';
  let total = 0;
  rows.forEach(r => total += Number(r.total_amount || 0));
  return `<div class="v2-rpt-summary">إجمالي مبيعات اليوم: ${_money(total)} (${_n(rows.length)} طلب)</div>
    <div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>المندوب</th><th>المبلغ</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${_e(r.order_number || '—')}</td><td>${_e(r.customer_name)}</td><td>${_e(r.rep_name || '—')}</td><td class="v2-inv-num">${_money(r.total_amount)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function _reportMonthlySales() {
  const monthStart = new Date(); monthStart.setDate(1);
  const ms = monthStart.toISOString().slice(0, 10);
  const rows = await _fetch(`${API}/orders?select=id,order_number,customer_name,total_amount,created_at,rep_name&created_at=gte.${ms}&order=created_at.desc&limit=100`);
  if (!rows.length) return '<div class="v2-rpt-empty">لا توجد مبيعات هذا الشهر</div>';
  let total = 0;
  rows.forEach(r => total += Number(r.total_amount || 0));
  const byRep = {};
  rows.forEach(r => {
    const name = r.rep_name || 'غير معروف';
    if (!byRep[name]) byRep[name] = { count: 0, total: 0 };
    byRep[name].count++;
    byRep[name].total += Number(r.total_amount || 0);
  });
  const repRows = Object.entries(byRep).sort((a, b) => b[1].total - a[1].total);
  return `<div class="v2-rpt-summary">إجمالي مبيعات الشهر: ${_money(total)} (${_n(rows.length)} طلب)</div>
    <div class="v2-occp-section-title">حسب المندوب</div>
    <div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>المندوب</th><th>الطلبات</th><th>الإجمالي</th></tr></thead><tbody>
    ${repRows.map(([name, d]) => `<tr><td>${_e(name)}</td><td class="v2-inv-num">${_n(d.count)}</td><td class="v2-inv-num">${_money(d.total)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function _reportLowInventory() {
  const rows = await _fetch(`${API}/products?select=id,product_code,product_name,category,company_name_snapshot,track_inventory&is_active=eq.true&track_inventory=eq.true&order=product_name.asc&limit=100`);
  if (!rows.length) return '<div class="v2-rpt-empty">لا توجد منتجات</div>';
  const html = rows.map(p => `<div class="v2-rpt-item"><span>${_e(p.product_name)}${p.product_code ? ' (' + _e(p.product_code) + ')' : ''}</span></div>`).join('');
  return `<div class="v2-rpt-summary">إجمالي المنتجات المتتبعة: ${_n(rows.length)}</div><div class="v2-rpt-list">${html}</div>`;
}

async function _reportInventoryMovements() {
  const rows = await _fetch(`${API}/inventory_movements?select=id,product_id,quantity,direction,movement_type,note,created_at&order=created_at.desc&limit=50`);
  if (!rows.length) return '<div class="v2-rpt-empty">لا توجد حركات مخزون</div>';
  return `<div class="v2-rpt-summary">آخر 50 حركة مخزون</div>
    <div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>النوع</th><th>الكمية</th><th>الاتجاه</th><th>ملاحظات</th><th>التاريخ</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${_e(r.movement_type)}</td><td class="v2-inv-num">${_n(r.quantity)}</td><td>${r.direction === 'in' ? 'وارد' : 'منصرف'}</td><td>${_e(r.note || '')}</td><td>${new Date(r.created_at).toLocaleDateString('ar-EG-u-nu-latn')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function _reportTopCustomers() {
  const rows = await _fetch(`${API}/orders?select=customer_name,id,total_amount&order=total_amount.desc&limit=20`);
  if (!rows.length) return '<div class="v2-rpt-empty">لا توجد بيانات</div>';
  return `<div class="v2-rpt-summary">أفضل 20 عميل</div>
    <div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>العميل</th><th>عدد الطلبات</th><th>الإجمالي</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${_e(r.customer_name)}</td><td class="v2-inv-num">1</td><td class="v2-inv-num">${_money(r.total_amount)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function _reportInactiveCustomers() {
  const scopeFilter = buildOrderScopeFilter();
  const rows = await _fetch(`${API}/runtime_customer_visibility?select=id,customer_name,phone,rep_name,is_active&is_active=eq.false&limit=50${scopeFilter ? '&' + scopeFilter : ''}`);
  if (!rows.length) return '<div class="v2-rpt-empty">لا يوجد عملاء غير نشطين</div>';
  return `<div class="v2-rpt-summary">العملاء غير النشطين: ${_n(rows.length)}</div>
    <div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>الاسم</th><th>الهاتف</th><th>المندوب</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${_e(r.customer_name)}</td><td>${_e(r.phone || '')}</td><td>${_e(r.rep_name || '—')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function _reportTopProducts() {
  const rows = await _fetch(`${API}/runtime_product_management?select=product_id,product_name,product_code,category,company_name&is_active=eq.true&order=product_name.asc&limit=50`);
  if (!rows.length) return '<div class="v2-rpt-empty">لا توجد منتجات</div>';
  return `<div class="v2-rpt-summary">جميع المنتجات النشطة: ${_n(rows.length)}</div>
    <div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>المنتج</th><th>الكود</th><th>التصنيف</th><th>الشركة</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${_e(r.product_name)}</td><td>${_e(r.product_code || '')}</td><td>${_e(r.category || '')}</td><td>${_e(r.company_name || '')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

async function _reportNoMovementProducts() {
  return '<div class="v2-rpt-empty">قريباً</div>';
}
