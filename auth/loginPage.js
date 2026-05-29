import { login } from './sessionService.js';
import { validateEgyptianPhone, normalizePhone } from '../services/runtime/identityService.js';

function _formatPhone(input) {
  const n = normalizePhone(input || '');
  if (n.length === 12 && n.startsWith('201')) {
    const last9 = n.slice(3);
    return `+2 01${last9.slice(0, 1)} ${last9.slice(1, 4)} ${last9.slice(4, 7)} ${last9.slice(7)}`;
  }
  return input || '';
}

export function renderLoginPage(container) {
  container.innerHTML = `
    <div class="v2-login-page">
      <div class="v2-login-card">
        <div class="v2-login-header">
          <h1>متجر الأهرام</h1>
          <p>نظام التشغيل والتوزيع</p>
        </div>
        <form id="v2-login-form">
          <div class="v2-fg">
            <label for="v2-le">رقم الهاتف</label>
            <input type="tel" id="v2-le" name="phone" class="v2-fi" dir="ltr"
              placeholder="مثال: 01002082831" required autocomplete="tel" autofocus
              inputmode="numeric" pattern="[0-9\+]{10,15}"
              aria-label="رقم الهاتف">
            <div style="font-size:.6875rem;color:#6b7280;margin-top:.25rem">أدخل رقم الهاتف المصري — مثال: 01002082831</div>
          </div>
          <div class="v2-fg">
            <label for="v2-lp">كلمة المرور</label>
            <div class="v2-pw-wrap">
              <input type="password" id="v2-lp" name="password" class="v2-fi"
                placeholder="••••••••" required autocomplete="current-password" minlength="4"
                aria-label="كلمة المرور">
              <button type="button" class="v2-pw-toggle" data-toggle="v2-lp" aria-label="إظهار/إخفاء كلمة المرور">👁</button>
            </div>
          </div>
          <div id="v2-lee" class="v2-lee" style="display:none" role="alert"></div>
          <button type="submit" id="v2-ls" class="v2-btn v2-btn-p v2-btn-b">تسجيل الدخول</button>
        </form>
        <p style="text-align:center;margin-top:1rem;font-size:.8125rem">
          ليس لديك حساب؟ <a href="#register" style="color:var(--v2-primary)">إنشاء حساب جديد</a>
        </p>
      </div>
    </div>`;
}

export function bindLoginForm(container) {
  const f = container.querySelector('#v2-login-form');
  const ee = container.querySelector('#v2-lee');
  const sb = container.querySelector('#v2-ls');
  if (!f) return;

  const phoneInput = f.querySelector('#v2-le');
  if (phoneInput) {
    phoneInput.addEventListener('blur', () => {
      const v = phoneInput.value.trim();
      if (v) {
        const formatted = _formatPhone(v);
        if (formatted !== v) phoneInput.value = v;
        const err = validateEgyptianPhone(v);
        if (err) {
          phoneInput.setCustomValidity(err);
        } else {
          phoneInput.setCustomValidity('');
        }
      }
    });
  }

  container.querySelectorAll('.v2-pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggle);
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? '🙈' : '👁';
    });
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    ee.style.display = 'none';
    const phone = f.phone.value.trim();
    const pw = f.password.value;

    if (!phone || !pw) {
      ee.textContent = 'يرجى إدخال رقم الهاتف وكلمة المرور';
      ee.style.display = 'block'; return;
    }

    const phoneErr = validateEgyptianPhone(phone);
    if (phoneErr) {
      ee.textContent = phoneErr;
      ee.style.display = 'block'; return;
    }

    sb.disabled = true; sb.textContent = 'جاري...';

    try {
      await login(phone, pw);
      location.hash = '#home';
    } catch (err) {
      ee.innerHTML = (err.message || 'فشل تسجيل الدخول') + ' <a href="#register" style="color:var(--v2-primary)">إنشاء حساب جديد</a>';
      ee.style.display = 'block';
    } finally {
      sb.disabled = false;
      sb.textContent = 'تسجيل الدخول';
    }
  });
}
