import { signUpAsCustomer } from '../../../auth/sessionService.js';
import { validateEgyptianPhone } from '../../../services/runtime/identityService.js';

const EGYPT_GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'الشرقية', 'القليوبية',
  'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد',
  'الإسماعيلية', 'السويس', 'شمال سيناء', 'جنوب سيناء', 'الفيوم', 'بني سويف',
  'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'مطروح', 'الوادي الجديد',
  'البحر الأحمر',
];

const ACTIVITY_TYPES = [
  { value: 'retail', label: 'تاجر تجزئة', icon: '🏪' },
  { value: 'wholesale', label: 'تاجر جملة', icon: '🏬' },
  { value: 'distributor', label: 'موزع معتمد', icon: '🚚' },
  { value: 'manufacturer', label: 'مصنع', icon: '🏭' },
  { value: 'cafe', label: 'مقهى / مطعم', icon: '☕' },
  { value: 'pharmacy', label: 'صيدلية', icon: '💊' },
  { value: 'grocery', label: 'بقالة / سوبر ماركت', icon: '🛒' },
  { value: 'other', label: 'نشاط آخر', icon: '📋' },
];

export function renderRegisterPage(container) {
  container.innerHTML = `
    <div class="v2-ro-container">
      <div class="v2-ro-card">
        <div class="v2-ro-header">
          <div class="v2-ro-header-icon">📝</div>
          <h1>تسجيل حساب جديد</h1>
          <p>أنشئ حسابك لبدء الطلب والاستفادة من خدمات التوزيع</p>
        </div>

        <form id="v2-ro-form" novalidate>
          <div class="v2-ro-section" data-section="personal">
            <div class="v2-ro-section-head">
              <span class="v2-ro-section-icon">👤</span>
              <span class="v2-ro-section-title">البيانات الشخصية</span>
              <span class="v2-ro-section-badge">1</span>
            </div>
            <div class="v2-ro-section-body">
              <div class="v2-ro-field">
                <label class="v2-ro-label">الاسم الكامل <span class="v2-ro-req">*</span></label>
                <input class="v2-ro-input" id="v2-r-name" name="fullName" type="text"
                  placeholder="الاسم كما تريد ظهوره في الفواتير" required autocomplete="name"
                  aria-label="الاسم الكامل" dir="auto">
              </div>
              <div class="v2-ro-field">
                <label class="v2-ro-label">رقم الهاتف المحمول <span class="v2-ro-req">*</span></label>
                <div class="v2-ro-phone-wrap">
                  <span class="v2-ro-phone-prefix">+2</span>
                  <input class="v2-ro-input v2-ro-phone-input" id="v2-r-phone" name="phone"
                    type="tel" dir="ltr" placeholder="010 000 000 00" required
                    autocomplete="tel" inputmode="numeric" pattern="[0-9\+]{10,15}"
                    aria-label="رقم الهاتف" maxlength="15">
                </div>
                <div class="v2-ro-hint">أدخل رقم الهاتف المحمول المصري — 11 رقمًا</div>
              </div>
            </div>
          </div>

          <div class="v2-ro-section" data-section="password">
            <div class="v2-ro-section-head">
              <span class="v2-ro-section-icon">🔒</span>
              <span class="v2-ro-section-title">أمان الحساب</span>
              <span class="v2-ro-section-badge">2</span>
            </div>
            <div class="v2-ro-section-body">
              <div class="v2-ro-row">
                <div class="v2-ro-field">
                  <label class="v2-ro-label">كلمة المرور <span class="v2-ro-req">*</span></label>
                  <div class="v2-ro-pw-wrap">
                    <input class="v2-ro-input" id="v2-r-pass" type="password" dir="ltr"
                      placeholder="6 أحرف على الأقل" required autocomplete="new-password"
                      minlength="6" aria-label="كلمة المرور">
                    <button type="button" class="v2-ro-pw-toggle" data-toggle="v2-r-pass"
                      aria-label="إظهار/إخفاء">👁</button>
                  </div>
                </div>
                <div class="v2-ro-field">
                  <label class="v2-ro-label">تأكيد كلمة المرور <span class="v2-ro-req">*</span></label>
                  <div class="v2-ro-pw-wrap">
                    <input class="v2-ro-input" id="v2-r-confirm" type="password" dir="ltr"
                      placeholder="أعد إدخال كلمة المرور" required autocomplete="new-password"
                      aria-label="تأكيد كلمة المرور">
                    <button type="button" class="v2-ro-pw-toggle" data-toggle="v2-r-confirm"
                      aria-label="إظهار/إخفاء">👁</button>
                  </div>
                </div>
              </div>
              <div class="v2-ro-pw-meter" id="v2-r-pw-meter">
                <div class="v2-ro-pw-meter-bar" id="v2-r-pw-bar"></div>
              </div>
            </div>
          </div>

          <div class="v2-ro-section" data-section="location">
            <div class="v2-ro-section-head">
              <span class="v2-ro-section-icon">📍</span>
              <span class="v2-ro-section-title">العنوان والموقع</span>
              <span class="v2-ro-section-badge">3</span>
            </div>
            <div class="v2-ro-section-body">
              <div class="v2-ro-row">
                <div class="v2-ro-field">
                  <label class="v2-ro-label">المحافظة <span class="v2-ro-req">*</span></label>
                  <select class="v2-ro-input v2-ro-select" id="v2-r-gov" required aria-label="المحافظة">
                    <option value="" disabled selected>اختر المحافظة</option>
                    ${EGYPT_GOVERNORATES.map(g =>
                      `<option value="${g}">${g}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="v2-ro-field">
                  <label class="v2-ro-label">المنطقة <span class="v2-ro-req">*</span></label>
                  <input class="v2-ro-input" id="v2-r-region" type="text"
                    placeholder="مثال: حي الهرم - قسم أول" required aria-label="المنطقة">
                </div>
              </div>
              <div class="v2-ro-field">
                <label class="v2-ro-label">العنوان بالتفصيل <span class="v2-ro-req">*</span></label>
                <textarea class="v2-ro-input v2-ro-textarea" id="v2-r-address" rows="2"
                  placeholder="الشارع - رقم المبنى - الشقة - الطابق - أي معلم قريب"
                  required aria-label="العنوان التفصيلي"></textarea>
              </div>
              <div class="v2-ro-field">
                <label class="v2-ro-label">الموقع على الخريطة <span class="v2-ro-opt">اختياري</span></label>
                <div class="v2-ro-gps-bar">
                  <button type="button" class="v2-ro-gps-btn" id="v2-r-gps-btn">
                    <span class="v2-ro-gps-dot"></span>
                    <span class="v2-ro-gps-text">تحديد موقعي الحالي</span>
                  </button>
                  <span class="v2-ro-gps-status" id="v2-r-gps-status"></span>
                </div>
                <div class="v2-ro-coords" id="v2-r-coords"></div>
                <div class="v2-ro-hint">سيُستخدم الموقع لتنظيم الزيارات الميدانية والتوصيل</div>
              </div>
            </div>
          </div>

          <div class="v2-ro-section" data-section="activity">
            <div class="v2-ro-section-head">
              <span class="v2-ro-section-icon">🏪</span>
              <span class="v2-ro-section-title">نوع النشاط التجاري</span>
              <span class="v2-ro-section-badge">4</span>
            </div>
            <div class="v2-ro-section-body">
              <div class="v2-ro-field">
                <label class="v2-ro-label">اختر تصنيف نشاطك <span class="v2-ro-req">*</span></label>
                <div class="v2-ro-activity-grid">
                  ${ACTIVITY_TYPES.map(a => `
                    <label class="v2-ro-activity-item" data-value="${a.value}">
                      <input type="radio" name="activity" value="${a.value}" class="v2-ro-activity-radio">
                      <span class="v2-ro-activity-icon">${a.icon}</span>
                      <span class="v2-ro-activity-label">${a.label}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <div id="v2-ro-error" class="v2-ro-error" style="display:none" role="alert"></div>

          <button type="submit" class="v2-ro-submit" id="v2-ro-submit">
            <span class="v2-ro-submit-text">إنشاء الحساب</span>
            <span class="v2-ro-submit-loader" style="display:none"></span>
          </button>
        </form>

        <div class="v2-ro-footer">
          لديك حساب بالفعل؟
          <a href="#login" class="v2-ro-link">تسجيل الدخول</a>
        </div>
      </div>
    </div>`;

  _bind(container);
}

let _gpsLat = null;
let _gpsLng = null;
let _gpsAccuracy = null;

function _bind(container) {
  const form = container.querySelector('#v2-ro-form');
  const nameEl = form.querySelector('#v2-r-name');
  const phoneEl = form.querySelector('#v2-r-phone');
  const passEl = form.querySelector('#v2-r-pass');
  const confirmEl = form.querySelector('#v2-r-confirm');
  const govEl = form.querySelector('#v2-r-gov');
  const regionEl = form.querySelector('#v2-r-region');
  const addressEl = form.querySelector('#v2-r-address');
  const gpsBtn = form.querySelector('#v2-r-gps-btn');
  const gpsStatus = form.querySelector('#v2-r-gps-status');
  const coordsEl = form.querySelector('#v2-r-coords');
  const errEl = form.querySelector('#v2-ro-error');
  const submitBtn = form.querySelector('#v2-ro-submit');
  const pwBar = form.querySelector('#v2-r-pw-bar');
  const activityRadios = form.querySelectorAll('.v2-ro-activity-radio');

  form.querySelectorAll('.v2-ro-pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggle);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁';
    });
  });

  if (phoneEl) {
    phoneEl.addEventListener('blur', () => {
      const v = phoneEl.value.replace(/\s/g, '');
      if (v) {
        const err = validateEgyptianPhone(v);
        phoneEl.setCustomValidity(err || '');
        _clearFieldError(phoneEl);
        if (err) _showFieldError(phoneEl, err);
      }
    });
    phoneEl.addEventListener('input', () => _clearFieldError(phoneEl));
  }

  if (passEl) {
    passEl.addEventListener('input', () => {
      const v = passEl.value;
      let strength = 0;
      if (v.length >= 6) strength += 25;
      if (v.length >= 8) strength += 15;
      if (/[a-z]/.test(v) && /[A-Z]/.test(v)) strength += 20;
      if (/\d/.test(v)) strength += 20;
      if (/[^a-zA-Z0-9]/.test(v)) strength += 20;
      const capped = Math.min(strength, 100);
      pwBar.style.width = capped + '%';
      pwBar.classList.remove('v2-ro-pw-weak', 'v2-ro-pw-medium', 'v2-ro-pw-strong');
      if (capped < 40) pwBar.classList.add('v2-ro-pw-weak');
      else if (capped < 70) pwBar.classList.add('v2-ro-pw-medium');
      else pwBar.classList.add('v2-ro-pw-strong');
    });
  }

  function _checkMatch() {
    if (!confirmEl.value) { _clearFieldError(confirmEl); return; }
    if (confirmEl.value !== passEl.value) {
      _showFieldError(confirmEl, 'كلمتا المرور غير متطابقتين');
    } else {
      _clearFieldError(confirmEl);
    }
  }
  if (confirmEl && passEl) {
    confirmEl.addEventListener('input', _checkMatch);
    passEl.addEventListener('input', _checkMatch);
  }

  form.querySelectorAll('.v2-ro-activity-item').forEach(item => {
    item.addEventListener('click', () => {
      form.querySelectorAll('.v2-ro-activity-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const radio = item.querySelector('.v2-ro-activity-radio');
      if (radio) radio.checked = true;
    });
  });

  if (gpsBtn) {
    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        gpsStatus.textContent = 'غير متاح';
        return;
      }
      gpsBtn.disabled = true;
      gpsBtn.classList.add('loading');
      gpsStatus.textContent = 'جاري تحديد الموقع...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          _gpsLat = pos.coords.latitude;
          _gpsLng = pos.coords.longitude;
          _gpsAccuracy = pos.coords.accuracy;
          gpsBtn.classList.remove('loading');
          gpsBtn.classList.add('done');
          gpsBtn.querySelector('.v2-ro-gps-text').textContent = 'تم تحديد الموقع';
          gpsStatus.textContent = '';
          const acc = _gpsAccuracy < 50 ? 'دقة عالية' : _gpsAccuracy < 100 ? 'متوسطة' : 'منخفضة';
          coordsEl.innerHTML = `
            <span class="v2-ro-coords-icon">📌</span>
            <span>${_gpsLat.toFixed(6)}, ${_gpsLng.toFixed(6)}</span>
            <span class="v2-ro-coords-acc">(${acc})</span>
          `;
          gpsBtn.disabled = false;
        },
        (err) => {
          gpsBtn.classList.remove('loading');
          const reasons = {
            1: 'الرجاء السماح بالوصول إلى الموقع',
            2: 'تعذر تحديد الموقع',
            3: 'انتهت مهلة التحديد',
          };
          gpsStatus.textContent = reasons[err.code] || 'خطأ في تحديد الموقع';
          gpsBtn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.style.display = 'none';
    errEl.innerHTML = '';
    _clearAllFieldErrors(form);

    const fullName = nameEl.value.trim();
    const phone = phoneEl.value.replace(/\s/g, '');
    const password = passEl.value;
    const confirm = confirmEl.value;
    const governorate = govEl.value;
    const region = regionEl.value.trim();
    const address = addressEl.value.trim();
    const activityRadio = form.querySelector('.v2-ro-activity-radio:checked');
    const activity = activityRadio ? activityRadio.value : '';

    const fieldErrors = [];
    if (!fullName) fieldErrors.push({ el: nameEl, msg: 'الرجاء إدخال الاسم الكامل' });
    if (!phone) fieldErrors.push({ el: phoneEl, msg: 'الرجاء إدخال رقم الهاتف' });
    else {
      const pe = validateEgyptianPhone(phone);
      if (pe) fieldErrors.push({ el: phoneEl, msg: pe });
    }
    if (password.length < 6) fieldErrors.push({ el: passEl, msg: '6 أحرف على الأقل' });
    if (password !== confirm) fieldErrors.push({ el: confirmEl, msg: 'غير متطابقتين' });
    if (!governorate || governorate === '') fieldErrors.push({ el: govEl, msg: 'اختر المحافظة' });
    if (!region) fieldErrors.push({ el: regionEl, msg: 'أدخل المنطقة' });
    if (!address) fieldErrors.push({ el: addressEl, msg: 'أدخل العنوان' });
    if (!activity) {
      _showFormError(errEl, 'الرجاء اختيار نوع النشاط التجاري');
      form.querySelector('[data-section="activity"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (fieldErrors.length) {
      fieldErrors.forEach(fe => _showFieldError(fe.el, fe.msg));
      const target = fieldErrors[0].el;
      target.closest('.v2-ro-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
      _showFormError(errEl, 'يرجى تصحيح الأخطاء الموضحة');
      return;
    }

    submitBtn.classList.add('loading');
    submitBtn.querySelector('.v2-ro-submit-text').textContent = 'جارٍ إنشاء الحساب...';

    try {
      await signUpAsCustomer({
        phone,
        password,
        fullName,
        governorate,
        region,
        address,
        activityType: activity,
        latitude: _gpsLat,
        longitude: _gpsLng,
        accuracy: _gpsAccuracy,
      });
      location.hash = '#home';
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('مسجل') || msg.includes('phone_exists')) {
        _showFormError(errEl, 'هذا الرقم مسجل بالفعل. <a href="#login" style="color:#3b82f6;font-weight:600">تسجيل الدخول</a>');
      } else {
        _showFormError(errEl, msg || 'حدث خطأ. حاول مرة أخرى.');
      }
      submitBtn.classList.remove('loading');
      submitBtn.querySelector('.v2-ro-submit-text').textContent = 'إنشاء الحساب';
    }
  });
}

function _showFieldError(el, msg) {
  el.classList.add('v2-ro-input-error');
  let errorEl = el.parentNode.querySelector('.v2-ro-field-error');
  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.className = 'v2-ro-field-error';
    el.parentNode.appendChild(errorEl);
  }
  errorEl.textContent = msg;
}

function _clearFieldError(el) {
  el.classList.remove('v2-ro-input-error');
  const errorEl = el.parentNode.querySelector('.v2-ro-field-error');
  if (errorEl) errorEl.remove();
}

function _clearAllFieldErrors(container) {
  container.querySelectorAll('.v2-ro-input-error').forEach(el => el.classList.remove('v2-ro-input-error'));
  container.querySelectorAll('.v2-ro-field-error').forEach(el => el.remove());
}

function _showFormError(el, html) {
  el.innerHTML = html;
  el.style.display = '';
}
