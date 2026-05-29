import { logError } from '../../utils/logger.js';
import { readConfig } from '../../config.js';

const API = readConfig().baseUrl;

function _headers(token) {
  const h = { apikey: readConfig().apiKey, 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function _rpc(name, body) {
  return fetch(`${API}/rpc/${name}`, {
    method: 'POST',
    headers: _headers(),
    body: JSON.stringify(body || {}),
  });
}

export async function login(phone, password) {
  const r = await _rpc('runtime_user_login', { p_phone: phone, p_password: password });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || 'فشل تسجيل الدخول');
  }
  const data = await r.json();
  if (data.error) throw new Error(data.message || 'فشل تسجيل الدخول');
  return data;
}

export async function register(data) {
  const { phone, password, fullName, governorate, region, address, activityType, latitude, longitude, accuracy } = data;
  const r = await _rpc('runtime_user_register', {
    p_phone: phone, p_password: password, p_full_name: fullName,
    p_activity_type: activityType || null,
    p_governorate: governorate || null, p_region: region || null,
    p_address_line: address || null,
    p_latitude: latitude ?? null, p_longitude: longitude ?? null, p_accuracy: accuracy ?? null,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || 'فشل إنشاء الحساب');
  }
  const result = await r.json();
  if (result.error) throw new Error(result.message || 'فشل إنشاء الحساب');
  return result;
}

export async function logout(token) {
  if (token) {
    try { await _rpc('runtime_user_logout', { p_token: token }); } catch (e) { console.error('UNHANDLED ERROR:', e); throw e; }
  }
}

export async function restoreSession(token) {
  if (!token) return null;
  const r = await _rpc('runtime_user_verify_session', { p_token: token });
  if (!r.ok) return null;
  const data = await r.json();
  if (data.error) return null;
  return data;
}

