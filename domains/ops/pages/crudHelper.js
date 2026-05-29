import { getSession } from '../../../auth/sessionService.js';
import { readConfig } from '../../../config.js';

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

export function showModal(title, fields, data, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'v2-modal-overlay';
  overlay.innerHTML = `<div class="v2-modal"><div class="v2-modal-h"><h3>${title}</h3><button class="v2-modal-x">&times;</button></div><form class="v2-modal-f">${fields.map(f => {
    const val = data?.[f.key] != null ? String(data[f.key]).replace(/"/g, '&quot;') : (f.default || '');
    if (f.type === 'select') {
      return `<label class="v2-fl">${f.label}<select name="${f.key}" class="v2-fi">${f.options.map(o => `<option value="${o.value}"${val === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}</select></label>`;
    }
    if (f.type === 'textarea') {
      return `<label class="v2-fl">${f.label}<textarea name="${f.key}" class="v2-fi" rows="3">${val}</textarea></label>`;
    }
    if (f.type === 'checkbox') {
      return `<label class="v2-fl v2-fl-row"><input type="checkbox" name="${f.key}"${val === 'true' || val === '1' ? ' checked' : ''} class="v2-fi v2-fi-chk"/>${f.label}</label>`;
    }
    return `<label class="v2-fl">${f.label}<input type="${f.type || 'text'}" name="${f.key}" value="${val}" class="v2-fi" ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${f.placeholder}"` : ''}/></label>`;
  }).join('')}<div class="v2-modal-actions"><button type="submit" class="v2-btn v2-btn-primary">${data ? 'حفظ' : 'إضافة'}</button><button type="button" class="v2-btn v2-btn-cancel v2-modal-x">إلغاء</button></div></form></div>`;

  const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
  overlay.querySelectorAll('.v2-modal-x').forEach(b => b.addEventListener('click', close));
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const vals = {};
    fields.forEach(f => {
      const input = e.target.querySelector(`[name="${f.key}"]`);
      vals[f.key] = f.type === 'checkbox' ? (input.checked ? 'true' : 'false') : fd.get(f.key) || '';
    });
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'جاري...';
    try { await onSubmit(vals); close(); } catch (err) { alert(err.message || 'فشل'); btn.disabled = false; btn.textContent = data ? 'حفظ' : 'إضافة'; }
  });
  document.body.appendChild(overlay);
  overlay.querySelector('input:not([type=checkbox])')?.focus();
}

export async function confirmDelete(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'v2-modal-overlay';
    overlay.innerHTML = `<div class="v2-modal v2-modal-sm"><div class="v2-modal-h"><h3>تأكيد الحذف</h3></div><p style="padding:16px;text-align:center">${message}</p><div class="v2-modal-actions"><button class="v2-btn v2-btn-danger" id="v2-cfm-yes">نعم، احذف</button><button class="v2-btn v2-btn-cancel" id="v2-cfm-no">إلغاء</button></div></div>`;
    const close = r => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(r); };
    overlay.querySelector('#v2-cfm-yes').addEventListener('click', () => close(true));
    overlay.querySelector('#v2-cfm-no').addEventListener('click', () => close(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.body.appendChild(overlay);
  });
}

export async function apiPost(table, body) {
  const r = await fetch(`${API}/${table}`, { method: 'POST', headers: { ..._h(), Prefer: 'return=representation' }, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(t || 'فشل الإضافة'); }
  return r.json();
}

export async function apiPatch(table, id, body) {
  const r = await fetch(`${API}/${table}?id=eq.${id}`, { method: 'PATCH', headers: _h(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('فشل التحديث');
}

export async function apiDelete(table, id) {
  const r = await fetch(`${API}/${table}?id=eq.${id}`, { method: 'DELETE', headers: _h() });
  if (!r.ok) throw new Error('فشل الحذف');
}

export function addStyles() {
  if (document.getElementById('v2-crud-styles')) return;
  const s = document.createElement('style');
  s.id = 'v2-crud-styles';
  s.textContent = `
.v2-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999}
.v2-modal{background:#fff;border-radius:12px;width:90%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.2)}
.v2-modal-sm{max-width:380px}
.v2-modal-h{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e5e7eb}
.v2-modal-h h3{margin:0;font-size:16px}
.v2-modal-x{background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280;padding:0 4px}
.v2-modal-f{padding:16px 20px}
.v2-fl{display:block;margin-bottom:12px;font-size:13px;color:#374151}
.v2-fl-row{display:flex;align-items:center;gap:8px;cursor:pointer}
.v2-fi{display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box}
.v2-fi-chk{width:auto;margin:0}
select.v2-fi{background:#fff}
.v2-modal-actions{display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid #e5e7eb}
.v2-btn{padding:8px 20px;border:none;border-radius:6px;font-size:14px;cursor:pointer}
.v2-btn-primary{background:#0052cc;color:#fff}
.v2-btn-danger{background:#dc2626;color:#fff}
.v2-btn-cancel{background:#e5e7eb;color:#374151}
.v2-btn-sm{padding:4px 12px;font-size:12px;border-radius:4px}
.v2-btn-ghost{background:transparent;color:#6b7280;border:1px solid #d1d5db}
.v2-crud-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.v2-crud-bar .v2-btn{display:inline-flex;align-items:center;gap:4px}
.v2-crud-actions{display:flex;gap:4px}
.v2-crud-actions button{font-size:11px;padding:3px 8px;border:none;border-radius:4px;cursor:pointer}
.v2-crud-edit{background:#dbeafe;color:#1e40af}
.v2-crud-del{background:#fee2e2;color:#dc2626}

/* ===== Orders Status Cards ===== */
.v2-osc-row{display:flex;gap:8px;overflow-x:auto;padding:8px 0 12px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.v2-osc-row::-webkit-scrollbar{display:none}
.v2-osc-card{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 16px;border:2px solid #e5e7eb;border-radius:12px;background:#fff;cursor:pointer;min-width:72px;transition:border-color .2s,background .2s;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.v2-osc-card:hover{border-color:#9ca3af}
.v2-osc-active{border-width:2px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
.v2-osc-icon{font-size:20px;line-height:1}
.v2-osc-label{font-size:11px;font-weight:600;white-space:nowrap}
.v2-osc-count{font-size:10px;font-weight:700;color:#fff;border-radius:10px;padding:1px 8px;min-width:20px;text-align:center;line-height:18px}

/* ===== Orders Cards ===== */
.v2-oc-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.v2-oc-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px}
.v2-oc-left{flex:1;min-width:0}
.v2-oc-number{font-weight:700;font-size:14px;color:#0052cc;text-decoration:none}
.v2-oc-priority{display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;margin-right:6px;vertical-align:middle}
.v2-oc-priority-urgent{background:#fef2f2;color:#dc2626}
.v2-oc-priority-high{background:#fffbeb;color:#d97706}
.v2-oc-customer{font-size:13px;color:#374151;margin-top:2px}
.v2-oc-right{text-align:left;flex-shrink:0;margin-right:8px}
.v2-oc-amount{font-weight:700;font-size:15px;color:#059669}
.v2-oc-status{display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;color:#fff;border-radius:6px;padding:2px 8px;margin-top:4px}
.v2-oc-status-icon{font-size:12px}
.v2-oc-mid{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#6b7280;padding:6px 0 8px;border-top:1px solid #f3f4f6;margin-top:6px}
.v2-oc-mid-item{display:inline-flex;align-items:center;gap:2px}
.v2-oc-bottom{display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid #f3f4f6}
.v2-oc-select{font-size:12px;padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:pointer;max-width:160px}
.v2-oc-del{background:none;border:none;font-size:16px;cursor:pointer;padding:4px 8px;border-radius:6px}
.v2-oc-del:hover{background:#fee2e2}
.v2-oc-no-actions{color:#d1d5db;font-size:12px}

/* ===== Reps KPI Header ===== */
.v2-rpr-filter{display:flex;align-items:center;gap:8px;padding:10px 0;flex-wrap:wrap}
.v2-rpr-filter-lbl{font-size:12px;color:#6b7280;font-weight:600}
.v2-rpr-filter-inp{border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:13px;color:#374151;background:#fff}
.v2-rpr-kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:16px}
.v2-rpr-kpi{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:2px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.v2-rpr-kpi-icon{font-size:20px}
.v2-rpr-kpi-val{font-size:18px;font-weight:700;color:#111827}
.v2-rpr-kpi-lbl{font-size:11px;color:#6b7280}

/* ===== Ranking Table ===== */
.v2-rpr-tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.v2-rpr-tbl{width:100%;border-collapse:collapse;font-size:13px;min-width:600px}
.v2-rpr-tbl th{text-align:right;padding:8px 10px;background:#f9fafb;color:#374151;font-weight:600;border-bottom:2px solid #e5e7eb;white-space:nowrap}
.v2-rpr-tbl-sort{cursor:pointer;user-select:none}
.v2-rpr-tbl-sort:hover{color:#0052cc}
.v2-rpr-tbl td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
.v2-rpr-tbl-row{transition:background .15s}
.v2-rpr-tbl-row:hover{background:#f9fafb}
.v2-rpr-tbl-rank{width:40px;text-align:center}
.v2-rpr-rank-num{color:#9ca3af;font-size:13px}
.v2-rpr-rank-badge{font-size:18px;line-height:1}
.v2-rpr-tbl-name{color:#0052cc;text-decoration:none;font-weight:600}
.v2-rpr-tbl-name:hover{text-decoration:underline}
.v2-rpr-tbl-num{text-align:left;font-variant-numeric:tabular-nums;direction:ltr}
.v2-rpr-pct{font-size:11px;font-weight:700;padding:1px 6px;border-radius:4px;display:inline-block}
.v2-rpr-pct-high{background:#d1fae5;color:#065f46}
.v2-rpr-pct-mid{background:#fef3c7;color:#92400e}
.v2-rpr-pct-low{background:#fee2e2;color:#dc2626}

/* ===== Rep Profile Operational Sections ===== */
.v2-orp-today{background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:1px solid #dbeafe;border-radius:12px;padding:14px;margin-bottom:16px}
.v2-orp-today-title{font-size:14px;font-weight:700;color:#1e40af;margin-bottom:8px}
.v2-orp-today-row{display:flex;gap:12px;flex-wrap:wrap}
.v2-orp-today-stat{flex:1;min-width:80px;text-align:center}
.v2-orp-today-val{display:block;font-size:20px;font-weight:700;color:#111827}
.v2-orp-today-lbl{display:block;font-size:11px;color:#6b7280;margin-top:2px}
.v2-orp-section{margin-bottom:16px}
.v2-orp-section-title{font-size:14px;font-weight:700;color:#111827;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.v2-orp-list{display:flex;flex-direction:column;gap:6px}
.v2-orp-list-item{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none;color:inherit;transition:background .15s;cursor:pointer}
.v2-orp-list-item:hover{background:#f9fafb}
.v2-orp-list-l{display:flex;align-items:center;gap:8px;min-width:0;flex:1}
.v2-orp-list-r{text-align:left;flex-shrink:0}
.v2-orp-list-val{display:block;font-size:14px;font-weight:700;color:#059669;direction:ltr;text-align:left}
.v2-orp-list-sub{display:block;font-size:11px;color:#6b7280;margin-top:1px}
.v2-orp-rank-badge-sm{font-size:16px;line-height:1;flex-shrink:0}
.v2-orp-empty{text-align:center;color:#9ca3af;padding:16px;font-size:13px}

/* ===== Reps Ranking Sections (additions) ===== */
.v2-rpr-section{margin-bottom:20px}
.v2-rpr-section-title{font-size:15px;font-weight:700;color:#111827;margin-bottom:10px}
.v2-rpr-list{display:flex;flex-direction:column;gap:8px}
.v2-rpr-card{display:flex;align-items:center;gap:12px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.05);transition:box-shadow .2s}
.v2-rpr-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.1)}
.v2-rpr-rank{font-size:13px;font-weight:700;width:28px;text-align:center;flex-shrink:0}
.v2-rpr-rank-0{color:#f59e0b}
.v2-rpr-rank-1{color:#9ca3af}
.v2-rpr-rank-2{color:#d97706}
.v2-rpr-avatar{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0052cc,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0}
.v2-rpr-body{flex:1;min-width:0}
.v2-rpr-name{font-weight:700;font-size:14px;color:#111827}
.v2-rpr-region{font-size:11px;color:#6b7280}
.v2-rpr-metrics{display:flex;gap:12px;margin-top:4px;flex-wrap:wrap}
.v2-rpr-metric{font-size:11px;color:#6b7280}
.v2-rpr-metric-val{font-weight:700;color:#374151;direction:ltr;display:inline-block}
.v2-rpr-bar{height:4px;background:#e5e7eb;border-radius:2px;margin-top:6px;overflow:hidden}
.v2-rpr-bar-fill{height:100%;background:linear-gradient(90deg,#0052cc,#3b82f6);border-radius:2px;transition:width .4s}
.v2-rpr-bar-green{background:linear-gradient(90deg,#059669,#10b981)}
.v2-rpr-bar-purple{background:linear-gradient(90deg,#7c3aed,#8b5cf6)}
.v2-rpr-status{font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;flex-shrink:0}
.v2-rpr-status-on{background:#d1fae5;color:#065f46}
.v2-rpr-status-off{background:#fee2e2;color:#dc2626}

/* ===== Reps Profile Stats ===== */
.v2-orp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
.v2-orp-stat{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;text-align:center}
.v2-orp-stat-val{font-weight:700;font-size:16px;color:#111827;direction:ltr}
.v2-orp-stat-lbl{font-size:10px;color:#6b7280;margin-top:2px}

/* ===== Reps Profile Header ===== */
.v2-orp-header{display:flex;gap:12px;align-items:center;margin-bottom:16px;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:12px}
.v2-orp-avatar{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#0052cc,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;flex-shrink:0}
.v2-orp-h-body{flex:1}
.v2-orp-name{font-size:16px;font-weight:700;color:#111827}
.v2-orp-code{font-size:12px;color:#6b7280}
.v2-orp-region{font-size:12px;color:#6b7280}
.v2-orp-phone{font-size:12px;color:#374151}
.v2-orp-meta{display:flex;gap:6px;flex-wrap:wrap}

/* ===== Reps Profile Tabs ===== */
.v2-orp-tabs{display:flex;gap:6px;margin-bottom:10px;border-bottom:2px solid #e5e7eb;padding-bottom:6px}
.v2-orp-tab{background:none;border:none;padding:6px 14px;font-size:13px;color:#6b7280;cursor:pointer;border-radius:6px;font-weight:600;transition:all .15s}
.v2-orp-tab-active{background:#eff6ff;color:#0052cc}
.v2-orp-tab:hover{color:#374151}
.v2-orp-tab-list{display:flex;flex-direction:column;gap:6px}
.v2-orp-tab-item{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;text-decoration:none;color:inherit;cursor:pointer}
.v2-orp-tab-item:hover{background:#f9fafb}
.v2-orp-tab-empty{text-align:center;color:#9ca3af;padding:24px}
.v2-orp-cust-name{font-weight:600;font-size:14px;color:#111827}
.v2-orp-cust-phone{font-size:11px;color:#6b7280;margin-top:2px}
.v2-orp-cust-stat{font-weight:700;color:#059669;direction:ltr}
.v2-orp-cust-stat-sub{font-size:11px;color:#6b7280;direction:ltr}
.v2-orp-status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-left:6px}
.v2-orp-status-dot.active,.v2-orp-status-dot.open{background:#f59e0b}
.v2-orp-status-dot.completed{background:#10b981}
.v2-orp-status-dot.cancelled{background:#ef4444}

/* ===== Reps Profile Chart (legacy, kept for reference) ===== */
.v2-orp-chart{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px}
.v2-orp-chart-title{font-size:14px;font-weight:700;color:#111827;margin-bottom:12px}
.v2-orp-chart-bars{display:flex;align-items:flex-end;gap:6px;height:120px;padding-top:20px}
.v2-orp-chart-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
.v2-orp-chart-bar{width:100%;background:linear-gradient(180deg,#0052cc,#3b82f6);border-radius:4px 4px 0 0;min-height:4px;position:relative;transition:height .4s}
.v2-orp-chart-val{position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:#374151;direction:ltr;white-space:nowrap}
.v2-orp-chart-label{font-size:10px;color:#6b7280;margin-top:4px}

/* ===== Reps Profile Tabs (full lists) ===== */
.v2-orp-tab-item-left{flex:1;min-width:0}
.v2-orp-tab-item-right{text-align:left;flex-shrink:0}

/* ===== Reps List Grid ===== */
.v2-orl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.v2-orl-card{display:block;padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.05);transition:box-shadow .2s}
.v2-orl-card:hover{box-shadow:0 2px 8px rgba(0,0,0,.1)}
.v2-orl-card-top{display:flex;gap:10px;align-items:center;margin-bottom:6px}
.v2-orl-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#059669,#10b981);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0}
.v2-orl-card-h{flex:1}
.v2-orl-name{font-weight:700;font-size:14px;color:#111827}
.v2-orl-meta{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
.v2-orl-badge{font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px}
.v2-orl-badge-on{background:#d1fae5;color:#065f46}
.v2-orl-badge-off{background:#fee2e2;color:#dc2626}
.v2-orl-badge-live{background:#fef3c7;color:#92400e}
.v2-orl-region{font-size:11px;color:#6b7280;margin-bottom:4px}
.v2-orl-stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:6px 0}
.v2-orl-s{text-align:center}
.v2-orl-sv{display:block;font-size:13px;font-weight:700;color:#374151;direction:ltr}
.v2-orl-sl{display:block;font-size:10px;color:#6b7280}
.v2-orl-phone{font-size:11px;color:#6b7280;direction:ltr}

/* ===== OCC - Operational Customer Cards ===== */
.v2-occ-bar{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.v2-occ-title{font-size:18px;font-weight:700;color:#111827;margin:0}
.v2-occ-count{background:#e5e7eb;color:#374151;border-radius:10px;padding:1px 10px;font-size:12px;font-weight:600;line-height:22px}
.v2-occ-search{margin-bottom:12px}
.v2-occ-search-inp{width:100%;padding:10px 14px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;box-sizing:border-box;background:#fff}
.v2-occ-empty{text-align:center;color:#9ca3af;padding:40px 16px;font-size:14px}
.v2-occ-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
.v2-occ-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;text-decoration:none;color:inherit;box-shadow:0 1px 3px rgba(0,0,0,.05);transition:box-shadow .2s,transform .15s;display:block;position:relative;overflow:hidden}
.v2-occ-card:hover{box-shadow:0 4px 16px rgba(0,0,0,.1);transform:translateY(-1px)}
.v2-occ-card-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
.v2-occ-avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex-shrink:0}
.v2-occ-card-h{flex:1;min-width:0}
.v2-occ-card-name{font-weight:700;font-size:15px;color:#111827;line-height:1.3}
.v2-occ-card-meta{display:flex;gap:4px;flex-wrap:wrap;margin-top:3px}
.v2-occ-badge{font-size:10px;font-weight:600;padding:1px 7px;border-radius:4px}
.v2-occ-badge-on{background:#d1fae5;color:#065f46}
.v2-occ-badge-off{background:#fee2e2;color:#dc2626}
.v2-occ-seg{font-size:10px;font-weight:700;padding:1px 7px;border-radius:4px}
.v2-occ-seg-vip{background:#fef3c7;color:#92400e;border:1px solid #f59e0b}
.v2-occ-seg-gold{background:#fffbeb;color:#b45309;border:1px solid #d97706}
.v2-occ-seg-silver{background:#f3f4f6;color:#4b5563;border:1px solid #d1d5db}
.v2-occ-seg-regular{background:#f0fdf4;color:#166534;border:1px solid #86efac}
.v2-occ-seg-new{background:#eff6ff;color:#1e40af;border:1px solid #93c5fd}
.v2-occ-card-amount{font-weight:700;font-size:16px;color:#059669;direction:ltr;text-align:left;white-space:nowrap;flex-shrink:0}
.v2-occ-card-body{padding-top:8px;border-top:1px solid #f3f4f6}
.v2-occ-card-info{display:flex;flex-direction:column;gap:3px;font-size:12px;color:#6b7280;margin-bottom:8px}
.v2-occ-card-info span{display:flex;align-items:center;gap:4px}
.v2-occ-card-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:8px}
.v2-occ-stat{text-align:center;background:#f9fafb;border-radius:8px;padding:6px 4px}
.v2-occ-stat-val{display:block;font-size:15px;font-weight:700;color:#374151;direction:ltr}
.v2-occ-stat-lbl{display:block;font-size:10px;color:#6b7280;margin-top:1px}
.v2-occ-card-footer{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:#6b7280}
.v2-occ-rep{color:#374151;font-weight:600}
.v2-occ-rep-none{color:#d1d5db;font-weight:400}
.v2-occ-date{color:#6b7280}
.v2-occ-card-actions{display:flex;gap:6px;padding:8px 0 0;margin-top:8px;border-top:1px solid #f3f4f6}
.v2-occ-action-edit{font-size:11px;color:#0052cc;cursor:pointer;padding:3px 8px;border-radius:4px;background:#eff6ff}
.v2-occ-action-edit:hover{background:#dbeafe}
.v2-occ-action-reassign{font-size:11px;color:#7c3aed;cursor:pointer;padding:3px 8px;border-radius:4px;background:#f5f3ff}
.v2-occ-action-reassign:hover{background:#ede9fe}

/* ===== OCCP - Customer Profile Runtime ===== */
.v2-occp-header{display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;padding:14px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;flex-wrap:wrap}
.v2-occp-avatar{width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;flex-shrink:0}
.v2-occp-h-body{flex:1;min-width:200px}
.v2-occp-h-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.v2-occp-name{font-size:17px;font-weight:700;color:#111827}
.v2-occp-meta{display:flex;gap:4px;align-items:center}
.v2-occp-info{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#6b7280;margin-top:4px}
.v2-occp-links{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;margin-top:6px}
.v2-occp-rep{color:#0052cc;font-weight:600;text-decoration:none}
.v2-occp-rep-none{color:#d1d5db}
.v2-occp-date{color:#6b7280}
.v2-occp-actions{display:flex;gap:6px;flex-shrink:0}
.v2-occp-stats-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:16px}
.v2-occp-stat{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;text-align:center}
.v2-occp-stat-val{display:block;font-weight:700;font-size:15px;color:#111827;direction:ltr}
.v2-occp-stat-lbl{display:block;font-size:10px;color:#6b7280;margin-top:2px}
.v2-occp-rec-row{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.v2-occp-rec{border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;font-size:13px}
.v2-occp-rec-icon{font-size:20px;flex-shrink:0}
.v2-occp-rec strong{font-size:13px}
.v2-occp-rec-desc{font-size:11px;color:inherit;opacity:.8}
.v2-occp-rec-visit{background:#eff6ff;border:1px solid #93c5fd;color:#1e40af}
.v2-occp-rec-reactivate{background:#fef2f2;border:1px solid #fca5a5;color:#dc2626}
.v2-occp-rec-followup{background:#fffbeb;border:1px solid #fcd34d;color:#92400e}
.v2-occp-rec-upsell{background:#f0fdf4;border:1px solid #86efac;color:#166534}
.v2-occp-rec-frequency{background:#f5f3ff;border:1px solid #c4b5fd;color:#5b21b6}
.v2-occp-rec-visit_needed{background:#fef3c7;border:1px solid #f59e0b;color:#92400e}
.v2-occp-rec-stable{background:#f9fafb;border:1px solid #e5e7eb;color:#374151}
.v2-occp-rec-new{background:#eff6ff;border:1px solid #93c5fd;color:#1e40af}
.v2-occp-section{margin-bottom:16px}
.v2-occp-section-title{font-size:14px;font-weight:700;color:#111827;margin-bottom:8px}
.v2-occp-inv-list{display:flex;flex-direction:column;gap:6px}
.v2-occp-inv-card{display:block;padding:10px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;text-decoration:none;color:inherit;transition:background .15s}
.v2-occp-inv-card:hover{background:#f9fafb}
.v2-occp-inv-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.v2-occp-inv-number{font-weight:700;font-size:14px;color:#0052cc}
.v2-occp-inv-amount{font-weight:700;font-size:14px;color:#059669;direction:ltr}
.v2-occp-inv-mid{display:flex;gap:10px;font-size:11px;color:#6b7280;flex-wrap:wrap}
.v2-occp-list{display:flex;flex-direction:column;gap:4px}
.v2-occp-list-item{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#fff;border:1px solid #f3f4f6;border-radius:8px;font-size:13px}
.v2-occp-list-l{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.v2-occp-list-r{color:#059669;font-weight:600;direction:ltr;text-align:left;flex-shrink:0;font-size:13px}
.v2-occp-rank-num{color:#9ca3af;font-weight:700;font-size:12px;width:18px;text-align:center;flex-shrink:0}

/* ===== Dashboard Operational Pulse ===== */
@keyframes v2-pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes v2-pulse-dot{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.4)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}
@keyframes v2-sla-urgent{0%,100%{background:#fef2f2}50%{background:#fee2e2}}
.v2-ops-pq-count-alert{animation:v2-pulse 1.5s ease-in-out infinite;background:#dc2626!important}
.v2-ops-pq-item.v2-pq-delayed .v2-ops-pq-count{background:#f59e0b}
.v2-ops-pq-item.v2-pq-urgent .v2-ops-pq-count{background:#dc2626;animation:v2-pulse 1.5s ease-in-out infinite}
.v2-ops-pq-dot-green.v2-ops-pq-active{animation:v2-pulse-dot 2s ease-in-out infinite;box-shadow:0 0 0 3px rgba(16,185,129,.3);background:#10b981}
.v2-ops-pq-item:hover{background:#f9fafb;transform:translateX(-2px)}
.v2-ops-pq-item{transition:all .15s;cursor:pointer;position:relative}
.v2-pq-badge-urgent{position:absolute;top:-4px;left:-4px;background:#dc2626;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;animation:v2-pulse 2s ease-in-out infinite}
.v2-pq-badge-working{position:absolute;top:-4px;left:-4px;background:#7c3aed;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px}
.v2-pq-badge-live{position:absolute;top:-4px;left:-4px;background:#059669;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px}

/* Reports */
.v2-rpt-summary{background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:14px;font-weight:600;color:#1e40af}
.v2-rpt-empty{text-align:center;color:#9ca3af;padding:40px 16px;font-size:14px}
.v2-rpt-list{display:flex;flex-direction:column;gap:6px}
.v2-rpt-item{padding:8px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;font-size:13px}
.v2-report-btn{display:block;width:100%;text-align:right;padding:8px 12px;margin-bottom:4px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;color:#374151;cursor:pointer;transition:background .15s}
.v2-report-btn:hover{background:#eff6ff;border-color:#93c5fd;color:#1e40af}
.v2-report-sections{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:12px}
.v2-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden}
.v2-card-h{padding:12px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb}
.v2-card-h h3{margin:0;font-size:14px;font-weight:700;color:#111827}
.v2-card-b{padding:10px 14px}
.v2-dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:12px}
.v2-dash-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center}
.v2-dash-num{font-size:22px;font-weight:700;color:#111827;direction:ltr}
.v2-dash-lbl{font-size:11px;color:#6b7280;margin-top:4px}
`;
  document.head.appendChild(s);
}
