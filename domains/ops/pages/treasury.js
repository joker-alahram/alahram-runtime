import { getTreasurySummary, getCashboxes, getExpenseCategories, recordTransaction, createCashbox } from '../../../services/ops/treasuryApi.js';

const T = { title: 'الخزينة', totalBalance: 'إجمالي الخزينة', cashboxes: 'الخزن', collections: 'المقبوضات', payments: 'المدفوعات', transactions: 'آخر المعاملات', noData: 'لا توجد معاملات بعد', type: 'النوع', amount: 'المبلغ', method: 'طريقة الدفع', date: 'التاريخ', cashbox: 'الخزنة', notes: 'ملاحظات', loading: 'جارٍ التحميل...', addCollection: 'تسجيل مقبوض', addExpense: 'تسجيل مصروف', newCashbox: 'إضافة خزنة', save: 'حفظ', cancel: 'إلغاء', success: 'تم الحفظ بنجاح', error: 'حدث خطأ' };

export async function renderOpsTreasury(container, params) {
  container.innerHTML = `
    <div style="padding:1.5rem">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">
        <h3 style="margin:0;font-size:1.25rem">${T.title}</h3>
        <div style="display:flex;gap:0.5rem">
          <button class="v2-tb" data-action="collection">${T.addCollection}</button>
          <button class="v2-tb" data-action="expense">${T.addExpense}</button>
          <button class="v2-tb" data-action="cashbox">${T.newCashbox}</button>
        </div>
      </div>
      <div id="v2-treasury-content" style="text-align:center;padding:2rem;color:#6b7280">${T.loading}</div>
      <div id="v2-treasury-modal"></div>
    </div>`;

  const content = container.querySelector('#v2-treasury-content');
  const modalEl = container.querySelector('#v2-treasury-modal');
  await renderDashboard(content, modalEl);

  container.querySelector('[data-action="collection"]')?.addEventListener('click', () => showModal(modalEl, 'collection', content));
  container.querySelector('[data-action="expense"]')?.addEventListener('click', () => showModal(modalEl, 'expense', content));
  container.querySelector('[data-action="cashbox"]')?.addEventListener('click', () => showModal(modalEl, 'cashbox', content));
}

async function renderDashboard(content, modalEl) {
  const [summary, cashboxes, categories] = await Promise.all([getTreasurySummary(), getCashboxes(), getExpenseCategories()]);

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem">
      <div class="v2-tc-card"><div class="v2-tc-val">${fmt(summary?.total_cashbox_balance ?? 0)}</div><div class="v2-tc-lbl">${T.totalBalance}</div></div>
      <div class="v2-tc-card"><div class="v2-tc-val" style="color:#059669">${fmt(summary?.total_collections ?? 0)}</div><div class="v2-tc-lbl">${T.collections}</div></div>
      <div class="v2-tc-card"><div class="v2-tc-val" style="color:#dc2626">${fmt(summary?.total_payments ?? 0)}</div><div class="v2-tc-lbl">${T.payments}</div></div>
    </div>
    <div style="margin-bottom:1.5rem">
      <h4 style="margin:0 0 0.75rem;font-size:1rem;color:#374151">${T.cashboxes}</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.75rem">
        ${cashboxes.length ? cashboxes.map(cb => `
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:0.75rem">
            <div style="font-size:0.875rem;font-weight:600;color:#111827">${esc(cb.name)}</div>
            <div style="font-size:1rem;font-weight:700;color:#374151;margin-top:0.25rem">${fmt(cb.current_balance)}</div>
            <div style="font-size:0.75rem;color:#6b7280;margin-top:0.125rem">${cb.status === 'active' ? 'نشط' : 'غير نشط'}</div>
          </div>
        `).join('') : '<div style="color:#9ca3af;font-size:0.875rem">لا توجد خزن</div>'}
      </div>
    </div>
    <div>
      <h4 style="margin:0 0 0.75rem;font-size:1rem;color:#374151">${T.transactions}</h4>
      ${renderTransactions(summary?.recent_transactions)}
    </div>`;
}

function renderTransactions(txns) {
  if (!txns || !txns.length) return `<div style="color:#9ca3af;font-size:0.875rem">${T.noData}</div>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:0.875rem">
    <thead><tr style="background:#f9fafb">
      <th style="padding:0.5rem 0.75rem;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">${T.type}</th>
      <th style="padding:0.5rem 0.75rem;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">${T.amount}</th>
      <th style="padding:0.5rem 0.75rem;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">${T.method}</th>
      <th style="padding:0.5rem 0.75rem;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">${T.cashbox}</th>
      <th style="padding:0.5rem 0.75rem;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">${T.date}</th>
      <th style="padding:0.5rem 0.75rem;text-align:right;border-bottom:2px solid #e5e7eb;font-weight:600;color:#374151">${T.notes}</th>
    </tr></thead>
    <tbody>${txns.map(t => `<tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:0.5rem 0.75rem">${esc(t.transaction_type || '')}</td>
      <td style="padding:0.5rem 0.75rem;font-weight:600;direction:ltr;text-align:left">${fmt(t.amount)}</td>
      <td style="padding:0.5rem 0.75rem">${esc(t.payment_method || '')}</td>
      <td style="padding:0.5rem 0.75rem">${esc(t.cashbox_name || '')}</td>
      <td style="padding:0.5rem 0.75rem;direction:ltr;text-align:left;white-space:nowrap">${t.created_at ? new Date(t.created_at).toLocaleDateString('ar-EG') : ''}</td>
      <td style="padding:0.5rem 0.75rem;color:#6b7280;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.note || '')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

async function showModal(modalEl, mode, contentEl) {
  const cashboxes = await getCashboxes();
  const categories = await getExpenseCategories();

  if (mode === 'collection') {
    modalEl.innerHTML = overlay(`
      <h4 style="margin:0 0 1rem;font-size:1.1rem">${T.addCollection}</h4>
      <div style="display:grid;gap:0.75rem">
        <label>${T.cashbox} <select id="f-cb">${cashboxes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>${T.amount} <input id="f-amt" type="number" step="0.01" min="0" /></label>
        <label>طريقة الدفع <select id="f-pm"><option value="CASH">نقدى</option><option value="VODAFONE_CASH">فودافون كاش</option><option value="BANK_TRANSFER">تحويل بنكى</option></select></label>
        <label>${T.notes} <input id="f-note" /></label>
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end">
        <button class="v2-tb v2-tb-sec" data-close>${T.cancel}</button>
        <button class="v2-tb" data-save="collection">${T.save}</button>
      </div>`);
  } else if (mode === 'expense') {
    modalEl.innerHTML = overlay(`
      <h4 style="margin:0 0 1rem;font-size:1.1rem">${T.addExpense}</h4>
      <div style="display:grid;gap:0.75rem">
        <label>${T.cashbox} <select id="f-cb">${cashboxes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>${T.amount} <input id="f-amt" type="number" step="0.01" min="0" /></label>
        <label>التصنيف <select id="f-cat">${categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>طريقة الدفع <select id="f-pm"><option value="CASH">نقدى</option><option value="BANK_TRANSFER">تحويل بنكى</option></select></label>
        <label>${T.notes} <input id="f-note" /></label>
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end">
        <button class="v2-tb v2-tb-sec" data-close>${T.cancel}</button>
        <button class="v2-tb" data-save="expense">${T.save}</button>
      </div>`);
  } else if (mode === 'cashbox') {
    modalEl.innerHTML = overlay(`
      <h4 style="margin:0 0 1rem;font-size:1.1rem">${T.newCashbox}</h4>
      <div style="display:grid;gap:0.75rem">
        <label>الاسم <input id="f-name" /></label>
        <label>الكود <input id="f-code" /></label>
        <label>الرصيد الافتتاحي <input id="f-bal" type="number" step="0.01" value="0" /></label>
        <label>ملاحظات <input id="f-notes" /></label>
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end">
        <button class="v2-tb v2-tb-sec" data-close>${T.cancel}</button>
        <button class="v2-tb" data-save="cashbox">${T.save}</button>
      </div>`);
  }

  modalEl.querySelector('[data-close]')?.addEventListener('click', () => modalEl.innerHTML = '');
  modalEl.querySelector('[data-save]')?.addEventListener('click', async () => {
    const btn = modalEl.querySelector('[data-save]');
    btn.disabled = true; btn.textContent = '...';
    try {
      if (mode === 'collection') {
        await recordTransaction({
          cashbox_id: modalEl.querySelector('#f-cb')?.value,
          transaction_type: 'collection',
          direction: 'in',
          amount: modalEl.querySelector('#f-amt')?.value,
          payment_method: modalEl.querySelector('#f-pm')?.value,
          note: modalEl.querySelector('#f-note')?.value,
        });
      } else if (mode === 'expense') {
        await recordTransaction({
          cashbox_id: modalEl.querySelector('#f-cb')?.value,
          transaction_type: 'expense',
          direction: 'out',
          amount: modalEl.querySelector('#f-amt')?.value,
          payment_method: modalEl.querySelector('#f-pm')?.value,
          expense_category_id: modalEl.querySelector('#f-cat')?.value,
          note: modalEl.querySelector('#f-note')?.value,
        });
      } else if (mode === 'cashbox') {
        await createCashbox({
          name: modalEl.querySelector('#f-name')?.value,
          code: modalEl.querySelector('#f-code')?.value,
          current_balance: modalEl.querySelector('#f-bal')?.value || 0,
          notes: modalEl.querySelector('#f-notes')?.value,
        });
      }
      modalEl.innerHTML = '';
      await renderDashboard(contentEl, modalEl);
    } catch (e) {
      btn.disabled = false; btn.textContent = T.save;
      modalEl.innerHTML += `<div style="color:#dc2626;margin-top:0.5rem;font-size:0.875rem">${T.error}: ${e.message}</div>`;
    }
  });
}

function overlay(inner) {
  return `<div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;display:flex;align-items:center;justify-content:center" data-close>
    <div style="background:#fff;border-radius:8px;padding:1.5rem;min-width:380px;max-width:480px;box-shadow:0 4px 24px rgba(0,0,0,0.15)" onclick="event.stopPropagation()">${inner}</div>
  </div>`;
}

function fmt(n) { if (n === null || n === undefined) return '0'; return Number(n).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م'; }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
