# Ahram Operational Runtime — Full System Reconstruction Master Document

## مقدمة

هذا المستند يمثل إعادة بناء كاملة للنظام كما تم تصميمه وتحليله وتطويره عبر المحادثات المختلفة الخاصة بمشروع شركة الأهرام للتجارة والتوزيع.

الهدف من هذا المستند:

- توثيق الحقيقة المعمارية الكاملة للنظام.
- حفظ كل الفلسفة التشغيلية والقرارات المعمارية.
- توضيح تطور قاعدة البيانات والـ Runtime.
- توضيح الـ Governance والـ Ownership.
- توضيح نظام التسعير والشرائح.
- توضيح Runtime التشغيل.
- توضيح مشاكل النظام الحالية.
- توضيح الاتجاه الاستراتيجي الصحيح.
- منع ضياع المعرفة التشغيلية.

هذا ليس ملخصًا.
هذا مستند إعادة بناء تشغيلية ومعمارية كاملة.

---

# 1) الهوية الحقيقية للنظام

النظام ليس Ecommerce تقليدي.

النظام هو:

# Governed Operational Distribution Runtime

أو:

# Distribution Operating System

النظام مصمم لإدارة:

- التجارة B2B
- التشغيل الداخلي
- المندوبين
- العملاء
- التسعير
- الشرائح
- الطلبات
- الزيارات
- المخازن
- التوزيع
- التحصيل
- الحوكمة التشغيلية
- الصلاحيات
- الرؤية التشغيلية
- الـ workflows

النظام ليس متجر إلكتروني.

بل نظام تشغيل فعلي لشركة توزيع.

---

# 2) نموذج العمل Business Model

النشاط:

شركة الأهرام للتجارة والتوزيع.

المجال:

B2B Distribution.

التخصص:

توزيع مستحضرات التجميل.

العملاء:

- تجار
- محلات جملة
- موزعين
- عملاء تابعين لمندوبين
- عملاء مباشرون

طريقة العمل:

- مندوبين بيع
- مشرفين
- مديري بيع
- تشغيل داخلي
- مخازن
- تحصيل
- زيارات
- أوردرات
- تسعير حسب الشرائح

---

# 3) الفلسفة المعمارية للنظام

الفلسفة الأساسية:

# Operational Runtime First

أي:

الأولوية ليست للشكل.

بل:

- للتشغيل
- للحوكمة
- للـ workflows
- للرؤية التشغيلية
- للـ ownership
- للـ execution

النظام يجب أن يشعر المستخدم أنه داخل:

# نظام تشغيل شركة

وليس لوحة متجر.

---

# 4) الاتجاه المعماري الأساسي

القرار المعماري الأهم:

# Capability-Based Governance

بدل:

# Role-Based Only

السبب:

الشركة لا تعمل بأدوار جامدة.

قد يكون الموظف:

- مندوب
- يستلم
- يراجع
- يوافق
- يتابع
- يدير عملاء
- ينفذ عمليات مخزن

وبالتالي:

Rigid RBAC سوف ينهار.

لذلك تم الاتجاه إلى:

- Capabilities
- Ownership
- Visibility
- Workflow Authority

---

# 5) نموذج الـ Ownership

النظام يعتمد على:

# Ownership Hierarchy

وليس فقط Roles.

الهيكل:

مدير بيع
→ مشرف
→ مندوب
→ عملاء

مع دعم:

- direct customers
- managed customers

الملكية التشغيلية منفصلة عن نوع العميل.

الحقول الأساسية:

- owner_type
- owner_id

هذا يسمح بأن يكون العميل:

- تابع لمندوب
- تابع لموظف
- مباشر
- تابع لمشرف

بدون الحاجة لأنواع عملاء مختلفة.

---

# 6) Runtime Authorization الحالي

النظام الحالي Hybrid Legacy Runtime.

المصدر الأساسي للـ session:

state.auth.session

يتم Hydration من:

src/runtime/bootstrap.js

ويتم حفظه في:

localStorage

النظام الحالي لا يعتمد على Supabase Auth الحقيقي.

بل يعتمد على:

- admins table
- sales_reps table
- customers table

عبر:

authService.js

و RPC auth calls.

---

# 7) مشكلة النظام الحالية

النظام الحالي فيه:

# Runtime Coupling شديد جدًا

أمثلة:

- pricing مربوط بالcart runtime
- ownership مربوط بالأوردرات مباشرة
- userType داخل business logic
- auth مربوط بالجداول التشغيلية
- workflows غير معزولة
- visibility موزعة
- runtime logic موزع بين frontend و SQL و RPCs

وهذا أخطر تهديد مستقبلي.

---

# 8) طبقات النظام الأساسية

## 8.1 Runtime Layer

تشمل:

- SPA
- Routing
- Session hydration
- State management
- Dashboards
- Operational screens
- Cart runtime
- Dynamic loading

الـ runtime الحالي يعتمد على:

- runtime-domains
- shared helpers
- dashboard bootstrap
- dynamic module loading

---

## 8.2 Commerce Engine

المكون الأخطر والأهم.

ليس مجرد أسعار.

بل:

# Decision Engine

يشمل:

- الشرائح
- الخصومات
- الحد الأدنى
- flash offers
- daily offers
- invoice validation
- cart calculations
- unit normalization

---

## 8.3 Governance Layer

تشمل:

- capabilities
- ownership
- visibility
- workflow authority
- operational isolation
- execution authority

---

## 8.4 Operational Runtime

المطلوب الحقيقي.

ليس Dashboard عادي.

بل:

# Operational Command Center

يشمل:

- queues
- counters
- operational actions
- execution workflows
- alerts
- approvals
- domain visibility
- workflow monitoring

---

## 8.5 Data & Workflow Layer

النظام يجب أن يكون:

# Workflow-Driven

وليس CRUD-driven.

الأوردر يمر بحالات تشغيلية.

وليس مجرد row.

---

# 9) نموذج المنتجات

الجداول الأساسية:

- products
- product_units
- product_prices
- product_tier_pricing
- product_tier_exceptions

كل منتج:

- له code ثابت
- له company
- له category
- له base unit
- يدعم multiple units

الوحدات:

- قطعة
- دستة
- كرتونة
- إلخ

الـ normalization يتم عبر:

base_unit_quantity

---

# 10) نموذج التسعير

النظام يعتمد على:

# Pricing Tiers

الشرائح:

- برونزية
- فضية
- ذهبية

كل شريحة:

- لها خصم
- لها minimum target
- تؤثر على cart runtime
- تؤثر على invoice validation

---

# 11) استثناءات التسعير

بعض المنتجات أو الشركات:

لا تدخل ضمن خصومات الشرائح.

أمثلة:

- فوج
- باليت
- سبـاركل
- باركفيل

هذه تعتمد على:

product_tier_exceptions

والـ pricing_source يكون:

- tier
أو
- exception

---

# 12) Cart Runtime

الجدول الأساسي:

cart_items

يحفظ:

- customer_id
- product_id
- product_unit_id
- selected_tier_id
- quantity
- base_price
- discount_percent
- final_price
- pricing_source

الحسابات Live.

كل تغيير في الشريحة:

- يحدث الأسعار
- يحدث totals
- يحدث validation

---

# 13) Order Snapshot Runtime

الهدف:

تجميد الحقيقة السعرية وقت تنفيذ الأوردر.

الجدول:

order_items_snapshot

يحفظ:

- base_price
- selected_tier_name
- discount_percent
- final_price
- pricing_source

السبب:

عدم تأثر الأوردرات القديمة بأي تغييرات مستقبلية.

---

# 14) الطلبات Orders

الجدول:

orders

يحفظ:

- subtotal_amount
- discount_amount
- total_amount
- ownership
- status
- workflow state

---

# 15) Workflow Runtime

الأوردر ليس مجرد row.

الأوردر يمر بـ lifecycle.

الحالات المحتملة:

- created
- submitted
- pending
- approved
- packed
- assigned
- shipped
- delivered
- returned
- settled
- cancelled

كل transition:

- له صلاحيات
- له ownership
- له operational effect
- له audit trail

---

# 16) Runtime Views الموجودة

الفيوهات الحالية:

- runtime_cart_view
- runtime_customer_orders
- runtime_customer_visibility
- runtime_employee_capabilities
- runtime_employee_orders
- runtime_events_health
- runtime_failed_events
- runtime_operations_dashboard
- runtime_order_status
- runtime_order_visibility
- runtime_processing_events
- runtime_product_prices
- runtime_visits_with_maps

---

# 17) runtime_employee_capabilities

هذا view مهم جدًا.

يمثل:

# Governance Projection Layer

يعرض:

- كل employee
- كل capability
- الرؤية التشغيلية live

---

# 18) runtime_product_prices

يمثل:

# Canonical Pricing Projection

يحسب:

- السعر الأساسي
- خصم الشريحة
- الاستثناءات
- السعر النهائي

Live.

---

# 19) runtime_order_visibility

الغرض:

تحديد من يرى ماذا.

يعتمد على:

- ownership
- hierarchy
- capabilities

---

# 20) runtime_operations_dashboard

المفترض أن يكون:

Operational command surface.

وليس مجرد dashboard إحصائي.

المفترض أن يعرض:

- queues
- counters
- critical alerts
- workflow backlog
- pending approvals
- operational workload

---

# 21) Visits Runtime

الفيو:

runtime_visits_with_maps

يدل على:

- وجود domain للزيارات
- دعم geolocation
- خرائط
- تتبع زيارات المندوبين

---

# 22) Runtime Event System

الفيوهات:

- runtime_processing_events
- runtime_failed_events
- runtime_events_health

توضح أن النظام يتحرك نحو:

# Event-driven operational runtime

أو على الأقل:

runtime observability.

---

# 23) مشاكل Runtime الحالية

## 23.1 Schema Drift

وجود أكثر من مصدر للحقيقة.

## 23.2 Distributed Business Logic

الـ logic موزع بين:

- frontend
- SQL views
- triggers
- RPCs
- runtime state

## 23.3 Legacy Coupling

- sales_rep_id coupling
- userType coupling
- auth coupling

## 23.4 Runtime Bootstrap Fragility

حدثت مشاكل مثل:

- runtime-domains/common.js missing
- normalizeSearchText undefined
- bootstrap failure
- operational console failure

وهذا كشف:

ضعف dependency orchestration.

---

# 24) Operational Architecture Direction

الاتجاه الصحيح الذي تم الاتفاق عليه:

- workflow-first runtime
- governance-first visibility
- capability-based execution
- operational command center
- domain isolation
- canonical service layer
- runtime observability

---

# 25) ما يجب عدم فعله

## عدم عمل rewrite شامل.

لأن:

النظام الحالي يحتوي على runtime logic حقيقي.

وإعادة الكتابة الكاملة ستؤدي غالبًا إلى:

- انهيار التشغيل
- ضياع business rules
- إعادة إنتاج الفوضى

الاتجاه الصحيح:

# Incremental Stabilization

---

# 26) الأولويات الاستراتيجية

## المرحلة الأولى

Stabilize Runtime.

## المرحلة الثانية

Operational UX.

## المرحلة الثالثة

Workflow Modeling.

## المرحلة الرابعة

Governance Projection.

## المرحلة الخامسة

Capability Enforcement.

## المرحلة السادسة

Domain Isolation.

---

# 27) العقود التشغيلية Canonical Contracts

## Canonical Customer

يجب أن يحتوي على:

- ownership
- visibility
- commercial profile
- operational state
- assigned rep

---

## Canonical Employee

يجب أن يحتوي على:

- hierarchy
- capabilities
- operational domains
- visibility scope
- execution authority

---

## Canonical Order

يجب أن يحتوي على:

- workflow state
- ownership
- pricing snapshot
- operational assignment
- auditability

---

## Canonical Pricing

يجب أن يحتوي على:

- base price
- unit normalization
- pricing tier
- pricing source
- discount isolation
- operational validation

---

# 28) Runtime Philosophy النهائية

الهدف النهائي ليس:

- متجر
- ERP تقليدي
- CRM منفصل

الهدف:

# Unified Governed Distribution Runtime

حيث:

- التجارة
- التشغيل
- الحوكمة
- الرؤية
- التنفيذ
- التسعير
- workflows

كلها تعمل داخل Runtime موحد.

---

# 29) الخطر الأكبر مستقبليًا

إذا لم يتم:

- canonicalization
- service isolation
- governance normalization
- workflow standardization

فسوف يحدث:

- maintainability collapse
- runtime drift
- ownership inconsistency
- pricing corruption
- operational conflicts
- scaling failure

---

# 30) التقييم التنفيذي النهائي

المشروع يمتلك:

- رؤية تشغيلية قوية
- اتجاه معماري صحيح
- فهم عميق للتشغيل الواقعي
- separation between commerce and governance
- استعداد للتحول إلى enterprise runtime

لكن:

النظام لا يزال في مرحلة:

# Runtime Extraction & Stabilization

وليس مرحلة feature expansion.

وأي توسع قبل stabilization سيضاعف الدين المعماري بشكل خطير.

---

# خاتمة

هذا المستند يمثل إعادة بناء كاملة للنظام الحالي كما تم استخلاصه من:

- المحادثات
- تحليل الـ runtime
- الجداول
- الفيوهات
- الـ workflows
- منطق التسعير
- ownership logic
- governance assumptions
- المشاكل التشغيلية
- الاتجاهات المعمارية

ويجب اعتباره:

# المرجع المعماري الأعلى للنظام الحالي

حتى يتم إنشاء:

- canonical services
- isolated operational runtime
- governance engine
- enterprise workflow runtime
- stabilized operational architecture

