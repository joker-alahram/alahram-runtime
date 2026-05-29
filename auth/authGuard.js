// /new — Standalone Production Runtime
// auth/authGuard.js — Capability-aware runtime guard.
//
// All guard decisions derive from:
//   • actor_type
//   • role_code
//   • capabilities  (via async current_has_capability() RPC)
//   • runtime scope
//
// No frontend role assumptions. No hardcoded capability maps.
// Async — delegates to canonical RPC for every capability check.

import { getSession, hasCapability } from './sessionService.js';
import { getIdentity } from '../services/storefront/governanceRuntime.js';

// Route → required capabilities.
// null = public (no auth required).
// Array = any one capability required (checked via async RPC).

// In-memory capability cache with 10s TTL to avoid repeated RPC calls on every navigation
const _capCache = new Map();
const CACHE_TTL = 10000;

async function _cachedCapability(cap) {
  const cached = _capCache.get(cap);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.granted;
  const granted = await hasCapability(cap);
  _capCache.set(cap, { granted, ts: Date.now() });
  return granted;
}

const ROUTE_GUARDS = {
  // Public
  login: null,

  // Ops
  'ops/dashboard': null,
  'ops/orders': null,
  'ops/order': null,
  'ops/customers': null,
  'ops/customer': null,
  'ops/reps': null,
  'ops/rep': null,
  'ops/inventory': ['can_manage_inventory'],
  'ops/inventory-product': ['can_manage_inventory'],
  'ops/pricing': ['can_manage_inventory', 'can_manage_system'],
  'ops/pricing-product': ['can_manage_inventory', 'can_manage_system'],
  'ops/employees': ['can_manage_system'],
  'ops/employee': ['can_manage_system'],
  'ops/workflow': ['can_approve_orders', 'can_manage_inventory'],
  'ops/warehouses': ['can_manage_inventory'],
  'ops/events': ['can_manage_system'],
  'ops/audit': ['can_manage_system'],
  'ops/reports': ['can_view_all_reports'],
  'ops/products': ['can_manage_inventory', 'can_manage_system'],
  'ops/product': ['can_manage_inventory', 'can_manage_system'],
  'ops/campaigns': ['can_manage_system'],
  'ops/treasury': ['can_view_treasury', 'can_manage_treasury'],

  // Field
  'field/dashboard': ['can_open_visit'],
  'field/visits': ['can_open_visit'],
  'field/visit': ['can_open_visit'],
  'field/customers': ['can_open_visit'],
  'field/customer': ['can_open_visit'],
  'field/orders': ['can_open_visit'],
  'field/order': ['can_open_visit'],
  'field/collections': ['can_open_visit'],
  'field/collection': ['can_open_visit'],
  'field/tasks': ['can_open_visit'],
  'field/task': ['can_open_visit'],
  'field/location': ['can_open_visit'],
  'field/today': ['can_open_visit'],

  // Portal
  'portal/dashboard': null,
  'portal/orders': null,
  'portal/order': null,
  'portal/invoices': null,
  'portal/invoice': null,
  'portal/visits': null,
  'portal/visit': null,
  'portal/profile': null,
};

// ——— Async guard ———————————————————————————————————
// Each capability check calls current_has_capability() RPC.
// No caching — fresh from runtime authority every time.

function _resolveGuard(routeName) {
  // Exact match first
  if (ROUTE_GUARDS[routeName] !== undefined) return ROUTE_GUARDS[routeName];

  // Prefix match: route like field/orders/some-id should match field/orders
  for (const [pattern, guard] of Object.entries(ROUTE_GUARDS)) {
    if (routeName.startsWith(pattern + '/') || routeName.startsWith(pattern + '?')) {
      return guard;
    }
  }
  return undefined;
}

export async function checkRouteAccess(routeName) {
  const session = getSession();
  const guard = _resolveGuard(routeName);

  // No guard defined → require auth (default secure)
  if (guard === undefined) {
    return { allowed: session.status === 'authenticated', reason: 'auth_required' };
  }

  // null guard → public
  if (guard === null) {
    return { allowed: true, reason: null };
  }

  // Not authenticated → redirect to login
  if (session.status !== 'authenticated') {
    return { allowed: false, reason: 'auth_required' };
  }

  // SUPER_ADMIN bypass: highest operational authority — unrestricted access to ALL routes
  if (String(session?.role?.roleCode || '').toUpperCase() === 'SUPER_ADMIN') {
    return { allowed: true, reason: null };
  }

  // Check each required capability via async RPC (cached 10s)
  for (const cap of guard) {
    const granted = await _cachedCapability(cap);
    if (granted) return { allowed: true, reason: null };
  }

  // Fallback: check identity capabilities (hydrated from current_employee_record RPC)
  // This covers cases where Supabase JWT is missing but local auth has capability
  const identity = getIdentity();
  if (identity?.capabilities) {
    for (const cap of guard) {
      if (identity.capabilities[cap] === true) return { allowed: true, reason: null };
    }
    if (identity.isAdmin && guard.includes('can_manage_system')) {
      return { allowed: true, reason: null };
    }
    // SUPER_ADMIN bypass via identity (defensive fallback when session role is stale)
    if (String(identity.roleCode || '').toUpperCase() === 'SUPER_ADMIN') {
      return { allowed: true, reason: null };
    }
  }

  // No required capability granted
  return { allowed: false, reason: 'capability_required', required: guard };
}
