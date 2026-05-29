# DB Enhancement Proposal: `runtime_employee_capabilities` → Complete Operational Identity Projection

## Current View Columns

| Column | Source | Purpose |
|--------|--------|---------|
| `employee_id` | `employees.id` | PK |
| `full_name` | `employees.full_name` | Identity |
| `employee_code` | `employees.employee_code` | Identity |
| `role_code` | `roles.role_code` | Governance |
| `role_name` | `roles.role_name` | Governance |
| `can_manage_system` | `roles.*` | Governance |
| `can_create_orders` | `roles.*` | Governance |
| `can_open_visit` | `roles.*` | Governance |
| `can_approve_orders` | `roles.*` | Governance |
| `can_manage_inventory` | `roles.*` | Governance |
| `can_manage_treasury` | `roles.*` | Governance |
| `can_view_all_reports` | `roles.*` | Governance |
| *(other can_* flags)* | `roles.*` | Governance |

## Proposed Additional Columns

| Column | Source Table | Type | Nullable | Used By Pages |
|--------|-------------|------|----------|---------------|
| `phone` | `employees.phone` | text | NOT NULL | 13 pages (ops/reps, ops/employees, storefront/reps, globalSearch, etc.) |
| `region_name` | `employees.region_name` | text | YES | 8 pages (ops/reps, ops/repProfile, storefront/reps, etc.) |
| `is_active` | `employees.is_active` | boolean (default true) | NO | 10 pages (all list + filter queries) |
| `created_at` | `employees.created_at` | timestamptz (default now()) | NO | 6 pages (ops/reps sort, ops/repProfile tenure, ops/employees list) |
| `auth_user_id` | `employees.auth_user_id` | uuid | YES | `sessionService.js` (auth linking), `governanceRuntime.js` (identity) |

## Source SQL (Conceptual)

```sql
CREATE OR REPLACE VIEW runtime_employee_capabilities AS
SELECT
  e.id AS employee_id,
  e.employee_code,
  e.full_name,
  e.phone,
  e.region_name,
  e.is_active,
  e.created_at,
  e.auth_user_id,
  r.id AS role_id,
  r.role_code,
  r.role_name,
  r.can_manage_system,
  r.can_create_orders,
  r.can_open_visit,
  r.can_approve_orders,
  r.can_manage_inventory,
  r.can_manage_treasury,
  r.can_view_all_reports,
  -- plus any additional can_* flags from roles table
  m.id AS manager_id,
  m.full_name AS manager_name
FROM employees e
JOIN roles r ON r.id = e.role_id
LEFT JOIN employees m ON m.id = e.manager_id;
```

## Semantics Preserved

| Aspect | Current | After | Impact |
|--------|---------|-------|--------|
| Governance fields | 7+ can_* flags | Unchanged | None |
| Role resolution | `role_code`, `role_name` | Unchanged | None |
| Manager resolution | `manager_id`, `manager_name` | Unchanged | None |
| Identity fields | Missing | Added | Backward compatible |
| `SELECT *` | Returns 12+ columns | Returns 17+ columns | More data, no breakage |
| Existing column names | All unchanged | All unchanged | No renames |

## Migration Safety

1. **ALTER OR REPLACE VIEW** — no schema change to `employees` or `roles` tables
2. **Existing queries** using explicit column lists (`SELECT col1,col2,...`) — unaffected
3. **Existing `SELECT *` queries** — will return more columns, existing code ignores unknown columns via spread `{ ...row }`
4. **Existing contract normalizers** — preserve all original properties, so extra columns flow through
5. **No cascading DB changes** — only view definition update

## Priority

⚠️ **HIGH** — Without this change, 17 frontend files still query raw `employees` table, and 3 pages maintain dual-query patterns (employees + capabilities separately).
