import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';

const API = readConfig().baseUrl;

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

export async function getTreasurySummary() {
  const r = await fetch(`${API}/runtime_treasury_summary?limit=1`, { headers: _headers() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

export async function getTransactions({ limit = 50, offset = 0 } = {}) {
  const r = await fetch(`${API}/treasury_transactions?select=*,cashbox:cashbox_id(name)&order=created_at.desc&limit=${limit}&offset=${offset}`, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

export async function getCashboxes() {
  const r = await fetch(`${API}/cashboxes?select=*&order=name.asc`, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

export async function getExpenseCategories() {
  const r = await fetch(`${API}/expense_categories?select=*&order=name.asc`, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

export async function recordTransaction({ cashbox_id, transaction_type, direction, amount, payment_method, note, expense_category_id }) {
  const s = getSession();
  const headers = _headers();
  headers['Content-Type'] = 'application/json';
  headers['Prefer'] = 'return=representation';
  const body = {
    cashbox_id,
    transaction_type,
    direction,
    amount,
    payment_method: payment_method || null,
    note: note || null,
    expense_category_id: expense_category_id || null,
    actor_type: 'employee',
    actor_id: s?.actor?.id || null,
  };
  const r = await fetch(`${API}/treasury_transactions`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t || 'فشل تسجيل المعاملة'); }
  return r.json();
}

export async function createCashbox({ name, code, cashbox_type, current_balance, notes }) {
  const headers = _headers();
  headers['Content-Type'] = 'application/json';
  headers['Prefer'] = 'return=representation';
  const body = { name, code, cashbox_type: cashbox_type || 'physical', status: 'active', current_balance: current_balance || 0, notes: notes || null };
  const r = await fetch(`${API}/cashboxes`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t || 'فشل إنشاء الخزنة'); }
  return r.json();
}
