import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';
import {
  getEmployeeProfile, getEffectiveCapabilities, getAllCapabilities,
  setDirectCapability, changePassword, setAccountStatus,
  getAuditTrail, logGovernanceAction, updateEmployeeProfile,
  getRoles, getEmployeeRoles, assignRole, removeRole,
  getBranches, getAuthUserStatus,
  searchEmployees, setManager, removeManager,
} from '../../../services/ops/employeeGovernanceApi.js';

const S = getSession();
const CURRENT_USER_ID = S?.actor?.id || null;

export async function renderOpsEmployee(container, params) {
  const { employeeId } = params;
  if (!employeeId) { container.innerHTML = '<div class="v2-ops-page"><p>معرف الموظف غير موجود</p><a href="#ops/employees">العودة للموظفين</a></div>'; return; }

  container.innerHTML = '<div class="v2-ops-page"><div class="v2-ol-loading">جاري تحميل مساحة الحوكمة...</div></div>';
  try {
    const [profile, allCapsRaw, roles, branches] = await Promise.all([
      getEmployeeProfile(employeeId), getAllCapabilities(), getRoles(), getBranches(),
    ]);
    if (!profile) throw new Error('الموظف غير موجود');

    const effectiveRaw = await getEffectiveCapabilities(employeeId);
    const empRoles = await getEmployeeRoles(employeeId);
    const authUser = profile.auth_user_id ? await getAuthUserStatus(profile.auth_user_id) : null;

    // Build capability structures
    const allCaps = Array.isArray(allCapsRaw) ? allCapsRaw : [];
    const effectiveCaps = Array.isArray(effectiveRaw) ? effectiveRaw : [];
    const effectiveMap = {};
    effectiveCaps.forEach(c => { effectiveMap[c.capability_code] = c; });
    const domains = [...new Set(allCaps.map(c => c.capability_domain))].sort();
    const activeRoleIds = new Set(empRoles.map(r => r.role_id));
    const allRoles = Array.isArray(roles) ? roles : [];

    container.innerHTML = pageShell(profile, empRoles, authUser, branches);

    // ─── TABS ───
    const showTab = (tab) => {
      container.querySelectorAll('.v2-gov-tab').forEach(t => t.style.display = 'none');
      container.querySelectorAll('.v2-gov-tab-hdr').forEach(h => h.classList.remove('v2-gov-tab-active'));
      const el = container.querySelector(`#v2-gov-${tab}`);
      if (el) el.style.display = 'block';
      const hdr = container.querySelector(`[data-tab="${tab}"]`);
      if (hdr) hdr.classList.add('v2-gov-tab-active');
    };
    container.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', () => showTab(el.dataset.tab)));
    showTab('profile');

    // ─── SECTION 1: PROFILE EDIT ───
    container.querySelector('#v2-gov-profile-edit')?.addEventListener('click', () => showProfileEditor(container, profile, employeeId, branches));

    // ─── SECTION 2: PASSWORD ───
    container.querySelector('#v2-gov-pw-btn')?.addEventListener('click', () => showPasswordModal(container, employeeId));

    // ─── SECTION 2: ACCOUNT STATUS ───
    container.querySelectorAll('[data-acct]').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.acct;
        el.disabled = true; el.textContent = '...';
        try {
          await setAccountStatus(employeeId, action);
          await logGovernanceAction(employeeId, action, 'account', null, JSON.stringify({ action }), profile.full_name);
          const updated = await getEmployeeProfile(employeeId);
          renderOpsEmployee(container, params);
        } catch (e) { alert('خطأ: ' + e.message); el.disabled = false; el.textContent = el.dataset.orig; }
      });
    });

    // ─── MANAGER EDIT ───
    container.querySelector('#v2-gov-mgr-edit')?.addEventListener('click', () => showManagerEditor(container, profile, employeeId));

    // ─── SECTION 3+4+5+6: CAPABILITIES ───
    renderCapabilitySection(container, allCaps, effectiveCaps, domains, effectiveMap, employeeId, profile);

    // ─── SECTION 8: GOVERNANCE INSPECTOR ───
    renderGovernanceInspector(container, profile, effectiveCaps, allCaps, empRoles);

    // ─── SECTION 10: AUDIT ───
    renderAuditSection(container, employeeId);

  } catch (e) {
    container.innerHTML = `<div class="v2-ops-page"><div class="v2-ol-error"><p>فشل تحميل بيانات الموظف: ${esc(e.message)}</p><a href="#ops/employees" class="v2-retry">العودة للموظفين</a></div></div>`;
  }
}

// ═══════════════════════════════════════════════
// PAGE SHELL
// ═══════════════════════════════════════════════

function pageShell(p, empRoles, au, branches) {
  return `<div class="v2-ops-page">
    <div class="v2-gov-top"><a href="#ops/employees" class="v2-od-back">← العودة للموظفين</a>
      <div class="v2-gov-hdr">
        <div class="v2-gov-av">${esc((p.full_name || '?')[0])}</div>
        <div>
          <div class="v2-gov-hn">${esc(p.full_name)} <span class="v2-gov-hc">${esc(p.employee_code || '')}</span>
            <span class="v2-gov-badge ${p.is_active ? 'v2-gov-badge-on' : 'v2-gov-badge-off'}">${p.is_active ? 'نشط' : 'غير نشط'}</span>
          </div>
          <div class="v2-gov-hi">${esc(p.phone || '—')} | ${esc(p.region_name || '—')} | ${esc(p.roles?.[0]?.role_name || 'بدون دور')}</div>
        </div>
      </div>
    </div>

    <div class="v2-gov-tabs">
      <button class="v2-gov-tab-hdr" data-tab="profile">الملف الشخصي</button>
      <button class="v2-gov-tab-hdr" data-tab="capabilities">الصلاحيات</button>
      <button class="v2-gov-tab-hdr" data-tab="governance">الحوكمة</button>
      <button class="v2-gov-tab-hdr" data-tab="audit">سجل التغييرات</button>
    </div>

    <div id="v2-gov-profile" class="v2-gov-tab">
      <div class="v2-gov-card">
        <div class="v2-gov-cht"><span>الملف الشخصي</span>
          <button class="v2-gov-btn" id="v2-gov-profile-edit">تعديل البيانات</button>
        </div>
        <div class="v2-gov-grid">${infoRow('الكود', p.employee_code)}${infoRow('الاسم', p.full_name)}${infoRow('رقم الهاتف', p.phone)}${infoRow('المنطقة', p.region_name)}
          <div class="v2-gov-gr-it"><span class="v2-gov-gr-l">الحالة</span><span class="v2-gov-badge ${p.is_active ? 'v2-gov-badge-on' : 'v2-gov-badge-off'}">${p.is_active ? 'نشط' : 'غير نشط'}</span></div>
          <div class="v2-gov-gr-it"><span class="v2-gov-gr-l">المدير المباشر</span><span class="v2-gov-gr-v" id="v2-gov-mgr-name">${p.manager?.name || '—'} <button class="v2-gov-btn-sm" id="v2-gov-mgr-edit" style="margin-right:0.5rem">${p.manager ? 'تغيير' : 'تعيين'}</button></span></div>
          ${infoRow('الفرع', p.branch?.name || '—')}
        </div>
        <div class="v2-gov-cht" style="margin-top:1rem"><span>الأدوار</span></div>
        <div class="v2-gov-roles">${empRoles.map(r => `<span class="v2-gov-role-tag">${esc(r.role?.role_name || '')} <small>(${esc(r.role?.role_code || '')})</small></span>`).join('')}
          <button class="v2-gov-btn-sm" id="v2-gov-add-role">+ إضافة دور</button>
        </div>
      </div>

      <div class="v2-gov-card">
        <div class="v2-gov-cht"><span>إدارة الحساب</span></div>
        <div class="v2-gov-grid">
          ${infoRow('حساب المستخدم', au?.email ? `${esc(au.email)} ${au.is_sso_user ? '(SSO)' : ''}` : (p.auth_user_id ? 'مرتبط' : '—'))}
          ${infoRow('آخر دخول', au?.last_sign_in_at ? dt(au.last_sign_in_at) : '—')}
          ${infoRow('حالة القفل', au?.banned_until ? `مقفول حتى ${dt(au.banned_until)}` : 'غير مقفول')}
        </div>
        <div class="v2-gov-actns">
          <button class="v2-gov-btn" id="v2-gov-pw-btn">تغيير كلمة المرور</button>
          ${p.is_active ? `<button class="v2-gov-btn v2-gov-btn-warn" data-acct="deactivate" data-orig="تعطيل الحساب">تعطيل الحساب</button>` : `<button class="v2-gov-btn v2-gov-btn-ok" data-acct="activate" data-orig="تفعيل الحساب">تفعيل الحساب</button>`}
          ${au?.banned_until ? `<button class="v2-gov-btn v2-gov-btn-ok" data-acct="unlock" data-orig="إلغاء القفل">إلغاء القفل</button>` : (au ? `<button class="v2-gov-btn v2-gov-btn-warn" data-acct="lock" data-orig="قفل الحساب">قفل الحساب</button>` : '')}
        </div>
      </div>
    </div>

    <div id="v2-gov-capabilities" class="v2-gov-tab">
      <div id="v2-gov-cap-content"><div class="v2-ol-loading">جارٍ تحميل الصلاحيات...</div></div>
    </div>

    <div id="v2-gov-governance" class="v2-gov-tab">
      <div id="v2-gov-gov-content"><div class="v2-ol-loading">جارٍ تحميل بيانات الحوكمة...</div></div>
    </div>

    <div id="v2-gov-audit" class="v2-gov-tab">
      <div id="v2-gov-audit-content"><div class="v2-ol-loading">جارٍ تحميل سجل التغييرات...</div></div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════
// PROFILE EDITOR
// ═══════════════════════════════════════════════

function showProfileEditor(container, p, employeeId, branches) {
  const oldData = JSON.stringify({ employee_code: p.employee_code, full_name: p.full_name, phone: p.phone, region_name: p.region_name });
  const html = overlay(`
    <h4 style="margin:0 0 1rem">تعديل بيانات الموظف</h4>
    <div class="v2-gov-form">
      <label>الكود <input id="f-code" value="${esc(p.employee_code || '')}" /></label>
      <label>الاسم <input id="f-name" value="${esc(p.full_name || '')}" /></label>
      <label>رقم الهاتف <input id="f-phone" value="${esc(p.phone || '')}" /></label>
      <label>المنطقة <input id="f-region" value="${esc(p.region_name || '')}" /></label>
    </div>
    <div class="v2-gov-form-actions">
      <button class="v2-gov-btn-sec" id="v2-gov-prof-cancel">إلغاء</button>
      <button class="v2-gov-btn" id="v2-gov-prof-save">حفظ</button>
    </div>`);
  const modal = document.createElement('div');
  modal.innerHTML = html;
  document.body.appendChild(modal);
  modal.querySelector('#v2-gov-prof-cancel')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#v2-gov-prof-save')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#v2-gov-prof-save'); btn.disabled = true; btn.textContent = '...';
    try {
      const vals = {
        employee_code: modal.querySelector('#f-code')?.value || '',
        full_name: modal.querySelector('#f-name')?.value || '',
        phone: modal.querySelector('#f-phone')?.value || '',
        region_name: modal.querySelector('#f-region')?.value || '',
      };
      await updateEmployeeProfile(employeeId, vals);
      await logGovernanceAction(employeeId, 'update_profile', 'employee',
        oldData, JSON.stringify(vals), p.full_name);
      modal.remove();
      renderOpsEmployee(container, { employeeId });
    } catch (e) { alert('خطأ: ' + e.message); btn.disabled = false; btn.textContent = 'حفظ'; }
  });
}

// ═══════════════════════════════════════════════
// PASSWORD MODAL
// ═══════════════════════════════════════════════

function showPasswordModal(container, employeeId) {
  const html = overlay(`
    <h4 style="margin:0 0 1rem">تغيير كلمة المرور</h4>
    <div class="v2-gov-form">
      <label>كلمة المرور الجديدة <input id="f-pw1" type="password" /></label>
      <label>تأكيد كلمة المرور <input id="f-pw2" type="password" /></label>
    </div>
    <div class="v2-gov-form-actions">
      <button class="v2-gov-btn-sec" id="v2-gov-pw-cancel">إلغاء</button>
      <button class="v2-gov-btn" id="v2-gov-pw-save">تغيير</button>
    </div>`);
  const modal = document.createElement('div');
  modal.innerHTML = html;
  document.body.appendChild(modal);
  modal.querySelector('#v2-gov-pw-cancel')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#v2-gov-pw-save')?.addEventListener('click', async () => {
    const pw1 = modal.querySelector('#f-pw1')?.value;
    const pw2 = modal.querySelector('#f-pw2')?.value;
    if (!pw1 || pw1.length < 3) { alert('كلمة المرور قصيرة جداً'); return; }
    if (pw1 !== pw2) { alert('كلمة المرور غير متطابقة'); return; }
    const btn = modal.querySelector('#v2-gov-pw-save'); btn.disabled = true; btn.textContent = '...';
    try {
      await changePassword(employeeId, pw1);
      await logGovernanceAction(employeeId, 'change_password', 'account');
      modal.remove();
      alert('تم تغيير كلمة المرور بنجاح');
    } catch (e) { alert('خطأ: ' + e.message); btn.disabled = false; btn.textContent = 'تغيير'; }
  });
}

// ═══════════════════════════════════════════════
// CAPABILITIES SECTION (3+4+5+6)
// ═══════════════════════════════════════════════

function renderCapabilitySection(container, allCaps, effectiveCaps, domains, effectiveMap, employeeId, profile) {
  const el = container.querySelector('#v2-gov-cap-content');
  const effectiveCount = effectiveCaps.filter(c => c.is_effective).length;
  const inheritedCount = effectiveCaps.filter(c => c.is_inherited).length;
  const directCount = effectiveCaps.filter(c => c.is_direct).length;

  let html = `
    <div class="v2-gov-card">
      <div class="v2-gov-cht"><span>الصلاحيات الفعالة حالياً</span>
        <span style="font-size:0.8rem;color:#6b7280">${effectiveCount} فعالة | ${inheritedCount} موروثة | ${directCount} مباشرة</span>
      </div>
      <div class="v2-gov-ctags">${effectiveCaps.filter(c => c.is_effective).slice(0, 20).map(c => `<span class="v2-gov-ctag v2-gov-ctag-on">${esc(c.capability_name)}</span>`).join('')}
        ${effectiveCount > 20 ? `<span class="v2-gov-ctag">+${effectiveCount - 20}</span>` : ''}
        ${effectiveCount === 0 ? '<span style="color:#9ca3af;font-size:0.875rem">لا توجد صلاحيات فعالة</span>' : ''}
      </div>
    </div>

    <div class="v2-gov-card">
      <div class="v2-gov-cht"><span>محرر الصلاحيات</span>
        <span style="font-size:0.8rem;color:#6b7280">تغيير فوري — يتم الحفظ مباشرة</span>
      </div>
      ${domains.map(d => `
        <div class="v2-gov-domain">
          <div class="v2-gov-domain-h">${d}</div>
          <div class="v2-gov-domain-caps">${allCaps.filter(c => c.capability_domain === d).map(c => {
            const eff = effectiveMap[c.capability_code];
            const isEff = eff?.is_effective === true;
            const isInh = eff?.is_inherited === true;
            const isDir = eff?.is_direct === true;
            const checked = isEff ? 'checked' : '';
            const srcClass = isInh && isDir ? 'v2-gov-src-both' : isInh ? 'v2-gov-src-inh' : isDir ? 'v2-gov-src-dir' : 'v2-gov-src-none';
            const srcLabel = isInh && isDir ? 'موروث + مباشر' : isInh ? 'موروث من الدور' : isDir ? 'تعيين مباشر' : 'غير مفعل';
            return `<div class="v2-gov-cap-item">
              <label class="v2-gov-cap-chk"><input type="checkbox" class="v2-gov-cap-cb" data-cap="${c.capability_code}" ${checked} ${isInh && !isDir ? 'disabled' : ''} />
                <span>${esc(c.capability_name)}</span>
              </label>
              <span class="v2-gov-src ${srcClass}">${srcLabel}</span>
            </div>`;
          }).join('')}
        </div>`).join('')}
    </div>`;

  el.innerHTML = html;

  // Capability checkbox handler with safety
  el.querySelectorAll('.v2-gov-cap-cb').forEach(cb => {
    cb.addEventListener('change', async () => {
      const capCode = cb.dataset.cap;
      const granted = cb.checked;
      // SAFETY: prevent SUPER_ADMIN self-lockout
      if (capCode === 'can_manage_system' || capCode === 'MANAGE_EMPLOYEES' || capCode === 'FULL_SYSTEM_ACCESS') {
        if (employeeId === CURRENT_USER_ID && !granted) {
          if (!confirm('تحذير: أنت على وشك إزالة صلاحية حوكمة حرجة عن نفسك. قد تفقد القدرة على الوصول إلى هذه الصفحة. هل أنت متأكد؟')) {
            cb.checked = true; return;
          }
        }
      }
      const oldState = JSON.stringify({ [capCode]: !granted });
      const newState = JSON.stringify({ [capCode]: granted });
      try {
        await setDirectCapability(employeeId, capCode, granted, CURRENT_USER_ID);
        await logGovernanceAction(employeeId, granted ? 'grant_capability' : 'revoke_capability',
          'capability', oldState, newState, profile.full_name);
        // Refresh the capability display
        const freshEff = await getEffectiveCapabilities(employeeId);
        const freshAll = Array.isArray(freshEff) ? freshEff : [];
        const newMap = {};
        freshAll.forEach(c => { newMap[c.capability_code] = c; });
        el.querySelectorAll('.v2-gov-cap-item').forEach(item => {
          const itemCb = item.querySelector('.v2-gov-cap-cb');
          if (!itemCb) return;
          const code = itemCb.dataset.cap;
          const eff = newMap[code];
          const isEff = eff?.is_effective === true;
          const isInh = eff?.is_inherited === true;
          const isDir = eff?.is_direct === true;
          const srcEl = item.querySelector('.v2-gov-src');
          if (srcEl) {
            srcEl.className = `v2-gov-src ${isInh && isDir ? 'v2-gov-src-both' : isInh ? 'v2-gov-src-inh' : isDir ? 'v2-gov-src-dir' : 'v2-gov-src-none'}`;
            srcEl.textContent = isInh && isDir ? 'موروث + مباشر' : isInh ? 'موروث من الدور' : isDir ? 'تعيين مباشر' : 'غير مفعل';
          }
          itemCb.checked = isEff;
          itemCb.disabled = isInh && !isDir;
        });
      } catch (e) { alert('خطأ: ' + e.message); cb.checked = !granted; }
    });
  });

  // Add role handler
  container.querySelector('#v2-gov-add-role')?.addEventListener('click', async () => {
    const roleList = await getRoles();
    const avail = (Array.isArray(roleList) ? roleList : []).filter(r => !new Set(empRoles.map(er => er.role_id)).has(r.id));
    if (!avail.length) { alert('جميع الأدوار مضافة بالفعل'); return; }
    const html = overlay(`
      <h4 style="margin:0 0 1rem">إضافة دور</h4>
      <div class="v2-gov-form">
        <label>الدور <select id="f-role">${avail.map(r => `<option value="${r.id}">${esc(r.role_name)} (${esc(r.role_code)})</option>`).join('')}</select></label>
      </div>
      <div class="v2-gov-form-actions">
        <button class="v2-gov-btn-sec" id="v2-gov-role-cancel">إلغاء</button>
        <button class="v2-gov-btn" id="v2-gov-role-save">إضافة</button>
      </div>`);
    const modal = document.createElement('div');
    modal.innerHTML = html;
    document.body.appendChild(modal);
    modal.querySelector('#v2-gov-role-cancel')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#v2-gov-role-save')?.addEventListener('click', async () => {
      const rid = modal.querySelector('#f-role')?.value;
      if (!rid) return;
      modal.querySelector('#v2-gov-role-save').disabled = true;
      try {
        await assignRole(employeeId, rid);
        await logGovernanceAction(employeeId, 'assign_role', 'role', null, JSON.stringify({ role_id: rid }), profile.full_name);
        modal.remove();
        renderOpsEmployee(container, { employeeId });
      } catch (e) { alert('خطأ: ' + e.message); }
    });
  });
}

// ═══════════════════════════════════════════════
// MANAGER EDITOR
// ═══════════════════════════════════════════════

function showManagerEditor(container, p, employeeId) {
  let selectedId = p.manager?.id || null;
  const html = overlay(`
    <h4 style="margin:0 0 1rem">تعيين المدير المباشر</h4>
    <div class="v2-gov-form">
      <label>المدير الحالي <input id="f-mgr-display" value="${esc(p.manager?.name || '—')}" readonly style="background:#f9fafb" /></label>
      <label>البحث عن موظف <input id="f-mgr-search" placeholder="ابحث بالاسم أو الكود..." autocomplete="off" /></label>
      <label>اختيار <select id="f-mgr-select" size="6" style="min-height:120px"></select></label>
    </div>
    <div class="v2-gov-form-actions">
      ${p.manager ? '<button class="v2-gov-btn v2-gov-btn-warn" id="v2-gov-mgr-remove">إزالة المشرف</button>' : ''}
      <button class="v2-gov-btn-sec" id="v2-gov-mgr-cancel">إلغاء</button>
      <button class="v2-gov-btn" id="v2-gov-mgr-save">حفظ</button>
    </div>`);
  const modal = document.createElement('div');
  modal.innerHTML = html;
  document.body.appendChild(modal);

  const select = modal.querySelector('#f-mgr-select');
  const search = modal.querySelector('#f-mgr-search');
  let allEmployees = [];

  const populateSelect = (list) => {
    select.innerHTML = list.map(e => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${esc(e.full_name)} (${esc(e.employee_code || '—')})</option>`).join('');
    if (!selectedId && list.length > 0) { select.value = list[0].id; selectedId = list[0].id; }
  };

  const doSearch = async (term) => {
    try {
      allEmployees = await searchEmployees(term);
      populateSelect(allEmployees);
    } catch { /* ignore */ }
  };

  // Initial load
  doSearch('');

  search.addEventListener('input', () => {
    const t = search.value.trim();
    if (t.length < 2) { populateSelect(allEmployees); return; }
    clearTimeout(search._timer);
    search._timer = setTimeout(() => doSearch(t), 300);
  });

  select.addEventListener('change', () => { selectedId = select.value; });

  modal.querySelector('#v2-gov-mgr-cancel')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#v2-gov-mgr-remove')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#v2-gov-mgr-remove'); btn.disabled = true; btn.textContent = '...';
    try {
      await removeManager(employeeId);
      await logGovernanceAction(employeeId, 'remove_manager', 'hierarchy', JSON.stringify({ manager_id: p.manager?.id }), null, p.full_name);
      modal.remove();
      renderOpsEmployee(container, { employeeId });
    } catch (e) { alert('خطأ: ' + e.message); btn.disabled = false; btn.textContent = 'إزالة المشرف'; }
  });
  modal.querySelector('#v2-gov-mgr-save')?.addEventListener('click', async () => {
    if (!selectedId) { alert('يرجى اختيار مشرف'); return; }
    const btn = modal.querySelector('#v2-gov-mgr-save'); btn.disabled = true; btn.textContent = '...';
    try {
      const old = JSON.stringify({ manager_id: p.manager?.id || null });
      await setManager(employeeId, selectedId);
      const newMgr = allEmployees.find(e => e.id === selectedId);
      await logGovernanceAction(employeeId, 'set_manager', 'hierarchy', old, JSON.stringify({ manager_id: selectedId, manager_name: newMgr?.full_name }), p.full_name);
      modal.remove();
      renderOpsEmployee(container, { employeeId });
    } catch (e) { alert('خطأ: ' + e.message); btn.disabled = false; btn.textContent = 'حفظ'; }
  });
}

// ═══════════════════════════════════════════════
// GOVERNANCE INSPECTOR (Section 8 — SUPER_ADMIN only)
// ═══════════════════════════════════════════════

function renderGovernanceInspector(container, p, effectiveCaps, allCaps, empRoles) {
  const el = container.querySelector('#v2-gov-gov-content');
  const isSuperAdmin = S?.role?.roleCode === 'SUPER_ADMIN';
  if (!isSuperAdmin) {
    el.innerHTML = '<div class="v2-gov-card"><p style="color:#9ca3af">لوحة فحص الحوكمة متاحة فقط لمشرف النظام (SUPER_ADMIN)</p></div>';
    return;
  }

  const allCapCodes = allCaps.map(c => c.capability_code);
  const inherited = effectiveCaps.filter(c => c.is_inherited).map(c => c.capability_code);
  const direct = effectiveCaps.filter(c => c.is_direct).map(c => c.capability_code);
  const effective = effectiveCaps.filter(c => c.is_effective).map(c => c.capability_code);

  el.innerHTML = `<div class="v2-gov-card">
      <div class="v2-gov-cht"><span>🔍 فحص الحوكمة</span><span class="v2-gov-badge" style="background:#dbeafe;color:#1e40af">SUPER_ADMIN</span></div>
      <div class="v2-gov-ins-grid">
        <div class="v2-gov-ins-item"><span class="v2-gov-ins-l">الدور الأساسي</span><span class="v2-gov-ins-v">${esc(p.roles?.[0]?.role_code || '—')} (${esc(p.roles?.[0]?.role_name || '—')})</span></div>
        <div class="v2-gov-ins-item"><span class="v2-gov-ins-l">عدد الأدوار</span><span class="v2-gov-ins-v">${esc(empRoles.length)}</span></div>
        <div class="v2-gov-ins-item"><span class="v2-gov-ins-l">الصلاحيات الموروثة</span><span class="v2-gov-ins-v">${inherited.length} / ${allCapCodes.length}</span></div>
        <div class="v2-gov-ins-item"><span class="v2-gov-ins-l">الصلاحيات المباشرة</span><span class="v2-gov-ins-v">${direct.length} / ${allCapCodes.length}</span></div>
        <div class="v2-gov-ins-item"><span class="v2-gov-ins-l">الصلاحيات الفعالة</span><span class="v2-gov-ins-v">${effective.length} / ${allCapCodes.length}</span></div>
        <div class="v2-gov-ins-item"><span class="v2-gov-ins-l">نطاق الإشراف</span><span class="v2-gov-ins-v">${p.manager ? 'متبوع لـ ' + esc(p.manager.name) : 'لا يوجد مشرف'}</span></div>
        <div class="v2-gov-ins-item"><span class="v2-gov-ins-l">حالة Auth</span><span class="v2-gov-ins-v">${p.auth_user_id ? 'مرتبط' : 'غير مرتبط'}</span></div>
        <div class="v2-gov-ins-item"><span class="v2-gov-ins-l">معرف الموظف</span><span class="v2-gov-ins-v" style="font-size:11px;direction:ltr">${esc(p.id)}</span></div>
      </div>
    </div>
    <div class="v2-gov-card">
      <div class="v2-gov-cht"><span>جميع الصلاحيات — تشخيص</span></div>
      <div style="max-height:400px;overflow-y:auto;font-size:0.8rem">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f9fafb"><th style="padding:0.4rem 0.5rem;text-align:right;border-bottom:1px solid #e5e7eb">الكود</th>
            <th style="padding:0.4rem 0.5rem;text-align:right;border-bottom:1px solid #e5e7eb">موروث</th>
            <th style="padding:0.4rem 0.5rem;text-align:right;border-bottom:1px solid #e5e7eb">مباشر</th>
            <th style="padding:0.4rem 0.5rem;text-align:right;border-bottom:1px solid #e5e7eb">فعال</th></tr></thead>
          <tbody>${allCapCodes.map(code => {
            const eff = effectiveCaps.find(c => c.capability_code === code);
            return `<tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:0.3rem 0.5rem;font-family:monospace">${esc(code)}</td>
              <td style="padding:0.3rem 0.5rem">${eff?.is_inherited ? '✓' : '—'}</td>
              <td style="padding:0.3rem 0.5rem">${eff?.is_direct ? '✓' : '—'}</td>
              <td style="padding:0.3rem 0.5rem">${eff?.is_effective ? '✓' : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════
// AUDIT TRAIL (Section 10)
// ═══════════════════════════════════════════════

async function renderAuditSection(container, employeeId) {
  const el = container.querySelector('#v2-gov-audit-content');
  try {
    const trail = await getAuditTrail(employeeId);
    const entries = Array.isArray(trail) ? trail : [];
    el.innerHTML = `<div class="v2-gov-card">
      <div class="v2-gov-cht"><span>سجل التغييرات</span><span style="font-size:0.8rem;color:#6b7280">آخر ${entries.length} حدث</span></div>
      ${entries.length === 0 ? '<p style="color:#9ca3af;font-size:0.875rem">لا توجد تغييرات مسجلة بعد</p>' :
        `<div style="max-height:500px;overflow-y:auto"><table class="v2-gov-audit-tbl"><thead><tr>
          <th>التاريخ</th><th>الإجراء</th><th>النوع</th><th>المُبلغ</th><th>المصدر</th>
        </tr></thead><tbody>${entries.map(e => `<tr>
          <td style="white-space:nowrap;direction:ltr;font-size:0.75rem">${dt(e.created_at)}</td>
          <td>${esc(e.action_type || '')}</td>
          <td>${esc(e.entity_type || '')}</td>
          <td>${esc(e.actor_name || e.actor_id || '—')}</td>
          <td>${esc(e.source_module || '—')}</td>
        </tr>`).join('')}</tbody></table></div>`}
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="v2-gov-card"><p style="color:#dc2626">فشل تحميل سجل التغييرات: ${esc(e.message)}</p></div>`;
  }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════

function infoRow(l, v) { return `<div class="v2-gov-gr-it"><span class="v2-gov-gr-l">${l}</span><span class="v2-gov-gr-v">${v}</span></div>`; }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function dt(d) { if (!d) return ''; return new Date(d).toLocaleString('ar-EG-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function overlay(inner) {
  return `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:2000;display:flex;align-items:center;justify-content:center" data-close>
    <div style="background:#fff;border-radius:8px;padding:1.5rem;min-width:380px;max-width:480px;box-shadow:0 4px 24px rgba(0,0,0,0.15)" onclick="event.stopPropagation()">${inner}</div>
  </div>`;
}
