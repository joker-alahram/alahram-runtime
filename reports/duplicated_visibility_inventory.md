# Duplicated Order Visibility Logic — Inventory

## Discovery Summary

Pre-Phase 4, every page that displayed orders independently constructed:
- Which table to query (`orders`)
- Which columns to SELECT (hardcoded 6-14 columns per page)
- How to resolve employee names (`created_by_name_snapshot`)
- How to resolve customer names (`customer_name_snapshot` / `owner_name_snapshot`)
- How to filter by scope (`created_by_employee_id=eq.` / `customer_id=eq.`)

## Now Centralized

### 1. Column Selection — Centralized in `orders.contract.js`

| Before | After |
|--------|-------|
| 22 unique hardcoded SELECT strings across 25 files | 6 canonical select builders: `orderSelectFields()`, `orderListSelect()`, `orderDetailSelect()`, `orderStatsSelect()`, `workflowSelectFields()`, `operationalAssignmentFields()` |

### 2. Employee Name Resolution — Eliminated via View

| File | Before | After |
|------|--------|-------|
| `services/ops/ordersApi.js:33` | Manual mapping `r2.created_by_name_snapshot || ''` | `r2.created_by_name` from view |
| `services/storefront/invoicesApi.js:45-61` | Manual fallback chain + separate `customers` table fetch | View has `owner_name_snapshot`, `created_by_name` |
| `domains/ops/pages/dashboard.js:146` | `o.created_by_name_snapshot` | `o.created_by_name \|\| o.created_by_name_snapshot` |
| `domains/ops/pages/customer.js:187` | `o.created_by_name_snapshot` | `o.created_by_name \|\| o.created_by_name_snapshot` |
| `domains/field/pages/orders.js:32` | `o.created_by_name_snapshot` | `o.created_by_name \|\| o.created_by_name_snapshot` |
| `domains/field/pages/order.js:47` | `order.created_by_name_snapshot` | `order.created_by_name \|\| order.created_by_name_snapshot` |
| `domains/storefront/pages/orders.js:49` | `o.created_by_name_snapshot` | `o.created_by_name \|\| o.created_by_name_snapshot` |
| `domains/storefront/pages/order.js:56` | `order.created_by_name_snapshot` | `order.created_by_name \|\| order.created_by_name_snapshot` |
| `domains/portal/pages/order.js:47` | `order.created_by_name_snapshot` | `order.created_by_name \|\| order.created_by_name_snapshot` |

### 3. Customer Name Resolution — Simplified via View

| File | Before | After |
|------|--------|-------|
| `services/ops/ordersApi.js:33` | Manual mapping `r2.customer_name_snapshot || ''` | `r2.owner_name \|\| r2.owner_name_snapshot` |
| `services/storefront/invoicesApi.js:45-61` | Manual `customers` table fetch (N+1) | `owner_name_snapshot` from view |

### 4. Scope Filtering — Still Distributed (Not Yet Centralized)

Scope logic remains distributed:
- `services/storefront/governanceRuntime.js` — builds `created_by_employee_id=in.(...)` scope filters
- `services/ops/ordersApi.js` — calls RPC `get_visible_orders` (scoped) with fallback to `runtime_order_visibility`
- Each page still applies its own `created_by_employee_id=eq.` or `customer_id=eq.` filter

**Not yet centralized**: scope filter construction. Current contract builders don't include scope-aware query construction.

## Remaining Duplication (Write Paths — Intentionally Not Centralized)

| File | Operation | Table |
|------|-----------|-------|
| `services/storefront/orderApi.js` | INSERT | `orders` (raw) |
| `services/ops/ordersApi.js:84` | PATCH | `orders` (raw) |
| `domains/ops/pages/orders/list.js:104` | DELETE | `orders` (raw) |
| `domains/ops/pages/orders/detail.js:65,73` | PATCH + DELETE | `orders` (raw) |

These write paths intentionally remain on the raw `orders` table — the view is read-only.

## Assessment

| Dimension | Pre-Phase 4 | Post-Phase 4 |
|-----------|-------------|--------------|
| Unique column definitions | 22 | 6 (contract builders) |
| Name resolution patterns | 8 manual fallback chains | 2 view-based |
| Table sources | 25 `orders` queries | 21 `runtime_order_visibility`, 4 `orders` (writes) |
| Customer resolve N+1 | 1 file (`invoicesApi.js:48-61`) | 0 |
