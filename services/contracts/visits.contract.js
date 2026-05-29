// Visits Canonical Contract
// Canonical source: runtime_visits_with_maps (view)

export const VisitContract = {
  id: 'visit_id',
  customerId: 'customer_id',
  customerName: 'customer_name',
  employeeId: 'employee_id',
  employeeName: 'employee_name',
  status: 'visit_status',
  startedAt: 'check_in_time',
  endedAt: 'check_out_time',
  note: 'note',
  outcome: 'visit_outcome',
  createdAt: 'created_at',
  mapsLink: 'google_maps_link',
};

const CANONICAL_KEYS = Object.keys(VisitContract);
const VIEW_COLUMNS = Object.values(VisitContract);

export function visitSelectFields() {
  return VIEW_COLUMNS.join(',');
}

export function normalizeVisit(v) {
  if (!v) return null;
  // Preserve all original raw properties for backward compat
  const out = { ...v };
  for (const key of CANONICAL_KEYS) {
    const col = VisitContract[key];
    let val = v[col];
    if (val === undefined || val === null) {
      val = v[key] ?? null;
    }
    out[key] = val;
  }
  // Ensure canonical 'id' field always available
  if (out.id === undefined || out.id === null) {
    out.id = out.visit_id || out.id;
  }
  return out;
}

export function normalizeVisits(arr) {
  const seen = new Set();
  const out = [];
  for (const v of (arr || [])) {
    const nv = normalizeVisit(v);
    const uid = nv.visit_id || nv.id;
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(nv);
  }
  return out;
}

export function guardVisit(v) {
  if (!v) return { valid: false, reason: 'null' };
  const id = v.visit_id || v.id;
  if (!id) return { valid: false, reason: 'missing_id' };
  return { valid: true };
}

export const VISIT_SOURCE = {
  view: 'runtime_visits_with_maps',
  fallbackTable: 'visits',
  fallbackSelect: 'id,customer_id,employee_id,visit_status,check_in_time,check_out_time,note,visit_outcome,created_at',
};
