import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';

const API = readConfig().baseUrl;

function _h() {
  const s = getSession();
  return {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

export async function logTimelineEvent(orderId, eventType, details = {}) {
  const s = getSession();
  const payload = {
    order_id: orderId,
    event_type: eventType,
    actor_name: s?.actor?.fullName || null,
    actor_phone: s?.actor?.phone || null,
    actor_id: s?.actor?.id || null,
    old_value: details.oldValue || null,
    new_value: details.newValue || null,
    change_details: details.changeDetails || null,
  };
  const r = await fetch(`${API}/order_timeline`, {
    method: 'POST', headers: { ..._h(), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); console.error('[timeline] log failed', r.status, t.slice(0, 100)); }
  return r.ok ? r.json() : null;
}

export async function getOrderTimeline(orderId) {
  const r = await fetch(`${API}/order_timeline?order_id=eq.${orderId}&order=created_at.asc&select=*`, { headers: _h() });
  if (!r.ok) return [];
  return r.json();
}
