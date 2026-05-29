import { isStandalone } from '../../../pwa/pwaRuntime.js';
import { triggerInstall } from '../../../pwa/installManager.js';

export function renderPwaInstall(container) {
  const standalone = isStandalone();
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /Android/i.test(navigator.userAgent);

  container.innerHTML = '<div class="v2-pwainst">'
    + '<div class="v2-pwainst-header">'
    + '<h2>تثبيت التطبيق</h2>'
    + '<p>يمكنك تثبيت متجر الأهرام على جهازك للوصول السريع</p>'
    + '</div>'
    + (standalone
      ? '<div class="v2-pwainst-installed"><p>✓ التطبيق مثبت بالفعل على جهازك</p></div>'
      : '<div class="v2-pwainst-actions">'
        + '<button class="v2-btn v2-btn-p v2-btn-b" id="v2-pwainst-btn">تثبيت التطبيق</button>'
        + '</div>')
    + '<div class="v2-pwainst-info">'
    + '<h3>طريقة التثبيت على جهازك</h3>'
    + (isIOS
      ? '<div class="v2-pwainst-steps">'
        + '<ol><li>اضغط على زر المشاركة <strong>⎙</strong> في شريط المتصفح</li>'
        + '<li>اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></li>'
        + '<li>اضغط على <strong>"إضافة"</strong> في الأعلى</li></ol>'
        + '</div>'
      : isAndroid
        ? '<div class="v2-pwainst-steps">'
          + '<ol><li>اضغط على زر القائمة <strong>⋮</strong> في المتصفح</li>'
          + '<li>اختر <strong>"تثبيت التطبيق"</strong> أو <strong>"إضافة إلى الشاشة الرئيسية"</strong></li>'
          + '<li>اضغط على <strong>"تثبيت"</strong></li></ol>'
          + '</div>'
        : '<div class="v2-pwainst-steps">'
          + '<ol><li>اضغط على زر التثبيت في شريط العنوان</li>'
          + '<li>اختر <strong>"تثبيت"</strong> من النافذة المنبثقة</li></ol>'
          + '</div>')
    + '</div>'
    + '<div class="v2-pwainst-features">'
    + '<h3>مميزات التطبيق</h3>'
    + '<ul><li>تصفح المنتجات بدون إنترنت</li>'
    + '<li>إشعارات فورية بالطلبات</li>'
    + '<li>وصول سريع من الشاشة الرئيسية</li>'
    + '<li>تجربة استخدام أفضل</li></ul>'
    + '</div></div>';

  if (!standalone) {
    container.querySelector('#v2-pwainst-btn')?.addEventListener('click', async () => {
      triggerInstall();
    });
  }
}
