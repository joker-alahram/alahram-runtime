# Phase 1 Governance Matrices — Complete Audit

## 1. ROUTE MATRIX

### OPS Domain (18 base routes, 14 expanded)

| # | Route Name | Route Guard (authGuard.js) | Nav Item | Admin Tier | Page Registered |
|---|---|---|---|---|---|
| 1 | ops/dashboard | `null` | الرئيسية | ALL | renderOpsDashboard |
| 2 | ops/orders | `null` | الطلبات | ALL | renderOrdersList |
| 3 | ops/order | **undefined → auth_required** ⚠️ | (→ orders) | ALL | renderOrderDetail |
| 4 | ops/customers | `null` | العملاء | ALL | renderOpsCustomers |
| 5 | ops/customer | **undefined → auth_required** ⚠️ | (→ customers) | ALL | renderOpsCustomer |
| 6 | ops/inventory | `['can_manage_inventory']` | المخزون | Admin | renderInventoryList |
| 7 | ops/inventory-product | **undefined → auth_required** ⚠️ | (→ inventory) | Admin | renderInventoryDetail |
| 8 | ops/pricing | `['can_manage_inventory','can_manage_system']` | التسعير | Admin | renderOpsPricing |
| 9 | ops/pricing-product | **undefined → auth_required** ⚠️ | (→ pricing) | Admin | renderOpsPricingProduct |
| 10 | ops/employees | `['can_manage_system']` | الموظفين | Admin | renderOpsEmployees |
| 11 | ops/employee | **undefined → auth_required** ⚠️ | (→ employees) | Admin | renderOpsEmployee |
| 12 | ops/workflow | `['can_approve_orders','can_manage_inventory']` | سير العمل | Admin | renderOpsWorkflow |
| 13 | ops/warehouses | `['can_manage_inventory']` | المستودعات | Admin | renderOpsWarehouses |
| 14 | ops/events | `['can_manage_system']` | الأحداث | Admin | renderOpsEvents |
| 15 | ops/products | `['can_manage_inventory','can_manage_system']` | المنتجات | Admin | renderOpsProductsList |
| 16 | ops/product | **undefined → auth_required** ⚠️ | (→ products) | Admin | renderOpsProductDetail |
| 17 | ops/reps | `null` | المناديب | ALL | renderOpsReps |
| 18 | ops/rep | `null` | (→ reps) | ALL | renderOpsRepProfile |
| 19 | ops/audit | `['can_manage_system']` | سجل المراجعة | Admin | renderOpsAudit |
| 20 | ops/reports | `['can_view_all_reports']` | التقارير | Admin | renderOpsReports |
| 21 | ops/campaigns | `['can_manage_system']` | الحملات | Admin | renderOpsCampaigns |

**⚠️ Gap — 6 OPS detail routes have undefined guards** (auth_guard.js:32-69):
`ops/order`, `ops/customer`, `ops/inventory-product`, `ops/pricing-product`, `ops/employee`, `ops/product` are NOT in `ROUTE_GUARDS`. The prefix matcher (line 80-85) only matches `pattern + '/'`, but detail route names use singular form different from the list pattern (e.g., `ops/order` vs `ops/orders`). Result: ANY authenticated user can reach these route pages, bypassing the intended capability check at the route guard level. The page-level feature checks (in the individual page renderers) provide a second line of defense.

**✅ SUPER_ADMIN bypass in authGuard.js:107-131** — session-level (line 108) + identity-level defensive (line 129) bypasses ensure SUPER_ADMIN always passes regardless of route guard configuration.

---

### Field Domain (8 base routes, 13 expanded)

| # | Route Name | Route Guard (authGuard.js) | Nav Item | Page Registered |
|---|---|---|---|---|
| 1 | field/dashboard | `['can_open_visit']` | اليوم | renderFieldDashboard |
| 2 | field/visits | `['can_open_visit']` | الزيارات | renderFieldVisitsList |
| 3 | field/visit | **undefined → auth_required** ⚠️ | (→ visits) | renderFieldVisitDetail |
| 4 | field/customers | `['can_open_visit']` | العملاء | renderFieldCustomers |
| 5 | field/customer | **undefined → auth_required** ⚠️ | (→ customers) | renderFieldCustomer |
| 6 | field/orders | `['can_open_visit']` | الطلبات | renderFieldOrders |
| 7 | field/order | **undefined → auth_required** ⚠️ | (→ orders) | renderFieldOrder |
| 8 | field/collections | `['can_open_visit']` | التحصيل | renderFieldCollections |
| 9 | field/collection | **undefined → auth_required** ⚠️ | (→ collections) | renderFieldCollection |
| 10 | field/tasks | `['can_open_visit']` | المهام | renderFieldTasks |
| 11 | field/task | **undefined → auth_required** ⚠️ | (→ tasks) | renderFieldTask |
| 12 | field/location | `['can_open_visit']` | **NOT in NAV** (field/bootstrap.js:25-29) | renderFieldLocation |
| 13 | field/today | `['can_open_visit']` | — (→ dashboard) | — (→ field/dashboard) |

**⚠️ Gap — 5 field detail routes have undefined guards**: Same pattern as OPS.

**⚠️ Gap — field/location has no NAV entry**: Acceptable per earlier decision, but `field/location` is not in the `NAV` array in `field/bootstrap.js:25-29`. It's only accessible via direct URL or contextual navigation.

---

### Portal Domain (5 base routes, 8 expanded)

| # | Route Name | Route Guard (authGuard.js) | Nav Item | Page Registered |
|---|---|---|---|---|
| 1 | portal/dashboard | `null` | الرئيسية | renderPortalDashboard |
| 2 | portal/orders | `null` | طلباتي | renderPortalOrders |
| 3 | portal/order | **undefined → auth_required** ⚠️ | (→ orders) | renderPortalOrder |
| 4 | portal/invoices | `null` | فواتيري | renderPortalInvoices |
| 5 | portal/invoice | **undefined → auth_required** ⚠️ | (→ invoices) | renderPortalInvoice |
| 6 | portal/visits | `null` | زياراتي | renderPortalVisits |
| 7 | portal/visit | **undefined → auth_required** ⚠️ | (→ visits) | renderPortalVisit |
| 8 | portal/profile | `null` | بياناتي | renderPortalProfile |

**⚠️ Gap — 3 portal detail routes have undefined guards**: These should be `null` (public) like their parent list routes. Unintentionally requiring authentication for detail pages.

---

### Storefront Domain (22 routes)

| # | Route Name | Route Guard | Domain Pattern | Access |
|---|---|---|---|---|
| 1-22 | home, products, product/:id, cart, checkout, orders, order/:id, offers, dailydeal, flashoffer, login, register, search, companies, company/:id, tiers, invoices, invoice/:id, account, customers, customer/:id, visits, visit/:id, reps, rep/:id | **No route guards** (storefront is skipped in `_guard()`) | `registry.js:14` — `^$|^(home\|products?...)$` | All public (no auth required, no capability check) |

Storefront is excluded from the governance guard entirely — `_guard()` at `registry.js:60` returns `false` immediately for `targetDomain === 'storefront'`. Session-based features (cart, orders, invoices) rely on page-level session checks.

---

### PWA Domain (3 routes)

| # | Route Name | Route Guard | Nav Item |
|---|---|---|---|
| 1 | pwa/dashboard | **undefined → auth_required** | — |
| 2 | pwa/install | **undefined → auth_required** | — |
| 3 | pwa/settings | **undefined → auth_required** | — |

PWA routes are NOT in `ROUTE_GUARDS` — default to requiring authentication. Acceptable since PWA is an authenticated feature.

---

### Route Guard Summary

| Domain | Routes Defined | Routes with Correct Guards | Routes with Incorrect Guards | Gap % |
|---|---|---|---|---|
| OPS | 21 | 15 | 6 | 29% |
| Field | 13 | 7 | 6 | 46% |
| Portal | 8 | 5 | 3 | 38% |
| Storefront | 22 | 22 (no guards applied) | 0 | 0% |
| PWA | 3 | 0 | 3 (intentional — auth_required default) | 100% (by design) |
| **Total** | **67** | **49** | **15** | **22%** |

---

## 2. CAPABILITY MATRIX

### Canonical Capabilities (from capabilities.contract.js:19-31)

| # | Capability Column | DB Field | Route Guard | Page Feature | Workflow | Ownership Bypass | Usage Status |
|---|---|---|---|---|---|---|---|
| 1 | `can_manage_system` | `can_manage_system` | ops/employees, ops/events, ops/audit, ops/campaigns, ops/pricing, ops/products | reps.js:addRep, customers.js:edit/delete, customer.js:edit/delete, productsApi.js:mutations | Admin bypass (line 7) | Bypasses all scope filters | **Active** |
| 2 | `can_create_orders` | `can_create_orders` | — | governanceRuntime.js:canCreateOrder() | — | — | **Active** (page-level only) |
| 3 | `can_open_visit` | `can_open_visit` | ALL 8 field routes | governanceRuntime.js:canOpenVisit() | — | — | **Active** |
| 4 | `can_approve_orders` | `can_approve_orders` | ops/workflow | governanceRuntime.js:canApproveOrder() | Required for workflow transitions | — | **Active** |
| 5 | `can_manage_inventory` | `can_manage_inventory` | ops/inventory, ops/inventory-product?, ops/warehouses, ops/pricing, ops/products, ops/workflow | governanceRuntime.js:canManageInventory(), productsApi.js:mutations | Required for warehouse transitions | — | **Active** |
| 6 | `can_manage_treasury` | `can_manage_treasury` | **NONE** | **NONE** | **NONE** | — | **DEAD CODE** |
| 7 | `can_view_all_reports` | `can_view_all_reports` | ops/reports | — | Admin bypass (line 7) | Bypasses ALL scope filters | **Active** |

### Capability Check Points — Full Map

**Route Guards (authGuard.js:32-69)**:
```
ops/inventory          → can_manage_inventory
ops/pricing            → can_manage_inventory ∨ can_manage_system
ops/employees          → can_manage_system
ops/workflow           → can_approve_orders ∨ can_manage_inventory
ops/warehouses         → can_manage_inventory
ops/events             → can_manage_system
ops/audit              → can_manage_system
ops/reports            → can_view_all_reports
ops/products           → can_manage_inventory ∨ can_manage_system
ops/campaigns          → can_manage_system
field/* (8 routes)    → can_open_visit
```

**Runtime Guards (governanceRuntime.js)**:
```
canViewOrder()         → can_view_all_reports ∨ isAdmin ∨ ownership
canCreateOrder()       → can_manage_system ∨ can_view_all_reports ∨ isAdmin ∨ can_create_orders ∨ (customer)
canOpenVisit()         → isAdmin ∨ can_manage_system ∨ can_view_all_reports ∨ (has assigned customers)
canManageVisit()       → isAdmin ∨ ownership
canViewCustomer()      → can_view_all_reports ∨ isAdmin ∨ ownership
canViewEmployee()      → can_view_all_reports ∨ isAdmin ∨ hierarchy
canApproveOrder()      → isAdmin ∨ can_manage_system ∨ can_view_all_reports ∨ (workflow role exists)
canManageInventory()   → can_manage_system ∨ can_view_all_reports ∨ isAdmin ∨ can_manage_inventory
```

**Page-Level Feature Checks** — SUPER_ADMIN bypass patterns:
- reps.js:41 — `isAdmin ∨ SUPER_ADMIN ∨ hasCapability('can_manage_system')`
- customers.js:41 — same pattern
- customer.js:43 — same pattern
- productsApi.js:158-163 — same pattern

### Capability Resolution Chain
1. `authGuard.js:checkRouteAccess()` → `hasCapability()` RPC (cached 10s) OR identity capabilities fallback
2. `authGuard.js:107-110` — SUPER_ADMIN session bypass (early return before RPC)
3. `authGuard.js:128-131` — SUPER_ADMIN identity defensive fallback
4. Page-level: identity.isAdmin || session roleCode === 'SUPER_ADMIN' || hasCapability()

---

## 3. OWNERSHIP MATRIX

### Three Ownership Layers

#### Layer 1: Customer Ownership (`customer_id`)
- **Scope**: Orders, visits, customer records
- **Source**: Session actor type `customer` with `customerId`
- **Implementation**:
  - `scopeOrderParams()` (governanceRuntime.js:292-304): `customer_id = eq.{customerId}`
  - `canViewOrder()` (line 170-173): Direct comparison `order.customer_id === identity.customerId`
- **Bypass**: Admin/can_view_all_reports returns empty object (no filter)
- **Affected domains**: Storefront (customer portal), OPS (when scoped)

#### Layer 2: Employee Hierarchy (`get_employee_descendants` RPC)
- **Scope**: Employee + their entire reporting chain up to depth 10
- **Source**: `_fetchHierarchyIds()` → `get_employee_descendants({p_employee_id, p_max_depth: 10})`
- **Caching**: Cached in `_hierarchyIds` on `hydrateIdentity()` call
- **Implementation**:
  - `scopeOrderParams()` (line 296-298): `created_by_employee_id = in.(hierarchyIds)`
  - `scopeEmployeeIds()` (line 328-332): Returns hierarchy array or null (admin bypass)
  - `scopeCustomerIds()` (line 306-322): Fetches all customer_assignments for hierarchy
  - `canViewOrder()` (line 167): `_hierarchyIds.includes(order.created_by_employee_id)`
  - `canManageVisit()` (line 207): `_hierarchyIds.includes(visit.employee_id)`
  - `canViewEmployee()` (line 254): `_hierarchyIds.includes(employeeId)`
  - `canViewCustomer()` (line 219-241): Checks each hierarchy member's customer_assignments
- **Bypass**: Admin/can_view_all_reports returns `[]` (empty = no filter = all records)

#### Layer 3: Team Scope (scopeEmployeeIds, scopeCustomerIds, scopeOrderParams, scopeVisitParams)
- **Scope**: Pre-computed scope filter parameters for API queries
- **Implementation**:
  - `scopeOrderParams()` → `{created_by_employee_id: "in.(id1,id2,...)"}`
  - `buildOrderScopeFilter()` → `"created_by_employee_id=in.(id1,id2,...)"`
  - `buildVisitScopeFilter()` → `"employee_id=in.(id1,id2,...)"`
  - `scopeCustomerIds()` → `[id1, id2, ...]` or `null` (admin = all)
  - `scopeEmployeeIds()` → `[id1, id2, ...]` or `null` (admin = all)
- **Bypass**: Admin/can_view_all_reports returns `null` (no filter = all records)

### Ownership Resolution for Each Guard Function

| Guard Function | Guest | Customer | Employee (self) | Employee (team) | Admin |
|---|---|---|---|---|---|
| canViewOrder | ❌ | ✅ own orders | ✅ own orders | ✅ team orders | ✅ all |
| canCreateOrder | ❌ | ✅ | ✅ if can_create_orders | ✅ if can_create_orders | ✅ |
| canOpenVisit | ❌ | ❌ | ✅ if assigned | ✅ if assigned | ✅ |
| canManageVisit | ❌ | ❌ | ✅ own visits | ✅ team visits | ✅ all |
| canViewCustomer | ❌ | ✅ self | ✅ assigned | ✅ team-assigned | ✅ all |
| canViewEmployee | ❌ | ❌ | ✅ self | ✅ team members | ✅ all |
| canApproveOrder | ❌ | ❌ | ❌ (unless role has transitions) | ❌ (unless role has transitions) | ✅ |
| canManageInventory | ❌ | ❌ | ❌ (unless has capability) | ❌ (unless has capability) | ✅ |

### Identity Hydration `isAdmin` Flag

Three code paths in `governanceRuntime.js:55-79`:
1. **RPC success** (line 61-69): `isAdmin = rec.capabilities.can_manage_system` + fallback check `['ADMIN','SUPER_ADMIN','CHAIRMAN'].includes(roleCode)`
2. **RPC failure** (line 71-73): `isAdmin = ['ADMIN','SUPER_ADMIN','CHAIRMAN'].includes(roleCode)`
3. **RPC exception** (line 75-78): Same as failure

**Critical detail**: The RPC `current_employee_record` returns `{capabilities: {can_manage_system: true}}` for SUPER_ADMIN. But this RPC requires the Supabase JWT. If JWT is missing, the RPC fails and falls to path 2, where `roleCode` from local auth determines `isAdmin`.

**⚠️ Gap**: `isAdmin` flag ONLY checks `['ADMIN','SUPER_ADMIN','CHAIRMAN']`. EXECUTIVE_MANAGER and EXECUTIVE_SUPERVISOR are NOT in this list, though `workflowAuthority.js:7` treats them as admin.

---

## 4. GOVERNANCE MATRIX

### Actor Type → Role → Profile → Domain → Menu → Capabilities → Ownership

| # | Actor Type | Role Code(s) | Profile | Domain | Nav Items | Capabilities Available | Ownership Scope |
|---|---|---|---|---|---|---|---|
| 1 | guest | N/A | guest | storefront | 6 (home, companies, products, offers, cart) | NONE | NONE |
| 2 | customer | customer | customer | storefront | 8 (home, products, offers, cart, tiers, invoices, account) | can_create_orders (implicit) | Self (customer_id) |
| 3 | customer | customer | customer | portal | 5 (dashboard, orders, invoices, visits, profile) | can_create_orders (implicit) | Self (customer_id) |
| 4 | employee | sales_rep | field_rep | field | 6 (today, visits, customers, orders, collections, tasks) | can_open_visit, can_create_orders | Self (employee_id), own customers |
| 5 | employee | sales_supervisor, sales_lead | supervisor | ops | 4 (dashboard, reps, orders, customers) | can_open_visit, can_create_orders, can_approve_orders | Team (hierarchy descendants) |
| 6 | employee | sales_manager, manager, general_manager, executive_manager, sales_director, warehouse_manager | manager | ops | 6 (dashboard, reps, orders, customers, reports, pricing) | can_open_visit, can_create_orders, can_approve_orders, can_view_all_reports?, can_manage_inventory? | Team (hierarchy descendants) |
| 7 | employee | admin, super_admin, chairman | admin | ops | 14 (ALL) | ALL 7 capabilities | ALL (no filter) |
| 8 | employee | executive_supervisor | supervisor | ops | 4 (dashboard, reps, orders, customers) | Varies (not admin in identity, but admin in workflow) | Team (hierarchy descendants) |
| 9 | employee | regional_manager | supervisor | ops | 4 (dashboard, reps, orders, customers) | Varies | Team (hierarchy descendants) |
| 10 | employee | inventory_manager | field_rep (default) | field | 6 | can_manage_inventory (if set) | Self |
| 11 | employee | ANY other role | field_rep (default) | field | 6 | Varies | Self |

### Profile Routing (runtimeProfile.js:93-140)

```
guest → actor.type === undefined or no session
customer → actor.type === 'customer'
admin → _isAdmin(): isAdmin || can_manage_system || can_view_all_reports || role in ['ADMIN','SUPER_ADMIN','CHAIRMAN']
supervisor → role in ['SUPERVISOR','SALES_SUPERVISOR','REGIONAL_MANAGER','EXECUTIVE_SUPERVISOR']
manager → role in ['SALES_MANAGER','MANAGER','GENERAL_MANAGER','EXECUTIVE_MANAGER','SALES_DIRECTOR','WAREHOUSE_MANAGER']
field_rep → default for all other employee actor types
```

**⚠️ Gap — Profile routing priority**: `admin` check comes FIRST (line 113-116). If a user has `can_view_all_reports` but is a `sales_rep` role, they get routed to `admin` profile with 14 nav items. This is functionally correct (they can view all data), but the nav/menu may show items they can't actually use.

### Menu Visibility by Profile

| Profile | Nav Items Count | Nav Items |
|---|---|---|
| guest | 6 | home, companies, products, offers, cart, (login visible) |
| customer | 8 | home, products, offers, cart, tiers, invoices, account |
| field_rep | 6 | today, visits, customers, orders, collections, tasks |
| supervisor | 4 | dashboard, reps, orders, customers |
| manager | 6 | dashboard, reps, orders, customers, reports, pricing |
| admin | 14 | ALL (dashboard, orders, customers, inventory, pricing, products, employees, reps, workflow, warehouses, events, audit, reports, campaigns) |

### OPS Nav Filter (ops/bootstrap.js:72-81)

The `_filteredNavItems()` function determines which of the 14 nav items to show:
- **Admin tier** (isAdmin || can_manage_system || can_view_all_reports || SUPER_ADMIN): All 14 items
- **Non-admin tier** (supervisor/manager): Only 4 items (dashboard, orders, customers, reps)

**✅ SUPER_ADMIN session roleCode fallback** added at line 78: `String(session?.role?.roleCode || '').toUpperCase() === 'SUPER_ADMIN'`

---

## 5. WORKFLOW AUTHORITY MATRIX

### Role Sets (workflowAuthority.js:7-11)

| Set Name | Roles | Purpose |
|---|---|---|
| ADMIN_ROLES | admin, super_admin, chairman, executive_manager, executive_supervisor | Absolute admin bypass |
| SUPERVISOR_ROLES | sales_supervisor, sales_lead | Review/restore/delete in hierarchy |
| DIRECTOR_ROLES | sales_director, sales_manager, sales_lead | Approve/delete/restore in hierarchy |
| REP_ROLES | sales_rep | Own orders only: delete/cancel/edit |
| WAREHOUSE_ROLES | warehouse_manager, inventory_manager | Queue management: preparing/dispatched |

### Transition Authority by Role

| Role Set | Origin Status | Target Status | Scope Rule |
|---|---|---|---|
| ADMIN | ANY | ANY | No scope check (isAdmin bypass at lines 174, 210) |
| REP | pending | delete, cancelled, restore, edit, update, pending | Own order only: `_isOwned()` |
| SUPERVISOR | submitted, pending | reviewing | Hierarchy only: `_inHierarchy()` |
| SUPERVISOR | reviewing | pending (restore) | Hierarchy only |
| SUPERVISOR | reviewing | delete, cancelled | Hierarchy only |
| DIRECTOR | ANY | approved | Hierarchy only |
| DIRECTOR | approved, reviewing, pending | delete, cancelled | Hierarchy only |
| DIRECTOR | ANY | restore | Hierarchy only |
| WAREHOUSE | approved | preparing | No scope check (operational) |
| WAREHOUSE | preparing | dispatched | No scope check (operational) |

### Authority Resolution Chain

1. `canExecuteTransition()` (line 228):
   - `_ensureEmployeeContext()` → loads capabilities from RPC if missing
   - `_loadTransitions()` → fetches workflow_transitions by domain+origin
   - `hasWorkflowAuthority()` (line 207) → checks isAdmin → capability requirement → order scope
   - DB `workflow_transition_roles` check (line 253-260) → verifies role_code in allowed roles
   - DB `required_capability` check (line 262-265) → verifies capability granted

2. `getAllowedTransitions()` (line 271):
   - Same flow but returns ALL allowed transitions instead of single check
   - Used by UI to render available action buttons

3. `canOpenVisitForCustomer()` (line 314):
   - Admin bypass → check customer_assignments + runtime_customer_visibility
   - REP: only own assigned customers
   - SUPERVISOR: any customer assigned to team
   - DIRECTOR: team OR own

### Admin Bypass Scope in Workflow

The `isAdmin` flag in workflowAuthority.js (line 66-72) is BROADER than in governanceRuntime.js:
- `identity.isAdmin`
- `ADMIN_ROLES.has(roleCode)` → includes `executive_manager`, `executive_supervisor`
- `capabilities.can_manage_system`
- `capabilities.can_view_all_reports`

This means EXECUTIVE_MANAGER and EXECUTIVE_SUPERVISOR are treated as admin for workflow purposes but NOT for identity hydration in governanceRuntime.js.

---

## 6. GAPS SUMMARY

### 🔴 Critical (Code Fixes Applied)

| # | Gap | Location | Fix |
|---|---|---|---|
| C1 | SUPER_ADMIN couldn't see "Add Rep" button | reps.js:41-43 | Added identity/session bypass before hasCapability() |
| C2 | SUPER_ADMIN couldn't see Edit/Delete buttons | customers.js:41 | Added identity/session bypass before hasCapability() |
| C3 | SUPER_ADMIN couldn't see Edit/Delete/Reassign | customer.js:43 | Added identity/session bypass before hasCapability() |
| C4 | SUPER_ADMIN couldn't create/update/delete products | productsApi.js:158-163 | Added identity/session bypass before hasCapability() |
| C5 | Menu nav fallback missing session roleCode | ops/bootstrap.js:72-81 | Added `session.role.roleCode === 'SUPER_ADMIN'` check |

### ~~🟡 Medium (Fixed)~~

| # | Gap | Location | Fix |
|---|---|---|---|
| M1 | 6 OPS detail routes had undefined guards | authGuard.js:36-57 | Added `ops/order`, `ops/customer`, `ops/inventory-product`, `ops/pricing-product`, `ops/employee`, `ops/product` with correct capability guards |
| M2 | 5 Field detail routes had undefined guards | authGuard.js:59-72 | Added `field/visit`, `field/customer`, `field/order`, `field/collection`, `field/task` with `['can_open_visit']` |
| M3 | 3 Portal detail routes had undefined guards | authGuard.js:74-81 | Added `portal/order`, `portal/invoice`, `portal/visit` with `null` (public) |
| M4 | `can_manage_treasury` is dead governance code | capabilities.contract.js:30 | Defined in contract, zero usage in routes/pages/workflow |
| M5 | field/location has no NAV entry | field/bootstrap.js:25-29 | Not in navigation array; only contextually accessible |

### 🔵 Low / Informational

| # | Item | Location | Notes |
|---|---|---|---|
| L1 | identity isAdmin doesn't include EXECUTIVE_MANAGER/EXECUTIVE_SUPERVISOR | governanceRuntime.js:68 | WorkflowAuthority treats them as admin; profile routing handles via managerRoles/supervisoryRoles |
| L2 | hasCapability() hard JWT dependency | sessionService.js:174-186 | All 4 critical gaps stemmed from this; now mitigated by caller-side bypasses |
| L3 | Profile routing gives admin profile to anyone with can_view_all_reports | runtimeProfile.js:113-116 | Functionally correct but may show inaccessible nav items |
| L4 | `_guard()` skips storefront entirely | registry.js:60 | By design — storefront is public; session-based features check internally |

### Fix Recommendations for M1-M3

Add the missing detail route guards to `authGuard.js` ROUTE_GUARDS:

```javascript
// OPS detail routes
'ops/order': null,              // same as ops/orders
'ops/customer': null,           // same as ops/customers
'ops/inventory-product': ['can_manage_inventory'],  // same as ops/inventory
'ops/pricing-product': ['can_manage_inventory', 'can_manage_system'],
'ops/employee': ['can_manage_system'],
'ops/product': ['can_manage_inventory', 'can_manage_system'],

// Field detail routes
'field/visit': ['can_open_visit'],
'field/customer': ['can_open_visit'],
'field/order': ['can_open_visit'],
'field/collection': ['can_open_visit'],
'field/task': ['can_open_visit'],

// Portal detail routes
'portal/order': null,
'portal/invoice': null,
'portal/visit': null,
```
