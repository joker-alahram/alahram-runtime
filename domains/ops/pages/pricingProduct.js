import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import { showModal, apiPatch, addStyles } from './crudHelper.js';

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

export async function renderOpsPricingProduct(container, params) {
  const { productId } = params;
  if (!productId) { container.innerHTML = '<div class="v2-ops-page"><p>معرف المنتج غير موجود</p><a href="#ops/pricing">العودة للتسعير</a></div>'; return; }

  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري التحميل...</div></div>';
  try {
    addStyles();
    const [prodArr, prices] = await Promise.all([
      _fetch(`products?select=id,product_name,product_code&id=eq.${productId}`),
      _fetch(`product_prices?select=id,product_id,tier_id,base_price,is_active,starts_at,ends_at,availability_status,sales_blocked,participates_in_tier,minimum_quantity,maximum_quantity&product_id=eq.${productId}`),
    ]);
    const prod = prodArr[0];
    if (!prod) throw new Error('المنتج غير موجود');

    container.innerHTML = `<div class="v2-ops-page">
      <a href="#ops/pricing" class="v2-od-back">← العودة للتسعير</a>
      <div class="v2-card">
        <div class="v2-card-h"><h2>${_e(prod.product_name)}</h2><span class="v2-badge">${_e(prod.product_code || '')}</span></div>
      </div>
      <h3>الأسعار حسب الشريحة</h3>
      ${prices.length === 0 ? '<p>لا توجد أسعار مسجلة لهذا المنتج</p>' : `<div class="v2-inv-scroll"><table class="v2-inv-tbl"><thead><tr><th>الشريحة</th><th>السعر الأساسي</th><th>متاح</th><th>مشاركة في الشريحة</th><th>الحالة</th><th></th></tr></thead><tbody>${prices.map(p => `<tr>
        <td>${_e(p.tier_id || 'عام')}</td>
        <td>${_money(p.base_price)}</td>
        <td>${p.availability_status || 'متاح'}</td>
        <td>${p.participates_in_tier ? 'نعم' : 'لا'}</td>
        <td>${p.is_active ? '<span class="v2-badge v2-badge-ok">نشط</span>' : '<span class="v2-badge v2-badge-no">غير نشط</span>'}</td>
        <td><button class="v2-crud-edit v2-btn-sm" data-id="${p.id}">تعديل</button></td>
      </tr>`).join('')}</tbody></table></div>`}
    </div>`;

    container.querySelectorAll('.v2-crud-edit').forEach(b => {
      const p = prices.find(x => x.id === b.dataset.id);
      if (p) b.addEventListener('click', () => {
        showModal('تعديل السعر', [
          { key: 'base_price', label: 'السعر الأساسي', type: 'number', required: true },
          { key: 'availability_status', label: 'حالة التوفر' },
          { key: 'participates_in_tier', label: 'مشاركة في الشريحة', type: 'checkbox' },
          { key: 'sales_blocked', label: 'حظر البيع', type: 'checkbox' },
          { key: 'is_active', label: 'نشط', type: 'checkbox' },
        ], p, async vals => {
          await apiPatch('product_prices', p.id, vals);
          renderOpsPricingProduct(container, params);
        });
      });
    });
  } catch {
    container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل بيانات التسعير</p><a href="#ops/pricing" class="v2-retry">العودة للتسعير</a></div></div>';
  }
}

function _e(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function _money(n) { if (n == null) return ''; return Number(n).toLocaleString('en-US') + ' ج.م'; }
