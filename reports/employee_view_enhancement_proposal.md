# DB Enhancement Proposal: `runtime_employee_capabilities` View Extension

## Current State

`runtime_employee_capabilities` is a governance projection view containing:
- Employee identity: `employee_id`, `employee_code`, `full_name`, `email`
- Role: `role_id`, `role_code`, `role_name`
- Capability flags: all `can_*` booleans
- Hierarchy: `manager_id`, `manager_name`

**Missing operational identity fields:**

| Missing Field | Source Table | Type | Used By |
|---------------|-------------|------|---------|
| `phone` | `employees` | text | All employee display pages |
| `region_name` | `employees` | text | `ops/reps.js`, `ops/repProfile.js`, `storefront/representative.js` |
| `is_active` | `employees` | boolean | All employee filter queries |
| `created_at` | `employees` | timestamptz | `ops/reps.js` (sorting), `ops/repProfile.js` (tenure) |
| `auth_user_id` | `employees` | uuid (nullable) | Auth linking, scope resolution |

## Impact of Current Gap

Every page that needs employee data currently does either:
1. **Two queries**: `runtime_employee_capabilities` (for governance) + `employees` (for operational fields) — e.g. `ops/reps.js`
2. **One query to `employees` table** — bypassing the view entirely — e.g. all storefront/field/portal pages

## Proposal

### Required SQL (Conceptual)

```sql
CREATE OR REPLACE VIEW runtime_employee_capabilities AS
SELECT
  e.id AS employee_id,
  e.employee_code,
  e.full_name,
  e.email,
  e.phone,
  e.region_name,
  e.is_active,
  e.created_at,
  e.auth_user_id,
  r.id AS role_id,
  r.role_code,
  r.role_name,
  r.can_manage_system,
  r.can_approve_orders,
  r.can_manage_products,
  r.can_manage_pricing,
  r.can_manage_employees,
  r.can_view_reports,
  r.can_manage_customers,
  r.can_manage_visits,
  r.can_manage_orders,
  r.can_manage_inventory,
  r.can_manage_field_ops,
  m.id AS manager_id,
  m.full_name AS manager_name
FROM employees e
JOIN roles r ON r.id = e.role_id
LEFT JOIN employees m ON m.id = e.manager_id;
```

### Compatibility Impact

| Aspect | Impact |
|--------|--------|
| New columns added | `phone`, `region_name`, `is_active`, `created_at`, `auth_user_id` |
| Existing columns unchanged | No renames, no type changes |
| Existing `runtime_employee_capabilities` users | Fully backward-compatible |
| New `SELECT *` queries | Will return more columns (no breakage) |
| Old `SELECT` column lists | Unaffected |

### Migration Safety

1. **Create new view** alongside existing (e.g., `runtime_employee_full`) or **ALTER VIEW** (if supported)
2. **Update contract source** in `capabilities.contract.js` `CAPABILITY_SOURCE` to point to the enhanced view
3. **Remove fallback** `EMPLOYEE_RAW_FIELDS` from `capabilities.contract.js`
4. **Migrate pages** that currently query `employees` table to use the enhanced view:
   - `ops/reps.js` — stop dual query pattern
   - `storefront/representative.js` — use view instead of `employees`
   - `storefront/representatives.js` — use view instead of `employees`
   - All other employee display pages

### Priority: After Phase 5

Do NOT implement before:
- Phase 4 (Order Visibility) is complete ✅ (now)
- Phase 5 (Customer Visibility) is complete
- All runtime views are adopted
