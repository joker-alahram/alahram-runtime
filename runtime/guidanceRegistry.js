export const GUIDANCE_MAP = {
  STALE_TIER: {
    severity: 'blocking',
    title: 'تغيرت الشريحة السعرية',
    description: 'تم تغيير الشريحة السعرية أو بيانات الجلسة. يجب إعادة مراجعة الأسعار قبل إرسال الطلب.',
    actions: [
      { type: 'rerender', label: 'إعادة حساب السلة', icon: '🔄', target: '#checkout' },
      { type: 'navigate', label: 'العودة للسلة', icon: '←', target: '#cart' },
    ],
  },
  INVALID_CART: {
    severity: 'blocking',
    title: 'السلة تحتوي على أخطاء',
    description: 'بعض الأصناف في السلة غير متاحة أو تغيرت. الرجاء مراجعة السلة.',
    actions: [
      { type: 'navigate', label: 'مراجعة السلة', icon: '←', target: '#cart' },
    ],
  },
  PRODUCT_MISSING: {
    severity: 'blocking',
    title: 'المنتج غير متاح',
    description: 'هذا المنتج لم يعد متاحاً في النظام. قد يكون تم إيقافه أو حذفه.',
    actions: [
      { type: 'navigate', label: 'فتح السلة', icon: '←', target: '#cart' },
      { type: 'navigate', label: 'تصفح المنتجات', icon: '🛍️', target: '#products' },
    ],
  },
  UNIT_MISSING: {
    severity: 'blocking',
    title: 'الوحدة غير متاحة',
    description: 'وحدة القياس المحددة لهذا المنتج لم تعد متاحة.',
    actions: [
      { type: 'navigate', label: 'فتح تفاصيل المنتج', icon: '🔍', target: '#product/{item_id}' },
      { type: 'navigate', label: 'العودة للسلة', icon: '←', target: '#cart' },
    ],
  },
  PRICE_MISSING: {
    severity: 'blocking',
    title: 'السعر غير متوفر',
    description: 'هذا المنتج لا يملك سعراً صالحاً للشريحة السعرية الحالية.',
    actions: [
      { type: 'navigate', label: 'فتح تفاصيل المنتج', icon: '🔍', target: '#product/{item_id}' },
      { type: 'navigate', label: 'العودة للسلة', icon: '←', target: '#cart' },
    ],
  },
  OUT_OF_STOCK: {
    severity: 'blocking',
    title: 'المخزون غير كافٍ',
    description: 'الكمية المطلوبة ({current_qty}) أكبر من المخزون الحالي ({available}).',
    actions: [
      { type: 'navigate', label: 'تعديل الكمية', icon: '✏️', target: '#cart' },
      { type: 'navigate', label: 'فتح المنتج', icon: '🔍', target: '#product/{item_id}' },
    ],
  },
  SESSION_EXPIRED: {
    severity: 'critical',
    title: 'انتهت الجلسة',
    description: 'انتهت صلاحية الجلسة الحالية. تم حفظ مسودة الطلب. الرجاء تسجيل الدخول مرة أخرى للمتابعة.',
    actions: [
      { type: 'relogin', label: 'تسجيل الدخول', icon: '🔑', target: '#login' },
    ],
  },
  WHATSAPP_BLOCKED: {
    severity: 'warning',
    title: 'تم منع النافذة المنبثقة',
    description: 'المتصفح منع فتح نافذة واتساب. الرجاء السماح للنوافذ المنبثقة من إعدادات المتصفح.',
    actions: [
      { type: 'retry', label: 'إعادة فتح واتساب', icon: '📱' },
    ],
  },
  WHATSAPP_UNCONFIGURED: {
    severity: 'blocking',
    title: 'رقم واتساب غير مهيأ',
    description: 'لم يتم تكوين رقم واتساب للدعم في إعدادات النظام. الرجاء التواصل مع مسؤول النظام.',
    actions: [],
  },
  CHECKOUT_LOCKED: {
    severity: 'info',
    title: 'جاري الإرسال',
    description: 'يوجد طلب قيد الإرسال حالياً. الرجاء الانتظار.',
    actions: [],
  },
  NETWORK_ERROR: {
    severity: 'warning',
    title: 'خطأ في الاتصال',
    description: 'تعذر الاتصال بالخادم. الرجاء التحقق من اتصال الإنترنت والمحاولة مرة أخرى.',
    actions: [
      { type: 'retry', label: 'إعادة المحاولة', icon: '🔄' },
    ],
  },
  ORDER_CREATED: {
    severity: 'success',
    title: 'تم إنشاء الفاتورة',
    description: 'تم إنشاء الفاتورة بنجاح وجاري فتح واتساب لإتمام الإرسال.',
    actions: [
      { type: 'navigate', label: 'عرض الفاتورة', icon: '📄', target: '#invoice/{order_id}' },
    ],
  },
  ORDER_UPDATED: {
    severity: 'success',
    title: 'تم تحديث الفاتورة',
    description: 'تم تحديث الفاتورة بنجاح وجاري فتح واتساب لإرسال الإشعار.',
    actions: [
      { type: 'navigate', label: 'عرض الفاتورة', icon: '📄', target: '#invoice/{order_id}' },
    ],
  },
  GENERIC_ERROR: {
    severity: 'blocking',
    title: 'حدث خطأ غير متوقع',
    description: 'حدث خطأ أثناء تنفيذ العملية. الرجاء المحاولة مرة أخرى.',
    actions: [
      { type: 'retry', label: 'إعادة المحاولة', icon: '🔄' },
      { type: 'navigate', label: 'العودة للرئيسية', icon: '←', target: '#home' },
    ],
  },
};
