# Projection-Driven Architecture — Adoption Report

## Summary

Status: **6 phases complete** (Visits, Pricing, Governance, Orders, Customers, Employees)

## Adopted Views

| View | Phase | Adoption Scope | Status |
|------|-------|---------------|--------|
| `runtime_visits_with_maps` | 1 | 5 pages (ops/field visits) | ✅ Full |
| `runtime_product_prices` | 2 | 3 fallback paths (pricing CRUD excluded) | ✅ Fallback |
| `runtime_employee_capabilities` | 3,6 | Employee projection service (4 pages), dashboard (1 query) | ✅ Bridge |
| `runtime_order_visibility` | 4 | 21 files read-only (4 write-only files remain) | ✅ Full Read |
| `runtime_customer_visibility` | 5 | 12 files read-only (0 write-only files) | ✅ Full Read |
| `runtime_employee_capabilities` (identity) | 6 | 4 files via projection service | ✅ Bridge |

## Employee Projection Adoption (Phase 6)

| Page | Before | After |
|------|--------|-------|
| `ops/reps.js` | Dual-query: `employees` + capabilities | `fetchAllEmployeeProjections()` |
| `ops/repProfile.js` | `select=*` on `employees` | `fetchSingleEmployeeProjection()` |
| `storefront/representative.js` | `employees?select=...` | `fetchSingleEmployeeProjection()` |
| `storefront/representatives.js` | `employees?select=id,full_name,...` | `fetchAllEmployeeProjections()` |
| `ops/employee.js` | `employees?select=*,created_at` | `fetchSingleEmployeeProjection()` |
| `ops/employees.js` | 3× raw `employees` list queries | `fetchAllEmployeeProjections()` |
| `ops/dashboard.js` | `employees?select=id,full_name,...` | `runtime_employee_capabilities` |

## Remaining Raw `employees` Read Queries

| File | Reason | Acceptable |
|------|--------|-----------|
| `employeeProjectionService.js` (4 queries) | Internal bridge — view extension gap | ✅ Bridge |
| `customer.js:47` (dropdown) | Needs phone/region for display | ✅ Reference data |
| `customer.js:266` (reassign modal) | Needs phone/region for display | ✅ Reference data |
| `reps.js:281` (manager select) | Needs region_name for dropdown | ✅ Reference data |
| `globalSearch.js:90` (search) | Needs phone/region for text search | ✅ Search |
| `customers.js:72` (add modal) | Needs employee_code for selection | ✅ Reference data |
| `customers.js:175` (filter dropdown) | Needs full_name for filter | ✅ Reference data |
| `customers.js:260` (reassign modal) | Needs region_name for display | ✅ Reference data |

## Governance Analysis

- `runtime_employee_capabilities` view lacks: `phone`, `region_name`, `is_active`, `created_at`, `auth_user_id`
- All remaining raw `employees` read queries are for identity-only fields (reference data, dropdowns, search)
- After view extension at DB level, the projection service bridge becomes a single-view query

## Phase 7 Readiness

**Prerequisite**: Extend `runtime_employee_capabilities` view at DB level with 5 missing identity columns.

**Service Layer Phase** would centralize:
- Scope filter building (currently distributed in `governanceRuntime.js`)
- Write path contracts (INSERT/PATCH/DELETE validations)
- Unified error handling and retry logic
