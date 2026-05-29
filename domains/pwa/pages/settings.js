import { getPwaState } from '../../../pwa/pwaRuntime.js';

const APP_VERSION = '2.0.0';

async function getCacheSize() {
  try {
    if (!('caches' in window)) return null;
    const keys = await caches.keys();
    let total = 0;
    for (const key of keys) {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      for (const req of requests) {
        const res = await cache.match(req);
        if (res) total += (await res.clone().arrayBuffer()).byteLength;
      }
    }
    return total;
  } catch {
    return null;
  }
}

function formatSize(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return bytes + ' بايت';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' كيلوبايت';
  return (bytes / 1048576).toFixed(1) + ' ميجابايت';
}

export function renderPwaSettings(container) {
  const state = getPwaState();
  container.innerHTML = '<div class="v2-pwaset">'
    + '<div class="v2-pwaset-header"><h2>إعدادات التطبيق</h2></div>'
    + '<div class="v2-pwaset-section">'
    + '<h3>التخزين المؤقت</h3>'
    + '<p id="v2-pwaset-size">حجم التخزين المؤقت: جاري الحساب...</p>'
    + '<p>مسح جميع الملفات المخزنة مؤقتاً للتطبيق</p>'
    + '<button class="v2-btn v2-btn-b" id="v2-pwaset-clear">مسح التخزين المؤقت</button>'
    + '<div id="v2-pwaset-clear-msg" style="margin-top:.5rem;font-size:.875rem"></div>'
    + '</div>'
    + '<div class="v2-pwaset-section">'
    + '<h3>الإشعارات</h3>'
    + '<p>إعدادات الإشعارات قريباً</p>'
    + '<div class="v2-pwaset-ntf-placeholder">'
    + '<label class="v2-pwaset-toggle"><input type="checkbox" disabled> إشعارات الطلبات</label>'
    + '<label class="v2-pwaset-toggle"><input type="checkbox" disabled> إشعارات الفواتير</label>'
    + '<label class="v2-pwaset-toggle"><input type="checkbox" disabled> إشعارات العروض</label>'
    + '</div>'
    + '</div>'
    + '<div class="v2-pwaset-section">'
    + '<h3>معلومات التطبيق</h3>'
    + '<div class="v2-pwaset-row"><span>وضع العرض</span><span>' + (state.isStandalone ? 'تطبيق مستقل' : 'متصفح') + '</span></div>'
    + '<div class="v2-pwaset-row"><span>مثبت</span><span>' + (state.isInstalled ? 'نعم' : 'لا') + '</span></div>'
    + '<div class="v2-pwaset-row"><span>نظام التشغيل</span><span>' + (state.isIOS ? 'iOS' : state.isAndroid ? 'Android' : 'أخرى') + '</span></div>'
    + '<div class="v2-pwaset-row"><span>إصدار التطبيق</span><span>' + APP_VERSION + '</span></div>'
    + '</div></div>';

  getCacheSize().then(size => {
    const el = container.querySelector('#v2-pwaset-size');
    if (el) el.textContent = 'حجم التخزين المؤقت: ' + formatSize(size);
  }).catch(() => {
    const el = container.querySelector('#v2-pwaset-size');
    if (el) el.textContent = 'حجم التخزين المؤقت: غير متاح';
  });

  container.querySelector('#v2-pwaset-clear')?.addEventListener('click', async () => {
    const msgEl = container.querySelector('#v2-pwaset-clear-msg');
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      msgEl.textContent = '✓ تم مسح التخزين المؤقت بنجاح';
      msgEl.style.color = 'var(--v2-success)';
      const sizeEl = container.querySelector('#v2-pwaset-size');
      if (sizeEl) sizeEl.textContent = 'حجم التخزين المؤقت: 0 بايت';
    } catch {
      msgEl.textContent = '✗ فشل مسح التخزين المؤقت';
      msgEl.style.color = 'var(--v2-danger)';
    }
  });
}
