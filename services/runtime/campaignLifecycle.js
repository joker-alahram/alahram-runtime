import { emit, EVENTS } from './eventBus.js';
import { readConfig } from '../../config.js';
import { getSession } from '../../auth/sessionService.js';
import { startSpan, incrementCounter } from './runtimeTelemetry.js';

const API = readConfig().baseUrl;

const CAMPAIGN_STATES = ['draft', 'scheduled', 'live', 'paused', 'exhausted', 'expired', 'archived'];

const ALLOWED_TRANSITIONS = {
  draft: ['scheduled'],
  scheduled: ['live', 'draft', 'archived'],
  live: ['paused', 'exhausted', 'expired'],
  paused: ['live', 'expired'],
  exhausted: ['archived'],
  expired: ['archived'],
  archived: [],
};

function _headers() {
  const s = getSession();
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };

  return h;
}

export function validateTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed) return { valid: false, reason: `الحالة "${from}" غير معروفة` };
  if (!allowed.includes(to)) return { valid: false, reason: `لا يمكن الانتقال من "${from}" إلى "${to}"` };
  return { valid: true };
}

export async function transitionOffer(offerId, newState, meta = {}) {
  const span = startSpan('campaign_transition');
  const from = meta.currentState || resolveStateFromDates(meta.offer);
  const validation = validateTransition(from, newState);
  if (!validation.valid) throw new Error(validation.reason);

  const patch = {};
  if (newState === 'live' && !meta.skipActivation) patch.is_active = true;
  if (newState === 'paused' || newState === 'expired' || newState === 'exhausted' || newState === 'archived') patch.is_active = false;
  if (newState === 'scheduled' && meta.starts_at) { patch.starts_at = meta.starts_at; patch.is_active = false; }
  if (newState === 'draft') patch.is_active = false;

  try {
    const r = await fetch(`${API}/offers?id=eq.${offerId}`, {
      method: 'PATCH',
      headers: { ..._headers(), Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    const offer = Array.isArray(arr) ? arr[0] : arr;

    const eventMap = {
      scheduled: EVENTS.OFFER_STARTED,
      live: EVENTS.OFFER_RESUMED,
      paused: EVENTS.OFFER_PAUSED,
      expired: EVENTS.OFFER_EXPIRED,
      exhausted: EVENTS.OFFER_EXHAUSTED,
    };
    const event = eventMap[newState];
    if (event) emit(event, { offerId, title: offer?.title, from, to: newState, ...meta });

    span.end({ offerId, from, to: newState, ok: true });
    return offer;
  } catch (e) {
    span.end({ offerId, from, to: newState, error: e.message });
    throw e;
  }
}

function resolveStateFromDates(offer) {
  if (!offer) return 'draft';
  const now = new Date();
  const startsAt = offer.starts_at ? new Date(offer.starts_at) : null;
  const endsAt = offer.ends_at ? new Date(offer.ends_at) : null;
  if (endsAt && endsAt <= now) return 'expired';
  if (!offer.is_active && !startsAt) return 'draft';
  if (startsAt && startsAt > now) return 'scheduled';
  if (offer.is_active) return 'live';
  return 'paused';
}

export async function createOffer(data) {
  const now = new Date();
  const startsAt = data.starts_at ? new Date(data.starts_at) : null;
  const endsAt = data.ends_at ? new Date(data.ends_at) : null;

  let isActive = false;
  if (data.is_active && startsAt && startsAt <= now && (!endsAt || endsAt > now)) isActive = true;
  else if (data.is_active && startsAt && startsAt > now) isActive = false;

  const payload = {
    ...data,
    is_active: isActive,
    sold_quantity: 0,
    execution_priority: data.execution_priority || 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  try {
    const r = await fetch(`${API}/offers`, {
      method: 'POST',
      headers: { ..._headers(), Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    const offer = Array.isArray(arr) ? arr[0] : arr;

    if (isActive) emit(EVENTS.OFFER_STARTED, { offerId: offer.id, title: offer.title, state: 'live' });
    else if (startsAt && startsAt > now) emit(EVENTS.OFFER_STARTED, { offerId: offer.id, title: offer.title, state: 'scheduled' });

    return offer;
  } catch (e) {
    incrementCounter('failed_events');
    throw e;
  }
}

export async function deleteOffer(offerId) {
  await fetch(`${API}/offers?id=eq.${offerId}`, { method: 'DELETE', headers: _headers() });
}

export function resolveAutomaticState(offer, now) {
  if (!offer) return 'draft';
  const startsAt = offer.starts_at ? new Date(offer.starts_at) : null;
  const endsAt = offer.ends_at ? new Date(offer.ends_at) : null;

  if (endsAt && endsAt <= now) return 'expired';
  if (!offer.is_active && !startsAt) return 'draft';
  if (startsAt && startsAt > now) return 'scheduled';
  if (offer.is_active) return 'live';
  return 'paused';
}

export function getCampaignStates() {
  return CAMPAIGN_STATES;
}

export function getAllowedTransitions() {
  return ALLOWED_TRANSITIONS;
}
