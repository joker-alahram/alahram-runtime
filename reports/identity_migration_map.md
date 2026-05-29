# Operational Identity Projection — Migration Map

## Canonical Source: `runtime_employee_capabilities` (view, governance fields)
### Fallback Source: `employees` (table, identity fields)
### Bridge Layer: `employeeProjectionService.js` (dual-query encapsulation)

---

## Current State

- **17 raw `employees?` queries** across 12 files
- **3 dual-query patterns** (employees + capabilities separately)
- **2 `select=*` full table scans** (`repProfile.js`, `representative.js`)
- **1 service layer** (`employeeProjectionService.js`) ready to encapsulate

---

## Migration Targets

### Tier 1 — Dual-Query Elimination (highest value)

| # | File | Current Pattern | Migrate To | Difficulty | Identity Fields Needed |
|---|------|----------------|------------|------------|----------------------|
| 1 | `ops/reps.js` | `employees` (line 55/58) + `runtime_employee_capabilities` (line 92) | `fetchAllEmployeeProjections()` | Medium | phone, region, is_active, created_at |
| 2 | `storefront/representatives.js` | `employees` (line 28/31) | `fetchAllEmployeeProjections()` or view + identity | Low | phone, region, is_active, created_at |

### Tier 2 — Detail/Profile Pages (remove `select=*`)

| # | File | Current Pattern | Migrate To | Difficulty | Identity Fields Needed |
|---|------|----------------|------------|------------|----------------------|
| 3 | `ops/repProfile.js:29` | `select=*` on employees | `fetchSingleEmployeeProjection(eid)` | Low | All (select=*) |
| 4 | `storefront/representative.js:29` | `select=*` on employees | `fetchSingleEmployeeProjection(eid)` | Low | All (select=*) |

### Tier 3 — Dashboard (rep name enrichment)

| # | File | Current Pattern | Migrate To | Difficulty | Identity Fields Needed |
|---|------|----------------|------------|------------|----------------------|
| 5 | `ops/dashboard.js:69` | `employees?select=id,full_name,employee_code,is_active` | View with governance fields | Low | Minimal + enrichment |

### Tier 4 — Modal/List Employee Pickers

| # | File | Current Pattern | Migrate To | Difficulty | Identity Fields Needed |
|---|------|----------------|------------|------------|----------------------|
| 6 | `ops/customer.js:46,265` | `employees?select=id,full_name,employee_code,region_name` | View + identity fallback | Low | full_name, region_name |
| 7 | `ops/customers.js:72,175,260` | `employees?select=id,full_name,employee_code` | View + identity fallback | Low | full_name |
| 8 | `storefront/globalSearch.js:90` | `employees?or=(...)&select=id,full_name,phone,region_name` | View with identity fields | Low | phone, region_name |

### Tier 5 — Employee CRUD Pages (display + edit)

| # | File | Current Pattern | Migrate To | Difficulty | Notes |
|---|------|----------------|------------|------------|-------|
| 9 | `ops/employee.js` | `select=*,created_at` | View + identity fallback | Low | Read-only path; writes stay on employees table |
| 10 | `ops/employees.js` | `select=id,employee_code,full_name,phone,region_name,is_active,created_at` | View + identity fallback | Low | CRUD list |

---

## Execution Plan

1. ✅ Create enhanced view proposal
2. ✅ Upgrade `employees.contract.js` v3 with identity projection
3. ✅ Create `employeeProjectionService.js`
4. Adopt in Tier 1 (ops/reps.js, storefront/representatives.js)
5. Adopt in Tier 2 (ops/repProfile.js, storefront/representative.js)
6. Adopt in Tier 3–5 (remaining pages)
7. Create raw employee dependency inventory
