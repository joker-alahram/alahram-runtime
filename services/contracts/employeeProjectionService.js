// Employee Projection Service
// Bridges the gap until runtime_employee_capabilities is enhanced at DB level.
//
// Current approach:
//   1. Query runtime_employee_capabilities (governance + role fields)
//   2. Query employees table for identity fields (phone, region_name, etc.)
//   3. Merge records by employee_id
//   4. Normalize via employees.contract.js
//
// After DB enhancement:
//   Step 2 can be removed — single query to the enhanced view suffices.

import { getSession } from '../../auth/sessionService.js';
import { readConfig } from '../../config.js';
import {
  normalizeEmployeeProjections,
  governanceFields,
  operationalIdentityFields,
} from '../contracts/employees.contract.js';
import { capabilitySelectFields } from '../contracts/capabilities.contract.js';

const API = readConfig().baseUrl;

function _headers() {
  const s = getSession();
  const h = {
    apikey: readConfig().apiKey,
    'Content-Type': 'application/json',
  };

  return h;
}

async function _fetch(path) {
  const r = await fetch(`${API}/${path}`, { headers: _headers() });
  if (!r.ok) return [];
  return r.json();
}

// Fetch complete employee projections (governance + identity)
// Falls back to employees table for identity fields missing from the view
export async function fetchEmployeeProjection(employeeIds) {
  if (!employeeIds || !employeeIds.length) return [];
  const idList = employeeIds.join(',');

  const [govRecs, rawRecs] = await Promise.all([
    _fetch(`runtime_employee_capabilities?employee_id=in.(${idList})&select=${capabilitySelectFields()}`),
    _fetch(`employees?id=in.(${idList})&select=id,${operationalIdentityFields()}`),
  ]);

  const idLookup = {};
  for (const r of rawRecs) {
    idLookup[r.id] = {
      id: r.id,
      phone: r.phone,
      region_name: r.region_name,
      is_active: r.is_active,
      created_at: r.created_at,
      auth_user_id: r.auth_user_id,
    };
  }

  const merged = govRecs.map(g => {
    const identity = idLookup[g.employee_id] || {};
    return { ...g, ...identity };
  });

  return normalizeEmployeeProjections(merged);
}

// Fetch a single employee projection
export async function fetchSingleEmployeeProjection(employeeId) {
  if (!employeeId) return null;
  const results = await fetchEmployeeProjection([employeeId]);
  return results.length ? results[0] : null;
}

// Fetch employees with identity fields only (no governance needed)
export async function fetchEmployeeIdentity(employeeIds) {
  if (!employeeIds || !employeeIds.length) return [];
  const idList = employeeIds.join(',');
  const rawRecs = await _fetch(`employees?id=in.(${idList})&select=id,full_name,phone,region_name,is_active,created_at`);
  const lookup = {};
  for (const r of rawRecs) {
    lookup[r.id] = r;
  }
  return lookup;
}

// Fetch ALL active employees with projection
export async function fetchAllEmployeeProjections() {
  const [govRecs, rawRecs] = await Promise.all([
    _fetch(`runtime_employee_capabilities?select=${capabilitySelectFields()}`),
    _fetch(`employees?is_active=eq.true&select=id,full_name,employee_code,phone,region_name,is_active,created_at&order=full_name.asc`),
  ]);

  const idLookup = {};
  for (const r of rawRecs) {
    idLookup[r.id] = {
      id: r.id,
      phone: r.phone,
      region_name: r.region_name,
      is_active: r.is_active,
      created_at: r.created_at,
      auth_user_id: r.auth_user_id,
    };
  }

  const merged = govRecs.map(g => {
    const identity = idLookup[g.employee_id] || {};
    return { ...g, ...identity };
  });

  return normalizeEmployeeProjections(merged);
}

// Fetch only identity fields for a filtered set of employees
// Used by pages that only need phone/region/is_active without governance
export async function fetchEmployeeIdentityByFilter(filterStr) {
  return _fetch(`employees?select=id,full_name,employee_code,phone,region_name,is_active,created_at${filterStr ? '&' + filterStr : ''}&order=full_name.asc`);
}
