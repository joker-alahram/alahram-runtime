# Duplicated Customer Visibility Logic — Inventory

## Discovery Summary

Pre-Phase 5, every page that displayed customers independently constructed:
- Which table to query (`customers`)
- Which columns to SELECT (hardcoded 5-10 columns per page)
- How to resolve employee owner names (`owner_name` not available, separate `employees` query needed)
- How to filter by scope (`scopeCustomerIds()` → manual `id=in.(...)` filter per page)

## Now Centralized

### 1. Column Selection — Centralized in `customers.contract.js`

| Before | After |
|--------|-------|
| 7 unique hardcoded SELECT strings across 10 files | 4 canonical select builders: `customerSelectFields()`, `customerListSelect()`, `customerDetailSelect()`, `customerOwnershipFields()` |

### 2. Employee/Owner Name Resolution — Eliminated via View

| File | Before | After |
|------|--------|-------|
| `ops/pages/customer.js:42` | Custom select + separate employee lookup for rep name | View has `owner_name`, `owner_code`, `manager_name` |
| `ops/pages/customers.js:67` | `created_by_employee_id` (raw ID, needed separate lookup) | View has `owner_name`, `managed_by_employee_id` |
| `storefront/pages/representative.js:38` | ALL customers fetched then filtered in JS | View with targeted fields |
| `storefront/pages/customerDetail.js:26` | `select=*` (full table scan) | `customerDetailSelect()` (targeted) |
| `field/visitsApi.js:124` | `customers` + manual assignment join | View projection |
| `portal/pages/profile.js:18` | `select=*` (full table scan) | `customerDetailSelect()` (targeted) |

### 3. Scope Filtering — Still Distributed

Scope logic remains on separate tracks:

| Scope Function | Used By | View Supports? |
|---------------|---------|----------------|
| `scopeCustomerIds()` — reads `customer_assignments` + `employee_hierarchy` | `ops/pages/customers.js`, `storefront/pages/customers.js` | ✅ View has all customer fields, but scope is assignment-based, not view-based |
| `scopeEmployeeIds()` — reads employee hierarchy | `ops/pages/reps.js`, `storefront/pages/representatives.js` | N/A (employee scope, not customer) |

The scope functions still need to exist because the view doesn't embed scope logic. But the view adoption eliminated the duplicated column definitions and N+1 employee name lookups.

### 4. Customer Assignment Resolution — Not in View (Deliberate)

`customer_assignments` is a separate join table that remains on raw table access:

| File | Operation | Reason |
|------|-----------|--------|
| `ops/pages/customer.js` | Read + PATCH + POST | CRUD operations on assignments |
| `ops/pages/customers.js` | Read + PATCH + POST | CRUD operations |
| `ops/pages/reps.js` | Read | Rep's assigned customers |
| `storefront/pages/representative.js` | Read | Rep's assigned customers |
| `services/storefront/governanceRuntime.js` | `scopeCustomerIds()` reads assignments | Scope resolution |
| `services/field/visitsApi.js` | Read | Field visits customer list |

## Remaining Duplication (Write Paths — Intentionally Not Centralized)

| File | Operation | Table |
|------|-----------|--------|
| `ops/pages/customer.js` | PATCH + POST | `customers` (raw) |
| `ops/pages/customers.js` | POST + PATCH | `customers` (raw) |
| `storefront/cartApi.js` | POST | `customers` (raw) |
| `services/storefront/orderApi.js` | POST | `customers` (raw) |

## Assessment

| Dimension | Pre-Phase 5 | Post-Phase 5 |
|-----------|-------------|--------------|
| Unique column definitions | 7 | 4 (contract builders) |
| Raw table read queries | 10 files | 0 files (all read paths migrated) |
| Full table scans (`select=*`) | 3 files | 0 files |
| N+1 employee name lookups | 4 files | 0 files (resolved by view) |
