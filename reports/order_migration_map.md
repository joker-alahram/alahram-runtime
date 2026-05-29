# Order Visibility Canonicalization — Migration Map

## Canonical Source: `runtime_order_visibility` (view, 43 columns)
### Fallback: `orders` (raw table)

---

## Current State

- **0 pages** use `runtime_order_visibility`
- **25 files** query raw `orders` table
- **6 service modules** abstract order queries (partial)
- **Duplicate scope logic** in `governanceRuntime.js`, `ordersApi.js`, and most page-level queries

---

## Migration Targets (Priority Order)

### TIER 1 — Core Service Layer (high impact, central adoption)

| # | File | Current Pattern | View Has Needed Fields? | Difficulty | Notes |
|---|------|----------------|------------------------|------------|-------|
| 1 | `services/ops/ordersApi.js` | RPC `get_visible_orders` / raw `select=*` | ✅ All fields | Low | RPC already uses scoped logic; fallback can use view directly |
| 2 | `services/storefront/invoicesApi.js` | raw `orders` + manual customer fetch | ✅ All fields | Medium | Manual customer fallback `(lines 48-61, 76-86)` can be eliminated (view has `created_by_name`) |

### TIER 2 — OPS Display Pages (visible impact, smaller SELECTs)

| # | File | Current Pattern | View Has Needed Fields? | Difficulty | Notes |
|---|------|----------------|------------------------|------------|-------|
| 3 | `domains/ops/pages/dashboard.js` | 6 queries: counts + recent orders | ✅ | Low | `created_by_name` can replace `created_by_name_snapshot`; counts can stay minimal |
| 4 | `domains/ops/pages/orders/list.js` | Via `getOrders()` → `select=*` | ✅ | Low | Already uses `created_by_name_snapshot` / `customer_name_snapshot` |
| 5 | `domains/ops/pages/orders/detail.js` | Via `getOrderDetail()` → `select=*` | ✅ | Low | Already uses `customer_name` / `created_by_name` |
| 6 | `domains/ops/pages/customer.js` | raw `orders` + scope filter | ✅ | Low | View eliminates need for employee name snapshot |
| 7 | `domains/ops/pages/customers.js` | raw `orders` with scope | ✅ | Low | Minimal columns needed |
| 8 | `domains/ops/pages/reps.js` | raw `orders` for aggregation | ✅ | Low | Already uses `created_by_employee_id` |
| 9 | `domains/ops/pages/repProfile.js` | raw `orders` + separate customer lookup | ✅ | Medium | Separate customer lookup `(line 30)` can be eliminated |
| 10 | `domains/ops/pages/reports.js` | `select=id` (count) | ✅ | Low | Minimal impact |

### TIER 3 — Field Display Pages

| # | File | Current Pattern | View Has Needed Fields? | Difficulty | Notes |
|---|------|----------------|------------------------|------------|-------|
| 11 | `domains/field/pages/orders.js` | raw `orders` + scope by employee_id | ✅ | Low | Uses `created_by_name_snapshot` |
| 12 | `domains/field/pages/order.js` | `select=*` + `created_by_name_snapshot` | ✅ | Low | View has all fields |

### TIER 4 — Storefront Display Pages

| # | File | Current Pattern | View Has Needed Fields? | Difficulty | Notes |
|---|------|----------------|------------------------|------------|-------|
| 13 | `domains/storefront/pages/orders.js` | raw `orders` + employee_id filter | ✅ | Low | Uses `created_by_name_snapshot` |
| 14 | `domains/storefront/pages/order.js` | `select=*` + `created_by_name_snapshot` | ✅ | Low | Uses `created_by_name_snapshot` |
| 15 | `domains/storefront/pages/representative.js` | raw `orders` + employee_id filter | ✅ | Low | Minimal columns |
| 16 | `domains/storefront/pages/representatives.js` | raw `orders` + in-clause filter | ✅ | Low | Minimal columns |
| 17 | `domains/storefront/pages/customerDetail.js` | raw `orders` + customer_id filter | ✅ | Low | Minimal columns |
| 18 | `domains/storefront/bootstrap.js` | raw `orders` + employee_id filter | ✅ | Low | Minimal columns |
| 19 | `domains/storefront/components/globalSearch.js` | raw `orders` + employee_id filter | ✅ | Low | Minimal columns |

### TIER 5 — Portal Display Pages (customer-facing)

| # | File | Current Pattern | View Has Needed Fields? | Difficulty | Notes |
|---|------|----------------|------------------------|------------|-------|
| 20 | `domains/portal/pages/dashboard.js` | raw `orders` + customer_id filter | ✅ | Low | Minimal columns |
| 21 | `domains/portal/pages/orders.js` | raw `orders` + customer_id filter | ✅ | Low | Minimal columns |
| 22 | `domains/portal/pages/order.js` | `select=*` + `created_by_name_snapshot` | ✅ | Low | Uses `created_by_name_snapshot` |

### WRITE PATHS (NOT migrated — still need raw table)

| File | Reason |
|------|--------|
| `services/storefront/orderApi.js` | INSERT/UPDATE needs writable table |
| `domains/ops/pages/orders/detail.js` (PATCH) | Status updates need writable table |
| `domains/ops/pages/orders/list.js` (DELETE) | Deletes need writable table |
| `domains/ops/pages/orders/detail.js` (DELETE) | Deletes need writable table |

---

## View Column Mapping (Key Fields vs Current Page SELECTs)

| Page | Current SELECT | View Has? | Benefit |
|------|---------------|-----------|---------|
| ops/dashboard.js | `created_by_name_snapshot` | `created_by_name` (resolved from employee) | Eliminates snapshot staleness |
| ops/orders/list.js | `customer_name_snapshot`, `created_by_name_snapshot` | `owner_name_snapshot`, `created_by_name` | Eliminates snapshot → canonical field mapping |
| ops/customer.js | `created_by_name_snapshot` | `created_by_name`, `role_code`, `role_name` | Eliminates separate employee lookup |
| field/orders.js | `created_by_name_snapshot` | `created_by_name`, `role_code` | Eliminates separate role lookup |
| field/order.js | `created_by_name_snapshot` | `created_by_name`, `manager_name` | Eliminates separate manager lookup |
| storefront/orders.js | `created_by_name_snapshot` | `created_by_name`, `created_by_code` | Richer employee info |
| portal/order.js | `created_by_name_snapshot` | `created_by_name`, `owner_name` | Richer ownership info |

---

## Phase 4 Execution Plan

1. ✅ Upgrade `orders.contract.js` with visibility normalizers
2. Adopt view in `services/ops/ordersApi.js` (Tier 1)
3. Adopt view in OPS display pages (Tier 2)
4. Adopt view in field pages (Tier 3)
5. Adopt view in storefront pages (Tier 4)
6. Adopt view in portal pages (Tier 5)
7. Document duplicated visibility logic
