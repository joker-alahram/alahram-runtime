# Customer Visibility Canonicalization — Migration Map

## Canonical Source: `runtime_customer_visibility` (view, 20 columns)
### Fallback: `customers` (raw table)

---

## Current State

- **0 pages** use `runtime_customer_visibility`
- **8 files** query raw `customers` table for customer data
- **2 pages** use `scopeCustomerIds()` for customer filtering
- **2 pages** use `customer_assignments` for rep assignment resolution (separate queries)
- **2 files** use `customers?select=*` (full table scan)

---

## Migration Targets

| # | File | Current SELECT | View Has? | Difficulty | Notes |
|---|------|---------------|-----------|------------|-------|
| 1 | `ops/customer.js:42` | `select=*,created_at` | ✅ All fields + employee name | Low | View has `owner_name`, `owner_code`, `manager_name` |
| 2 | `ops/customers.js:67` | `select=id,customer_name,phone,address,customer_code,customer_type,is_active,created_at,created_by_employee_id` | ✅ | Low | View has all, plus `managed_by_employee_id`, `owner_name` |
| 3 | `ops/reps.js:54,56` | Employee queries (not customers) | N/A | N/A | Not a customer query |
| 4 | `ops/repProfile.js:27,31` | `employees` + `customers` + `customer_assignments` | ✅ Name/phone available | Medium | View has `owner_name`, `owner_code` — can reduce N+1 |
| 5 | `ops/reports.js:28` | `select=id` (count) | ✅ | Low | Trivial count query |
| 6 | `field/customer.js:21` | `select=*,is_active` | ✅ | Low | View has all fields |
| 7 | `field/customers.js:13` | `select=id,customer_name,phone,address,is_active` | ✅ | Low | View has all fields |
| 8 | `storefront/representative.js:37-38` | `employees` + `customer_assignments` + `customers` | ✅ | Medium | View has `owner_name`, `owner_code`, `manager_name` |
| 9 | `portal/profile.js:18` | `select=*` | ✅ | Low | View has all fields |
| 10 | `services/storefront/cartApi.js:115` | Hash navigation, not data query | N/A | N/A | Not a customer data query |

### Write Paths (NOT migrated — stay on raw `customers`)

| File | Operation | Reason |
|------|-----------|--------|
| `ops/pages/customer.js` | Modal edit via `apiPatch('customers', ...)` | Needs writable table |
| `ops/pages/customer.js` | Modal delete via `apiDelete('customers', ...)` | Needs writable table |
| `ops/pages/customers.js` | Modal add via `apiPost('customers', ...)` | Needs writable table |
| `storefront/cartApi.js` | `newCustomer` via `apiPost('customers', ...)` | Needs writable table |

### Customer Assignments (NOT migrated — separate table)

`customer_assignments` is a separate join table, NOT in the view:
- `ops/pages/customer.js` — read + PATCH + POST
- `ops/pages/customers.js` — read + PATCH + POST
- `ops/pages/reps.js` — read
- `storefront/pages/representative.js` — read
- `services/storefront/governanceRuntime.js` — `scopeCustomerIds()` reads assignments

---

## View Column Mapping (Key Benefits)

| View Field | Replaces | Eliminates |
|-----------|----------|------------|
| `managed_by_employee_id` | Manual `customer_assignments` lookup | N+1 assignment queries |
| `owner_name`, `owner_code` | Separate `employees` table query | Employee name/code resolution |
| `manager_name` | Hierarchy query | Manager resolution |
| `role_code`, `role_name` | Capability query | Role resolution |
| `is_active` | `customers` table field | No change needed |
| `created_at` | `customers` table field | No change needed |

---

## Execution Plan

1. ✅ Upgrade `customers.contract.js` with visibility normalizers + ownership helpers
2. Adopt view in OPS customer pages (Tier 1)
3. Adopt view in Field customer pages (Tier 2)
4. Adopt view in Storefront customer pages (Tier 3)
5. Adopt view in Portal customer pages (Tier 4)
6. Create consolidated Runtime Projection Adoption Report
