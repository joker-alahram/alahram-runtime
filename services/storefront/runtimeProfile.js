import { getSession } from '../../auth/sessionService.js';
import { getIdentity } from './governanceRuntime.js';
import { normalizePhone } from '../runtime/identityService.js';

const PROFILES = {
  guest: {
    id: 'guest',
    label: 'زائر',
    domain: 'storefront',
    entry: '#home',
    navigation: ['home', 'companies', 'products', 'offers', 'cart'],
    showVisitWorkspace: false,
    primaryActions: [],
  },

  customer: {
    id: 'customer',
    label: 'عميل',
    domain: 'storefront',
    entry: '#home',
    navigation: ['home', 'products', 'offers', 'cart', 'tiers', 'invoices', 'account'],
    showVisitWorkspace: false,
    primaryActions: ['quickReorder'],
  },

  field_rep: {
    id: 'field_rep',
    label: 'مندوب',
    domain: 'field',
    entry: '#field/dashboard',
    navigation: ['field/dashboard', 'field/visits', 'field/customers', 'field/orders', 'field/collections', 'field/tasks'],
    showVisitWorkspace: true,
    workspaceDefaultMode: 'minimized',
    primaryActions: ['startVisit', 'quickOrder', 'collect'],
  },

  supervisor: {
    id: 'supervisor',
    label: 'مسؤول بيع',
    domain: 'ops',
    entry: '#ops/dashboard',
    navigation: ['ops/dashboard', 'ops/reps', 'ops/orders', 'ops/customers'],
    showVisitWorkspace: true,
    workspaceDefaultMode: 'minimized',
    primaryActions: ['monitor', 'approve', 'startVisit', 'createOrder'],
  },

  manager: {
    id: 'manager',
    label: 'مدير بيع',
    domain: 'ops',
    entry: '#ops/dashboard',
    navigation: ['ops/dashboard', 'ops/reps', 'ops/orders', 'ops/customers', 'ops/reports', 'ops/pricing'],
    showVisitWorkspace: true,
    workspaceDefaultMode: 'minimized',
    primaryActions: ['approve', 'review', 'reports', 'startVisit', 'createOrder'],
  },

  admin: {
    id: 'admin',
    label: 'إدارة النظام',
    domain: 'ops',
    entry: '#ops/dashboard',
    navigation: ['ops/dashboard', 'ops/orders', 'ops/customers', 'ops/inventory', 'ops/products', 'ops/employees', 'ops/reps', 'ops/workflow', 'ops/warehouses', 'ops/events', 'ops/audit', 'ops/reports'],
    showVisitWorkspace: true,
    workspaceDefaultMode: 'minimized',
    primaryActions: ['manage', 'audit', 'govern', 'startVisit', 'createOrder'],
  },
};

function _session() {
  return getSession();
}

function _identity() {
  return getIdentity();
}

function _isAdmin(session) {
  const gov = _identity();
  if (gov?.isAdmin) return true;
  if (gov?.capabilities?.can_manage_system) return true;
  if (gov?.capabilities?.can_view_all_reports) return true;
  const rc = String(session?.role?.roleCode || '').toUpperCase();
  return ['ADMIN', 'SUPER_ADMIN', 'CHAIRMAN'].includes(rc);
}

function _roleCode(session) {
  const gov = _identity();
  return (gov?.roleCode || session?.role?.roleCode || '').toUpperCase();
}

export function resolveProfile() {
  const s = _session();
  if (s.status !== 'authenticated' || !s.actor) {
    console.log('[runtime] resolveProfile: not authenticated or no actor → guest', { status: s.status, hasActor: !!s.actor });
    return PROFILES.guest;
  }

  const { actor } = s;
  const rc = _roleCode(s);
  console.log('[runtime] resolveProfile: session OK', { actorType: actor.type, fullName: actor.fullName, roleCode: rc, hasGov: !!_identity() });

  if (actor.type === 'customer') {
    console.log('[runtime] resolveProfile → customer');
    return PROFILES.customer;
  }

  if (actor.type === 'employee') {
    const isAdmin = _isAdmin(s);
    console.log('[runtime] resolveProfile: employee', { isAdmin, rc, capCount: Object.keys(_identity()?.capabilities || {}).length });

    if (isAdmin) {
      console.log('[runtime] resolveProfile → admin');
      return PROFILES.admin;
    }

    const supervisoryRoles = ['SUPERVISOR', 'SALES_SUPERVISOR', 'REGIONAL_MANAGER', 'EXECUTIVE_SUPERVISOR'];
    const isSupervisory = supervisoryRoles.includes(rc);

    if (isSupervisory) {
      console.log('[runtime] resolveProfile → supervisor');
      return PROFILES.supervisor;
    }

    const managerRoles = ['SALES_MANAGER', 'MANAGER', 'GENERAL_MANAGER', 'EXECUTIVE_MANAGER', 'SALES_DIRECTOR', 'WAREHOUSE_MANAGER'];
    const isManagerial = managerRoles.includes(rc);

    if (isManagerial) {
      console.log('[runtime] resolveProfile → manager');
      return PROFILES.manager;
    }

    console.log('[runtime] resolveProfile → field_rep (default employee)');
    return PROFILES.field_rep;
  }

  console.log('[runtime] resolveProfile: UNKNOWN actor type — guest fallback', { type: actor.type, fullName: actor.fullName, id: actor.id });
  return PROFILES.guest;
}

export { PROFILES };
