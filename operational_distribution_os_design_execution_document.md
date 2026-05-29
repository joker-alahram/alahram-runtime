# وثيقة تنفيذية شاملة
# Operational Distribution OS
# Mobile-First Design + Runtime + Commerce Execution Specification

## 1) الهدف التنفيذي
هذا المشروع ليس متجرًا تقليديًا ولا Dashboard تقليديًا، بل **Operational Distribution OS**: نظام تشغيل تشغيلي لتوزيع B2B، يجمع بين:
- Commerce Runtime
- Governance Runtime
- Field Execution Runtime
- Operational Command Center
- Mobile-First Storefront

الهدف من هذه الوثيقة هو إعطاء OpenCode **خطة تنفيذية قابلة للتطبيق مباشرة على الكود**، مع الحفاظ الكامل على الاستقرار الحالي، وعدم كسر أي جزء تم بناؤه سابقًا، والتنفيذ **مرحلة بمرحلة** مع التحقق قبل الانتقال.

---

## 2) ملخص المعمارية الحالية التي يجب البناء فوقها
المشروع الحالي يحتوي على نطاقات تشغيلية واضحة داخل الكود:
- `domains/storefront` — تجربة العميل/الزائر/المندوب من منظور المتجر
- `domains/field` — تنفيذ الزيارات والعمل الميداني
- `domains/ops` — التشغيل، التقارير، إدارة الموارد، الحوكمة
- `domains/portal` — بوابة/واجهة ملخصة لبعض الحالات
- `auth` — الدخول، الجلسة، الهيدريشن
- `services/storefront` — الحوكمة، الـ runtime profile، التسعير، الفواتير
- `sql_new` — الـ migrations، الـ views، الـ RPCs، وعقود البيانات

هذا يعني أن التنفيذ يجب أن يكون **تحسينًا عميقًا فوق بنية موجودة** وليس إعادة كتابة شاملة.

---

## 3) الأدوار التشغيلية والنماذج السلوكية
المشروع يستخدم عدة أنواع من المستخدمين، وكل نوع يجب أن يرى Runtime مختلفة.

### 3.1 Guest
- يستعرض الشركات والمنتجات والعروض.
- لا يملك صلاحيات تنفيذية.
- لا يجب أن يُرى له Dashboard تشغيلي.

### 3.2 Customer
- يتصفح المتجر.
- يختار الشريحة التسعيرية.
- يضيف للسلة.
- يراجع الفواتير.
- يتابع الطلبات.

### 3.3 Field Rep
- يفتح زيارة.
- يزور العملاء.
- ينشئ طلبات.
- يتابع نشاطه الميداني.

### 3.4 Supervisor / Sales Manager
- يراقب الفريق.
- يتابع الزيارات.
- يفتح زيارة عند الحاجة.
- ينشئ طلبات أو يتدخل تشغيليًا حسب الصلاحيات.

### 3.5 Manager
- يتابع التشغيل الكامل.
- يراقب الأداء.
- يتابع التقارير.
- يتدخل تشغيليًا عند الحاجة.

### 3.6 Super Admin / Executive
- يتحكم بالنظام بالكامل.
- مركز عمليات مباشر.
- صلاحيات حوكمة كاملة.

**قاعدة أساسية:**
الهوية التشغيلية يجب أن تمر عبر:
`runtime session → runtime actor → runtime capabilities → runtime profile`
وليس عبر مزيج عشوائي من session/cache/fallback.

---

## 4) مبادئ التصميم الإلزامية
### 4.1 Mobile-First أولًا
- الواجهة يجب أن تبدو وتتصرف كـ PWA/موبايل أبلكيشن.
- كل عنصر UI يجب أن يكون قابلًا للاستخدام بيد واحدة.
- جميع الأهداف التفاعلية يجب أن تكون touch-friendly.
- لا نريد Dashboard desktop-like تقليدية.

### 4.2 Action-First
الواجهة لا تبدأ من الجماليات فقط؛ بل من الفعل:
- فتح زيارة
- إضافة للسلة
- تغيير الشريحة
- إنشاء فاتورة
- تنزيل PDF
- إرسال WhatsApp
- إدارة عرض الساعة/صفقة اليوم

### 4.3 Runtime Continuity
المستخدم يجب أن يشعر أن النظام “مستمر”:
- بعد refresh
- بعد suspend/resume
- بعد reconnect
- بعد logout/login

### 4.4 No Silent Fallbacks
أي خطأ في runtime يجب أن يكون مرئيًا في traces.
لا يجب أن يتحول المستخدم إلى Guest بصمت إذا كان لديه session/actor صحيح.

### 4.5 Canonical Source of Truth
- للهوية: `runtime session` + `runtime actor`
- للتسعير: `runtime_product_prices`
- للفواتير: snapshot immutable
- للحوكمة: runtime governance layer

---

## 5) الخريطة المعلوماتية الكاملة Information Architecture
يجب تنظيم النظام إلى طبقات صفحات واضحة:

### 5.1 طبقة المتجر Storefront
- الرئيسية
- الشركات
- المنتجات
- صفقة اليوم
- عرض الساعة
- الأكثر طلبًا
- منتجات تناسب سلتك
- السلة
- إتمام الشراء
- الطلبات
- الفواتير
- العملاء
- الزيارات
- الحساب
- التسجيل
- البحث

### 5.2 طبقة التشغيل Ops
- Dashboard
- التقارير
- الموظفون
- المندوبون
- العملاء
- الطلبات
- المخزون
- الأسعار
- الشريحة التسعيرية
- الحوكمة
- Workflow
- Audit
- Events

### 5.3 طبقة الميدان Field
- Dashboard الميداني
- الزيارات
- تفاصيل الزيارة
- العملاء
- الطلبات
- التحصيل
- المهام
- الموقع

### 5.4 طبقة البوابة Portal
- Dashboard
- الطلبات
- الفواتير
- الزيارة
- الملف الشخصي

---

## 6) تصميم الصفحة صفحة Page-by-Page Design System

### 6.1 الرئيسية Home
**الهدف:** استقبال المستخدم كواجهة متجر حية، لا كصفحة هبوط عادية.

**المحتويات:**
- Header بسيط
- Search bar ثابت
- Company cards
- Sections:
  - الشركات
  - صفقة اليوم
  - عرض الساعة
  - الأكثر طلبًا
  - منتجات تناسب سلتك
  - عروض خاصة
  - Recently viewed

**سلوك الموبايل:**
- Scroll عمودي
- بطاقات كبيرة
- CTA واضح: إضافة للسلة / تفاصيل / عرض
- لا ازدحام في الهيدر

### 6.2 الشركات Companies
**الهدف:** استعراض الشركات الموردة/العلامات.

**بطاقة الشركة:**
- شعار الشركة
- اسمها
- badges للعروض
- عدد المنتجات
- دخول سريع إلى صفحة الشركة

### 6.3 المنتجات Products
**الهدف:** كتالوج عملي سريع.

**Product Card يجب أن يحتوي:**
- صورة واضحة
- اسم المنتج
- السعر الحالي
- الشريحة التسعيرية الحالية
- badge للعرض إن وجد
- وحدة البيع
- زر إضافة سريع
- إشعار المخزون إن كان مهمًا

**سلوك مهم:**
- تغيير الشريحة يجب أن يعيد حساب الأسعار لحظيًا.
- العروض اليوم/عرض الساعة يجب أن تظل مستقلة عن tier pricing.

### 6.4 صفقة اليوم Daily Deal
**الهدف:** منتج/مجموعة ذات أولوية تحويل عالية.

**التصميم:**
- بطاقة Hero واضحة
- مؤقت/إحساس urgency
- CTA واضح
- سعر مميز
- badge تمييز

### 6.5 عرض الساعة Flash Offer
**الهدف:** عرض قصير المدة، مستقل عن الشريحة.

**التصميم:**
- Countdown واضح
- badge وقت متبقٍ
- بطاقات منتجات العرض
- CTA سريع

### 6.6 الأكثر طلبًا / Products Fit Your Cart
**الهدف:** التوصية والسلة الذكية.

**المنطق:**
- المنتجات الأكثر طلبًا
- منتجات تناسب سلتك
- cross-sell / up-sell

### 6.7 السلة Cart
**الهدف:** إدارة لحظية دقيقة.

**المطلوب:**
- live recalculation
- تغيير كمية
- تغيير وحدة
- تغيير شريحة
- تطبيق/إزالة عرض
- totals محدثة فورًا
- لا stale prices

### 6.8 إتمام الشراء Checkout
**الهدف:** التثبيت النهائي للطلب.

**المطلوب:**
- مراجعة نهائية
- تأكيد البيانات
- WhatsApp summary
- إنشاء فاتورة snapshot
- حفظ immutable invoice

### 6.9 الطلبات Orders
**الهدف:** متابعة الطلبات والـ lifecycle.

### 6.10 الفواتير Invoices
**الهدف:** عرض الفواتير، تنزيل PDF، مراجعة التفاصيل.

**يجب أن تتضمن الفاتورة:**
- كود الصنف
- اسم الصنف
- الوحدة
- الكمية
- السعر
- الإجمالي
- الخصومات
- الشريحة
- العروض
- snapshot ثابت

### 6.11 العملاء Customers
**الهدف:** قائمة العملاء والتفاصيل والربط بالزيارات/الطلبات.

### 6.12 الزيارات Visits
**الهدف:** الزيارات الميدانية، الحالة، التوقيت، الملاحظات، الموقع.

### 6.13 الحساب Account Hub
**الهدف:** نقطة تجميع nav الخاصة بالمستخدم.

**يجب أن تحتوي لكل الحسابات authenticated على:**
- عملائي → `#customers`
- فواتيري → `#invoices`
- الزيارات / مساحة العمل حسب الدور
- تثبيت التطبيق
- تسجيل الخروج

**مهم:**
هذه العناصر يجب أن تكون داخل action sheet/account menu، وليست في footer/header.

### 6.14 Dashboard / Center of Operations
**الهدف:** مركز التحكم التشغيلي.

**محتواه:**
- صفقة اليوم
- عرض الساعة
- إحصاءات حية
- alerts
- pricing controls
- stock pressure
- campaign controls
- conversion metrics
- team monitoring
- workflow queues

---

## 7) نظام التصميم البصري Visual Design System
### 7.1 الألوان
- خلفيات رئيسية: Slate / Off-white / Near-black للتباين المريح
- لون العلامة: أزرق مؤسسي
- لون التمييز: ذهبي / Amber
- الأخطاء: أحمر واضح غير فاقع
- النجاح: أخضر هادئ

### 7.2 Typography
- عربية واضحة
- وزن متوسط للعناوين
- حجم كبير للعناصر التفاعلية
- line-height مريح للقراءة الطويلة

### 7.3 Spacing
- التباعد يجب أن يكون generous
- لا ازدحام
- لا CSS كثيف غير مبرر

### 7.4 Surfaces / Cards
- Card radius كبير نسبيًا
- shadows خفيفة
- حدود ناعمة
- أسطح هادئة للموبايل

### 7.5 Motion
- انتقالات قصيرة
- لا animation مزعجة
- focus على الإحساس السريع

### 7.6 Touch Targets
- أزرار كبيرة
- min-height مناسب للمس
- safe-area padding

---

## 8) نظام التنقل Navigation System
### 8.1 Bottom Navigation
يجب أن يكون قليل الأيقونات، واضح، غير مزدحم.

### 8.2 Action Sheet / Account Menu
هذا هو المحور الأساسي للحسابات authenticated.
يجب أن يُفتح من صورة/اسم المستخدم أو أيقونة الحساب.

### 8.3 Runtime Workspace
- مساحة العمل النشطة
- تظهر وفق السياق
- لا تغرق الشاشة
- يمكن تصغيرها وتوسيعها

### 8.4 الملاحة حسب الدور
- Guest: الاستكشاف + الدخول + التثبيت
- Customer: المتجر + الحساب + الفواتير + الطلبات
- Employee/Field: زيارات + عملاء + متجر + طلبات + مساحة عمل
- Supervisor/Manager: مراقبة + فرق + تقارير + تدخل تشغيلي
- Admin: مركز التحكم + الحوكمة + العمليات + التدقيق

---

## 9) Runtime Context UX
### 9.1 الحالة النشطة يجب أن تظهر بوضوح
- active visit
- current tier
- current customer
- current order
- current operational mode

### 9.2 لا يجب أن تطغى على الصفحة
يجب أن تكون ظاهرة بشكل خفيف:
- bar
- chip
- bottom sheet
- sticky contextual mini-panel

### 9.3 تغيير السياق
عند تغير:
- الشريحة
- العميل
- الزيارة
- الطلب

يجب أن يتم تحديث الواجهة لحظيًا بدون كسر الصفحة.

---

## 10) قواعد الأداء والموثوقية Performance + Runtime Rules
- hydration يجب أن تكون متسلسلة وواضحة
- لا subscriber leaks
- لا duplicate render paths
- لا silent fallbacks
- لا pricing authority متعددة
- لا session authority متعددة
- لا stale cache يفوق runtime state
- لا async overwrite
- لا ghost identity
- لا guest fallback بعد login صحيح

---

## 11) نظام التسعير Pricing Rules
### 11.1 Tier Pricing
- الشريحة تؤثر فورًا على المنتجات المؤهلة
- تغيير الشريحة يعيد حساب السلة لحظيًا
- يجب حفظ الشريحة المختارة في runtime state

### 11.2 Deals / Offers Isolation
- صفقة اليوم
- عرض الساعة

لا يدخلان في tier eligibility.
لكن يجب أن يظهر إجماليهما في السلة والفاتورة.

### 11.3 Canonical Pricing
مصدر التسعير الوحيد يجب أن يكون projection موحد مثل:
- `runtime_product_prices`

ولا يجوز أن توجد pricing authorities متنافسة.

---

## 12) الفواتير WhatsApp PDF Snapshots
### 12.1 Invoice Snapshot
كل فاتورة يجب أن تخزن snapshot غير قابل للتغيير لـ:
- customer
- tier
- products
- unit
- quantity
- pricing
- discount
- offers
- ownership

### 12.2 PDF
يجب أن يكون:
- واضحًا
- نظيفًا
- يحتوي كود الصنف
- مناسبًا للموبايل والطباعة

### 12.3 WhatsApp Message
يجب أن يكون:
- عربي صحيح
- مقروءًا
- مختصرًا
- يحوي رابط الفاتورة
- يحوي الإجمالي والشريحة والعروض

---

## 13) خطة التنفيذ Implementation Roadmap

### Phase 1 — Runtime Stability Lock
**الهدف:** إزالة أي guest fallback أو session corruption أو duplication.

**Dependencies:**
- session service
- governance runtime
- runtime profile
- action sheet

**Validation:**
- suspend/resume
- reconnect
- hash storms
- logout/login race

### Phase 2 — Pricing Canonicalization
**الهدف:** توحيد مصدر الأسعار.

**Dependencies:**
- DB views/RPCs
- cart runtime
- invoice runtime

**Validation:**
- tier change recalculation
- offer isolation
- cart refresh persistence

### Phase 3 — Invoice Integrity
**الهدف:** snapshot immutable + PDF + WhatsApp.

**Dependencies:**
- canonical pricing
- customer snapshot
- invoice runtime

**Validation:**
- PDF review
- WhatsApp message review
- code visibility

### Phase 4 — Storefront Mobile UX
**الهدف:** تحويل المتجر إلى app-like storefront.

**Dependencies:**
- pricing stable
- invoices stable
- runtime stable

**Validation:**
- browsing speed
- mobile layout
- touch ergonomics

### Phase 5 — Operational Control Center
**الهدف:** إدارة العروض والتشغيل.

**Dependencies:**
- stable runtime
- canonical pricing
- operational metrics

**Validation:**
- deal controls
- counters
- alerts
- operational actions

---

## 14) تعليمات تنفيذية واضحة لـ OpenCode
OpenCode يجب أن:
1. يقرأ الكود الحالي + سجل القرارات السابقة + runtime traces.
2. يطبق تغييرات صغيرة ومتسلسلة لا تكسر الاستقرار.
3. يختبر كل تغيير قبل الانتقال لما بعده.
4. يستخدم trace logging عند الحاجة:
   - session
   - actor
   - profile
   - pricing
   - invoice
   - bootstrap
5. لا ينشئ مسارات UI موازية أو new architecture مكسورة.
6. لا يضيف features قبل تثبيت الـ runtime الأساسي.
7. لا يغيّر navigation أو UX بشكل يضرب mobile-first.
8. لا يفصل pricing عن invoice أو session عن actor.
9. لا يعيد silent guest fallback.
10. لا يعتبر أي مرحلة منتهية بدون regression check.

**القاعدة الذهبية:**
نفّذ → اختبر → صحّح → ثبّت → انتقل.

---

## 15) Definition of Done
لا تعتبر هذه الوثيقة منفذة بنجاح إلا إذا تحقق الآتي:
- Runtime stable
- Pricing canonical
- Tier changes live
- Offers isolated
- Invoice snapshots immutable
- PDF and WhatsApp correct
- Navigation simplified
- Account hub contains عملائي/فواتيري
- Mobile-first layout clean
- No guest fallback after login
- No stale hydration
- No duplicate subscribers
- No runtime corruption
- No mixed authority sources

---

## 16) الخلاصة التنفيذية
هذه المنظومة يجب أن تتحول إلى:
# Mobile-First Operational Distribution OS

أي:
- يتصرف كأبلكيشن موبايل
- يقرأ الهوية التشغيلية بشكل صحيح
- يحافظ على استقرار الجلسة
- يثبت التسعير والشرائح
- يربط الفواتير بالـ snapshot الصحيح
- يختصر التنقل في حسابي
- يترك dashboard للعمل التشغيلي فقط
- يتيح للمندوب والمشرف والمدير نفس النواة مع سياقات مختلفة

هذه هي النسخة النهائية التي يجب أن ينفذها OpenCode فوق الكود الحالي بدون كسر ما هو موجود.

