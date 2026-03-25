import crypto from 'node:crypto';
import { parseBody, json, normalizePhone, slugify } from '../utils/core.js';
import { getDeliveryGroupByKey, getDeliveryGroupList, getDeliveryZoneById } from './delivery.service.js';
import { getBotRoots, getItemExtras, getItemsForRoot, getMenuItemById } from './menu.service.js';
import {
  createOrder,
  generateNextOrderCode,
  getConversationSession,
  getCustomerProfileSummary,
  getLatestOpenOrderByPhone,
  getOrderById,
  getOrderItems,
  getOrdersByStatus,
  replaceOrder,
  saveIncomingMessage,
  saveOutgoingMessage,
  setConversationSession,
  updateOrderStatus,
  upsertCustomer
} from './storage.service.js';

const BUTTON_IDS = {
  AR: 'lang_ar',
  EN: 'lang_en',
  HUMAN: 'human_agent',
  CONSENT_YES: 'consent_marketing_opt_in',
  CONSENT_SERVICE_ONLY: 'consent_service_only',
  CONSENT_NO: 'consent_no',
  START_ORDER: 'start_order',
  TRACK_ORDER: 'track_order',
  SHOW_MENU: 'show_menu',
  EXIT: 'exit_flow',
  ADD_MORE: 'cart_add_more',
  CHECKOUT: 'cart_checkout',
  CLEAR_CART: 'cart_clear',
  DELIVERY: 'delivery_delivery',
  PICKUP: 'delivery_pickup',
  PAY_CASH: 'pay_cash',
  NOTES_SKIP: 'notes_skip',
  NOTES_ADD: 'notes_add',
  CUSTOMER_CONFIRM: 'cust_confirm',
  CUSTOMER_EDIT: 'cust_edit',
  CUSTOMER_EXIT: 'cust_exit',
  EDIT_ITEMS: 'edit_items',
  EDIT_SCHEDULE: 'edit_schedule',
  EDIT_ZONE: 'edit_zone',
  EDIT_NOTES: 'edit_notes',
  ADMIN_APPROVE: 'admin_approve',
  ADMIN_MODIFY: 'admin_modify',
  ADMIN_REJECT: 'admin_reject',
  ADMIN_PREPARING: 'admin_preparing',
  ADMIN_READY: 'admin_ready',
  ADMIN_OUT: 'admin_out',
  ADMIN_DELIVERED: 'admin_delivered'
};

const TERMINAL_STATUSES = ['delivered', 'cancelled', 'rejected', 'customer_exit'];
const TRACK_TERMS = /(حالة|متابعة|وين|جاهز|وصل|طلبي|tracking|track|status)/i;

function getSafeHost(req) {
  return req?.headers?.host || process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:10000';
}

export function whatsappVerify(req, res) {
  const url = new URL(req?.url || '/api/webhooks/whatsapp', `http://${getSafeHost(req)}`);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';

  if (mode === 'subscribe' && token && token === verifyToken) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(challenge);
  }

  return json(res, 403, { ok: false, message: 'فشل التحقق من Webhook.' });
}

function getBaseUrl(config, req) {
  return process.env.BASE_URL || config?.site?.baseUrl || `https://${getSafeHost(req)}`;
}

function buildTextLinks(config, req) {
  const baseUrl = getBaseUrl(config, req);
  return {
    menuUrl: `${baseUrl}/menu.html`,
    orderUrl: `${baseUrl}/order.html`,
    trackUrl: `${baseUrl}/track.html`,
    phone: process.env.WHATSAPP_HUMAN_ESCALATION_NUMBER || config.site.businessPhoneDisplay
  };
}

function getAdminNumbers(config = {}) {
  const raw = process.env.ADMIN_NUMBERS || (config.adminPhones || []).join(',');
  return raw
    .split(/[;,\s]+/)
    .map(part => normalizePhone(part))
    .filter(Boolean)
    .map(part => part.replace(/^\+/, ''));
}

function isAdminPhone(phone, config) {
  const normalized = normalizePhone(phone).replace(/^\+/, '');
  return getAdminNumbers(config).includes(normalized);
}

function nowIso() {
  return new Date().toISOString();
}

function logWebhook(event, payload = {}) {
  console.info(event, JSON.stringify(payload));
}

function money(value) {
  return `${Number(value || 0).toFixed(3)} د.أ`;
}

function labelFromStatus(status) {
  return {
    awaiting_admin_review: 'بانتظار اعتماد الإدارة',
    awaiting_customer_edit: 'بانتظار تعديلك',
    approved: 'تم اعتماد الطلب',
    preparing: 'قيد التحضير',
    ready: 'طلبك جاهز',
    out_for_delivery: 'قيد التوصيل',
    delivered: 'تم التسليم',
    rejected: 'لم يتم اعتماد الطلب',
    customer_exit: 'تم إغلاق الطلب'
  }[status] || 'قيد المتابعة';
}

function mapPrepStatusToCustomer(status, orderId, notes = '') {
  if (status === 'approved') {
    return `تم اعتماد طلبك ✅\nرقم الطلب: ${orderId}\nطريقة الدفع: الدفع عند الاستلام - كاش\nسنوافيك بتحديثات الطلب حتى التسليم.`;
  }
  if (status === 'awaiting_customer_edit') {
    return `طلبك يحتاج تعديلًا بسيطًا قبل الاعتماد 🌿\nسنرتب معك التعديل الآن حتى نثبّته بالشكل الصحيح.${notes ? `\n\nملاحظة الإدارة: ${notes}` : ''}`;
  }
  if (status === 'rejected') {
    return `نعتذر منك، لم يتم اعتماد الطلب الحالي. إذا رغبت نعيد ترتيبه معك أو نحولك مباشرة لموظف.${notes ? `\n\n${notes}` : ''}`;
  }
  if (status === 'preparing') return `طلبك الآن قيد التحضير 👨‍🍳\nرقم الطلب: ${orderId}`;
  if (status === 'ready') return `طلبك أصبح جاهزًا ✅\nرقم الطلب: ${orderId}`;
  if (status === 'out_for_delivery') return `طلبك قيد التوصيل الآن 🚚\nرقم الطلب: ${orderId}`;
  if (status === 'delivered') return `تم تسليم طلبك بنجاح ✅\nنتمنى لك وجبة هنيّة ونسعد بتقييمك بعد التجربة.`;
  return `حالة طلبك الحالية: ${labelFromStatus(status)}\nرقم الطلب: ${orderId}`;
}

function shortButton(title) {
  return String(title).slice(0, 20);
}

function readIncomingSelection(message, rootDir = '') {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    return message.interactive.button_reply?.id || '';
  }
  if (message.type === 'interactive' && message.interactive?.type === 'list_reply') {
    return message.interactive.list_reply?.id || '';
  }

  const text = String(message.text?.body || '').trim();
  const simple = text.replace(/🌿|✅|🚚|👨‍🍳/g, '').trim();

  const map = {
    العربية: BUTTON_IDS.AR,
    english: BUTTON_IDS.EN,
    أوافق: BUTTON_IDS.CONSENT_YES,
    'خدمة فقط': BUTTON_IDS.CONSENT_SERVICE_ONLY,
    'لا أوافق': BUTTON_IDS.CONSENT_NO,
    اطلب: BUTTON_IDS.START_ORDER,
    'ابدأ الطلب': BUTTON_IDS.START_ORDER,
    المنيو: BUTTON_IDS.SHOW_MENU,
    تتبع: BUTTON_IDS.TRACK_ORDER,
    موظف: BUTTON_IDS.HUMAN,
    'موظف مباشر': BUTTON_IDS.HUMAN,
    إضافة: BUTTON_IDS.ADD_MORE,
    متابعة: BUTTON_IDS.CHECKOUT,
    إلغاء: BUTTON_IDS.CLEAR_CART,
    توصيل: BUTTON_IDS.DELIVERY,
    استلام: BUTTON_IDS.PICKUP,
    كاش: BUTTON_IDS.PAY_CASH,
    ملاحظات: BUTTON_IDS.NOTES_ADD,
    'بدون ملاحظات': BUTTON_IDS.NOTES_SKIP,
    تأكيد: BUTTON_IDS.CUSTOMER_CONFIRM,
    تعديل: BUTTON_IDS.CUSTOMER_EDIT,
    خروج: BUTTON_IDS.CUSTOMER_EXIT,
    الأصناف: BUTTON_IDS.EDIT_ITEMS,
    الموعد: BUTTON_IDS.EDIT_SCHEDULE,
    المنطقة: BUTTON_IDS.EDIT_ZONE,
    الملاحظات: BUTTON_IDS.EDIT_NOTES
  };

  if (map[simple.toLowerCase()]) return map[simple.toLowerCase()];
  if (map[simple]) return map[simple];

  if (rootDir && simple) {
    const directItem = getMenuItemById(rootDir, simple);
    if (directItem) return `item:${directItem.record_id}`;
  }

  return '';
}

function buildLocationText(message) {
  const location = message.location;
  if (!location) return '';
  const { latitude, longitude, name, address } = location;
  const parts = [];
  if (name) parts.push(name);
  if (address) parts.push(address);
  if (latitude && longitude) parts.push(`https://maps.google.com/?q=${latitude},${longitude}`);
  return parts.join(' — ');
}

function defaultDraft() {
  return {
    rootId: null,
    meatType: null,
    statusFilter: null,
    categoryFilter: null,
    selectedItemId: null,
    deliveryType: 'delivery',
    deliveryDayLabel: null,
    deliveryDayIso: null,
    deliverySlot: null,
    sectorKey: null,
    sectorTitle: null,
    zoneId: null,
    zoneName: null,
    deliveryFeeJod: 0,
    address: null,
    paymentMethod: 'cash',
    notes: null,
    revisionOrderId: null
  };
}

function readSessionData(session) {
  const raw = session?.session_data || session?.sessionData || {};
  return {
    cart: Array.isArray(raw.cart) ? raw.cart : [],
    selectedSection: raw.selectedSection || null,
    itemPage: Number(raw.itemPage || 0),
    pendingItemId: raw.pendingItemId || null,
    awaiting: raw.awaiting || null,
    dayOptions: Array.isArray(raw.dayOptions) ? raw.dayOptions : [],
    lastPrompt: raw.lastPrompt || null,
    orderDraft: { ...defaultDraft(), ...(raw.orderDraft || {}) },
    lastOrderId: session?.last_order_id || raw.lastOrderId || null
  };
}

function mergeSessionData(session, patch = {}) {
  const current = readSessionData(session);
  return {
    cart: patch.cart !== undefined ? patch.cart : current.cart,
    selectedSection: patch.selectedSection !== undefined ? patch.selectedSection : current.selectedSection,
    itemPage: patch.itemPage !== undefined ? patch.itemPage : current.itemPage,
    pendingItemId: patch.pendingItemId !== undefined ? patch.pendingItemId : current.pendingItemId,
    awaiting: patch.awaiting !== undefined ? patch.awaiting : current.awaiting,
    dayOptions: patch.dayOptions !== undefined ? patch.dayOptions : current.dayOptions,
    lastPrompt: patch.lastPrompt !== undefined ? patch.lastPrompt : current.lastPrompt,
    lastOrderId: patch.lastOrderId !== undefined ? patch.lastOrderId : current.lastOrderId,
    orderDraft: {
      ...current.orderDraft,
      ...(patch.orderDraft || {})
    }
  };
}

async function persistSession(rootDir, phone, session, patch = {}) {
  const mergedData = mergeSessionData(session, patch.sessionData || {});
  return setConversationSession(rootDir, phone, {
    currentState: patch.currentState || patch.current_state || session?.current_state || 'welcome',
    preferredLanguage: patch.preferredLanguage || patch.preferred_language || session?.preferred_language || 'ar',
    consentStatus: patch.consentStatus || patch.consent_status || session?.consent_status || 'pending',
    lastMenuSection: patch.lastMenuSection || patch.last_menu_section || mergedData.selectedSection || session?.last_menu_section || null,
    lastOrderId: patch.lastOrderId || patch.last_order_id || mergedData.lastOrderId || session?.last_order_id || null,
    sessionData: mergedData
  });
}

function welcomeButtons(returning = false, language = 'ar') {
  const body = returning
    ? 'يسعدنا تواصلك معنا من جديد 🌿\nنرتب لك طلبك بسرعة ونحفظ لك المتابعة من رقمك مباشرة. اختر اللغة أو اطلب موظفًا.'
    : 'أهلًا وسهلًا بك في مطبخ اليوم المركزي 🌿\nأكلات بيتية محلية بطعم أصيل وجودة تليق بذوقك. اختر اللغة أو اطلب المساعدة من موظف مباشر.';

  return {
    type: 'button',
    body,
    buttons: [
      { id: BUTTON_IDS.AR, title: language === 'en' ? 'Arabic' : 'العربية' },
      { id: BUTTON_IDS.EN, title: 'English' },
      { id: BUTTON_IDS.HUMAN, title: language === 'en' ? 'Agent' : 'موظف' }
    ]
  };
}

function consentButtons(language = 'ar') {
  return {
    type: 'button',
    body: language === 'en'
      ? 'Before we continue, do you agree to receive offers and service updates related to your orders?'
      : 'قبل المتابعة 🌿\nنستخدم بيانات المحادثة لتحسين الخدمة وتنظيم الطلبات. هل توافقون على استقبال العروض والتحديثات المرتبطة بالخدمة؟',
    buttons: [
      { id: BUTTON_IDS.CONSENT_YES, title: language === 'en' ? 'Agree' : 'أوافق' },
      { id: BUTTON_IDS.CONSENT_SERVICE_ONLY, title: language === 'en' ? 'Service only' : 'خدمة فقط' },
      { id: BUTTON_IDS.CONSENT_NO, title: language === 'en' ? 'No' : 'لا أوافق' }
    ]
  };
}

function mainMenuButtons(language = 'ar') {
  return {
    type: 'button',
    body: language === 'en'
      ? 'Welcome 🌿 Choose the path that fits you and we will continue step by step.'
      : 'كيف يمكننا خدمتك اليوم؟ اختر المسار المناسب وسنكمل معك خطوة بخطوة 🌿',
    buttons: [
      { id: BUTTON_IDS.START_ORDER, title: language === 'en' ? 'Order' : 'اطلب' },
      { id: BUTTON_IDS.SHOW_MENU, title: language === 'en' ? 'Menu' : 'المنيو' },
      { id: BUTTON_IDS.TRACK_ORDER, title: language === 'en' ? 'Track' : 'تتبع' }
    ]
  };
}

function rootList(rootDir, page = 0) {
  const roots = getBotRoots(rootDir);
  const pageSize = 10;
  const start = page * pageSize;
  const subset = roots.slice(start, start + pageSize);
  const rows = subset.map(root => ({
    id: `root:${root.id}`,
    title: shortButton(root.title),
    description: `${root.count} صنف`
  }));

  if (start + pageSize < roots.length) {
    rows.push({ id: `roots_page:${page + 1}`, title: 'المزيد', description: 'عرض أقسام إضافية' });
  }

  return {
    type: 'list',
    body: 'تفضل منيو مطبخ اليوم المركزي 🌿\nاختر القسم المناسب، وبعدها نرتب لك الطلب خطوة بخطوة.',
    buttonText: 'اختيار القسم',
    sections: [{ title: 'الأقسام', rows }]
  };
}

function meatTypeButtons(rootTitle = 'الأطباق') {
  return {
    type: 'button',
    body: `اختر نوع اللحم في ${rootTitle} 🌿`,
    buttons: [
      { id: 'meat:بلدي', title: 'بلدي' },
      { id: 'meat:روماني', title: 'روماني' },
      { id: BUTTON_IDS.EXIT, title: 'خروج' }
    ]
  };
}

function statusButtons() {
  return {
    type: 'button',
    body: 'حدد حالة الصنف المطلوبة 🌿',
    buttons: [
      { id: 'state:مطبوخ', title: 'مطبوخ' },
      { id: 'state:جاهز للطبخ', title: 'جاهز للطبخ' },
      { id: 'state:مفرز', title: 'مفرز' }
    ]
  };
}

function itemList(rootDir, filters = {}, page = 0) {
  const items = getItemsForRoot(rootDir, filters);
  const pageSize = 10;
  const start = page * pageSize;
  const subset = items.slice(start, start + pageSize);
  const rows = subset.map(item => ({
    id: `item:${item.record_id}`,
    title: shortButton(item.display_name_ar || item.item_name_ar),
    description: `${money(item.price_1_jod)} — ${item.unit_ar}`
  }));

  if (start + pageSize < items.length) {
    rows.push({ id: `items_page:${page + 1}`, title: 'المزيد', description: 'عرض أصناف إضافية' });
  }

  return {
    type: 'list',
    body: 'اختر الصنف المناسب، وبعدها ننتقل للكمية والإضافات 🌿',
    buttonText: 'اختيار الصنف',
    sections: [{ title: 'الأصناف', rows }]
  };
}

function quantityButtons(item) {
  return {
    type: 'button',
    body: `اختر الكمية المطلوبة من ${item.display_name_ar || item.item_name_ar}.\nالسعر للوحدة: ${money(item.price_1_jod)}`,
    buttons: [
      { id: `qty:${item.record_id}:1`, title: `1 × ${shortButton(item.unit_ar)}` },
      { id: `qty:${item.record_id}:2`, title: `2 × ${shortButton(item.unit_ar)}` },
      { id: `qty:${item.record_id}:3`, title: `3 × ${shortButton(item.unit_ar)}` }
    ]
  };
}

function extrasButtons(item, extras = []) {
  const rows = extras.map(extra => ({
    id: `extra:${item.record_id}:${slugify(extra.label)}`,
    title: shortButton(extra.label),
    description: `${money(extra.price || 0)}`
  }));

  rows.push({ id: BUTTON_IDS.ADD_MORE, title: 'إضافة', description: 'بدون إضافات جديدة' });

  return {
    type: 'list',
    body: `يمكنك إضافة خيارات مرتبطة بـ ${item.display_name_ar || item.item_name_ar} 🌿`,
    buttonText: 'الإضافات',
    sections: [{ title: 'إضافات', rows }]
  };
}

function cartSummary(cart = [], draft = {}) {
  const lines = (cart || []).map((item, index) => `${index + 1}. ${item.displayNameAr} × ${item.quantity} = ${money(item.lineTotalJod)}`);
  const subtotal = (cart || []).reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = Number(draft.deliveryFeeJod || 0);
  const total = subtotal + deliveryFee;

  return {
    subtotal,
    deliveryFee,
    total,
    text: `هذا ملخص طلبك 🌿\n\n${lines.join('\n') || 'لا توجد أصناف'}\n\n${deliveryFee ? `رسوم التوصيل: ${money(deliveryFee)}\n` : ''}الإجمالي الحالي: ${money(total)}\n\nإذا كان كل شيء مناسبًا اضغط: متابعة`
  };
}

function cartButtons(summaryText) {
  return {
    type: 'button',
    body: summaryText,
    buttons: [
      { id: BUTTON_IDS.ADD_MORE, title: 'إضافة' },
      { id: BUTTON_IDS.CHECKOUT, title: 'متابعة' },
      { id: BUTTON_IDS.CLEAR_CART, title: 'إلغاء' }
    ]
  };
}

function dayList() {
  const base = new Date();
  const rows = [];

  for (let i = 0; i < 5; i += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    const label =
      i === 0
        ? 'اليوم'
        : i === 1
          ? 'غدًا'
          : date.toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'numeric' });

    rows.push({
      id: `day:${date.toISOString().slice(0, 10)}:${label}`,
      title: shortButton(label),
      description: date.toISOString().slice(0, 10)
    });
  }

  return {
    type: 'list',
    body: 'اختر يوم التنفيذ أو التوصيل المناسب 🌿',
    buttonText: 'اختيار اليوم',
    sections: [{ title: 'الأيام', rows }]
  };
}

function slotList(config) {
  const slots = config.orderWindow?.deliveryTimeSlots || [];
  return {
    type: 'list',
    body: 'اختر الوقت المناسب وسنكمل مباشرة 🌿',
    buttonText: 'اختيار الوقت',
    sections: [{
      title: 'أوقات التوصيل',
      rows: slots.map(slot => ({
        id: `slot:${slot}`,
        title: shortButton(slot),
        description: 'موعد التوصيل'
      }))
    }]
  };
}

function deliveryTypeButtons() {
  return {
    type: 'button',
    body: 'حدد طريقة الاستلام المناسبة لطلبك 🌿',
    buttons: [
      { id: BUTTON_IDS.DELIVERY, title: 'توصيل' },
      { id: BUTTON_IDS.PICKUP, title: 'استلام' },
      { id: BUTTON_IDS.HUMAN, title: 'موظف' }
    ]
  };
}

function sectorList(rootDir) {
  const groups = getDeliveryGroupList(rootDir);
  return {
    type: 'list',
    body: 'اختر المحافظة أو القطاع أولًا 🌿',
    buttonText: 'اختيار القطاع',
    sections: [{
      title: 'القطاعات',
      rows: groups.slice(0, 10).map(group => ({
        id: `sector:${group.key}:0`,
        title: shortButton(group.group),
        description: `${group.zones.length} منطقة`
      }))
    }]
  };
}

function zoneList(rootDir, sectorKey, page = 0) {
  const group = getDeliveryGroupByKey(rootDir, sectorKey);
  const zones = group?.zones || [];
  const pageSize = 10;
  const start = page * pageSize;
  const subset = zones.slice(start, start + pageSize);
  const rows = subset.map(zone => ({
    id: `zone:${zone.zone_id}`,
    title: shortButton(zone.zone_name_ar),
    description: `رسوم ${money(zone.delivery_fee_jod)}`
  }));

  if (start + pageSize < zones.length) {
    rows.push({ id: `sector:${sectorKey}:${page + 1}`, title: 'المزيد', description: 'عرض مناطق إضافية' });
  }

  return {
    type: 'list',
    body: `اختر المنطقة داخل ${group?.group || 'القطاع'} 🌿`,
    buttonText: 'اختيار المنطقة',
    sections: [{ title: group?.group || 'المناطق', rows }]
  };
}

function paymentButtons() {
  return {
    type: 'button',
    body: 'اختر طريقة الدفع المناسبة 🌿',
    buttons: [
      { id: BUTTON_IDS.PAY_CASH, title: 'كاش' },
      { id: BUTTON_IDS.HUMAN, title: 'موظف' },
      { id: BUTTON_IDS.EXIT, title: 'خروج' }
    ]
  };
}

function notesButtons() {
  return {
    type: 'button',
    body: 'هل لديك ملاحظات إضافية على الطلب؟',
    buttons: [
      { id: BUTTON_IDS.NOTES_ADD, title: 'ملاحظات' },
      { id: BUTTON_IDS.NOTES_SKIP, title: 'بدون ملاحظات' },
      { id: BUTTON_IDS.EXIT, title: 'خروج' }
    ]
  };
}

function buildCustomerFinalSummary(cart = [], draft = {}) {
  const summary = cartSummary(cart, draft);
  const lines = [
    'ملخصك النهائي 🌿',
    '',
    ...((cart || []).map((item, index) => `${index + 1}. ${item.displayNameAr} × ${item.quantity} = ${money(item.lineTotalJod)}`)),
    '',
    `اليوم: ${draft.deliveryDayLabel || 'غير محدد'}`,
    `الوقت: ${draft.deliverySlot || 'غير محدد'}`,
    `الاستلام: ${draft.deliveryType === 'pickup' ? 'استلام' : 'توصيل'}`,
    draft.sectorTitle ? `القطاع: ${draft.sectorTitle}` : null,
    draft.zoneName ? `المنطقة: ${draft.zoneName}` : null,
    draft.address ? `العنوان: ${draft.address}` : null,
    `الدفع: ${draft.paymentMethod === 'cash' ? 'كاش عند الاستلام' : draft.paymentMethod}`,
    draft.notes ? `الملاحظات: ${draft.notes}` : 'الملاحظات: بدون ملاحظات',
    draft.deliveryFeeJod ? `رسوم التوصيل: ${money(draft.deliveryFeeJod)}` : null,
    `الإجمالي النهائي: ${money(summary.total)}`
  ].filter(Boolean);

  return lines.join('\n');
}

function customerSummaryButtons(summaryText) {
  return {
    type: 'button',
    body: summaryText,
    buttons: [
      { id: BUTTON_IDS.CUSTOMER_CONFIRM, title: 'تأكيد' },
      { id: BUTTON_IDS.CUSTOMER_EDIT, title: 'تعديل' },
      { id: BUTTON_IDS.CUSTOMER_EXIT, title: 'خروج' }
    ]
  };
}

function editList() {
  return {
    type: 'list',
    body: 'اختر الجزء الذي تريد تعديله 🌿',
    buttonText: 'اختيار التعديل',
    sections: [{
      title: 'التعديل',
      rows: [
        { id: BUTTON_IDS.EDIT_ITEMS, title: 'الأصناف', description: 'إضافة أو تعديل الأصناف' },
        { id: BUTTON_IDS.EDIT_SCHEDULE, title: 'الموعد', description: 'تعديل اليوم أو الوقت' },
        { id: BUTTON_IDS.EDIT_ZONE, title: 'المنطقة', description: 'تعديل المنطقة والعنوان' },
        { id: BUTTON_IDS.EDIT_NOTES, title: 'الملاحظات', description: 'تعديل الملاحظات' }
      ]
    }]
  };
}

function adminOrderSummary(order, items = []) {
  const lines = items.map((item, index) => `${index + 1}. ${item.display_name_ar} × ${item.quantity} = ${money(item.line_total_jod)}`);
  return [
    'طلب جديد يحتاج اعتماد 🌿',
    `رقم الطلب: ${order.id}`,
    `العميل: ${order.customer_name || 'غير مسجل'}`,
    `الهاتف: ${order.phone}`,
    '',
    ...lines,
    '',
    `الإجمالي: ${money(order.total_jod)}`,
    order.delivery_slot ? `الموعد: ${order.delivery_slot}` : null,
    order.address_text ? `العنوان: ${order.address_text}` : null,
    order.order_notes ? `الملاحظات: ${order.order_notes}` : null
  ].filter(Boolean).join('\n');
}

function adminDecisionButtons(orderId) {
  return {
    type: 'button',
    body: `إدارة الطلب ${orderId}`,
    buttons: [
      { id: `${BUTTON_IDS.ADMIN_APPROVE}:${orderId}`, title: 'موافقة' },
      { id: `${BUTTON_IDS.ADMIN_MODIFY}:${orderId}`, title: 'تعديل' },
      { id: `${BUTTON_IDS.ADMIN_REJECT}:${orderId}`, title: 'رفض' }
    ]
  };
}

function adminOpsButtons(orderId) {
  return {
    type: 'button',
    body: `تحديث حالة الطلب ${orderId}`,
    buttons: [
      { id: `${BUTTON_IDS.ADMIN_PREPARING}:${orderId}`, title: 'تحضير' },
      { id: `${BUTTON_IDS.ADMIN_READY}:${orderId}`, title: 'جاهز' },
      { id: `${BUTTON_IDS.ADMIN_OUT}:${orderId}`, title: 'توصيل' }
    ]
  };
}

function textIntent(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return 'empty';
  if (/^(مرحبا|السلام عليكم|اهلا|أهلا|hello|hi)$/i.test(normalized)) return 'welcome';
  if (TRACK_TERMS.test(normalized)) return 'track';
  return 'text';
}

async function sendWhatsAppPayload(to, payload) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return { skipped: true, reason: 'بيانات WhatsApp API غير مضبوطة.' };
  }

  const requestBody = JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    ...payload
  });

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json',
      'Accept-Charset': 'utf-8',
      Authorization: `Bearer ${accessToken}`
    },
    body: Buffer.from(requestBody, 'utf8')
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function sendWhatsAppText(rootDir, to, body) {
  const result = await sendWhatsAppPayload(to, { type: 'text', text: { body } });
  logWebhook('OUTGOING_TEXT', { to, status: result.status || null, body });

  try {
    await saveOutgoingMessage(rootDir, {
      id: crypto.randomUUID(),
      phone: to,
      message_type: 'text',
      content: body,
      raw_payload: result.data || null
    });
  } catch (error) {
    console.error('MESSAGES_LOG_SUPABASE_ERROR', error);
  }

  return result;
}

async function sendWhatsAppInteractive(rootDir, to, interactive) {
  const payload = { type: 'interactive', interactive };
  const result = await sendWhatsAppPayload(to, payload);
  logWebhook('OUTGOING_INTERACTIVE', {
    to,
    status: result.status || null,
    type: interactive.type,
    body: interactive.body?.text || interactive.body
  });

  try {
    await saveOutgoingMessage(rootDir, {
      id: crypto.randomUUID(),
      phone: to,
      message_type: `interactive_${interactive.type}`,
      content: interactive.body?.text || interactive.body || '',
      raw_payload: result.data || null
    });
  } catch (error) {
    console.error('MESSAGES_LOG_SUPABASE_ERROR', error);
  }

  return result;
}

async function notifyAdminsNewOrder(rootDir, order, config) {
  const items = await getOrderItems(rootDir, order.id);
  const admins = getAdminNumbers(config);
  const summary = adminOrderSummary(order, items);

  for (const adminPhone of admins) {
    await sendWhatsAppInteractive(rootDir, adminPhone, adminDecisionButtons(order.id));
    await sendWhatsAppText(rootDir, adminPhone, summary);
  }
}

async function createOrUpdateOrderFromDraft(rootDir, phone, session) {
  const sessionData = readSessionData(session);
  const draft = sessionData.orderDraft || defaultDraft();
  const cart = sessionData.cart || [];

  if (!cart.length) return { error: 'لا يوجد أي صنف داخل الطلب حاليًا.' };
  if (!draft.deliveryDayIso || !draft.deliverySlot) return { error: 'اليوم أو الوقت غير محدد.' };
  if (draft.deliveryType === 'delivery' && (!draft.zoneId || !draft.address)) return { error: 'المنطقة أو العنوان غير مكتمل.' };

  const customer = await upsertCustomer(rootDir, {
    phone,
    preferred_language: session?.preferred_language || 'ar',
    consent_status: session?.consent_status || 'pending'
  });

  let orderId = sessionData.lastOrderId;
  let existingOrder = null;

  if (draft.revisionOrderId) {
    existingOrder = await getOrderById(rootDir, draft.revisionOrderId);
    orderId = existingOrder?.id || draft.revisionOrderId;
  }

  if (!orderId) orderId = await generateNextOrderCode(rootDir, 'MAE');

  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = Number(draft.deliveryType === 'delivery' ? draft.deliveryFeeJod || 0 : 0);
  const total = subtotal + deliveryFee;

  const orderPayload = {
    id: orderId,
    customer_id: customer?.id || null,
    customer_name: customer?.full_name || null,
    phone,
    status: 'awaiting_admin_review',
    status_label_ar: 'بانتظار اعتماد الإدارة',
    delivery_type: draft.deliveryType || 'delivery',
    delivery_slot: `${draft.deliveryDayLabel || ''} — ${draft.deliverySlot || ''}`.trim(),
    payment_method: draft.paymentMethod || 'cash',
    payment_status: 'pending',
    address_text: draft.address || null,
    order_notes: draft.notes || null,
    admin_notes: null,
    subtotal_jod: subtotal,
    delivery_fee_jod: deliveryFee,
    total_jod: total,
    approved_by_phone: null,
    approved_at: null,
    items: cart.map(item => ({
      menu_item_id: item.id,
      display_name_ar: item.displayNameAr,
      quantity: item.quantity,
      unit_ar: item.unit_ar,
      unit_price_jod: item.price_1_jod,
      line_total_jod: item.lineTotalJod,
      notes: item.notes || null
    }))
  };

  const order = existingOrder
    ? await replaceOrder(rootDir, orderId, orderPayload)
    : await createOrder(rootDir, orderPayload);

  await persistSession(rootDir, phone, session, {
    currentState: 'awaiting_admin_review',
    lastOrderId: order.id,
    sessionData: {
      cart: [],
      selectedSection: null,
      itemPage: 0,
      pendingItemId: null,
      awaiting: null,
      dayOptions: [],
      lastPrompt: null,
      lastOrderId: order.id,
      orderDraft: { ...defaultDraft(), revisionOrderId: null }
    }
  });

  return { order };
}

async function handleAdminAction(rootDir, from, selection, config) {
  const [action, orderId] = selection.split(':');
  const order = await getOrderById(rootDir, orderId);

  if (!order) return { ok: false, message: 'تعذر العثور على الطلب المطلوب.' };

  if (action === BUTTON_IDS.ADMIN_APPROVE) {
    await updateOrderStatus(rootDir, orderId, {
      status: 'approved',
      status_label_ar: 'تم اعتماد الطلب',
      approved_by_phone: from,
      approved_at: nowIso()
    });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('approved', orderId));
    await sendWhatsAppInteractive(rootDir, from, adminOpsButtons(orderId));
    return { ok: true, message: 'تم اعتماد الطلب وإشعار العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_MODIFY) {
    const updated = await updateOrderStatus(rootDir, orderId, {
      status: 'awaiting_customer_edit',
      status_label_ar: 'بانتظار تعديل العميل',
      admin_notes: 'يرجى مراجعة تفاصيل الطلب مع العميل قبل الاعتماد.'
    });

    const session = await getConversationSession(rootDir, order.phone);
    await persistSession(rootDir, order.phone, session, {
      currentState: 'review_customer_summary',
      sessionData: {
        lastOrderId: orderId,
        orderDraft: { ...defaultDraft(), revisionOrderId: orderId }
      }
    });

    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('awaiting_customer_edit', orderId, updated?.admin_notes));
    return { ok: true, message: 'تم تحويل الطلب إلى تعديل العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_REJECT) {
    await updateOrderStatus(rootDir, orderId, {
      status: 'rejected',
      status_label_ar: 'مرفوض',
      admin_notes: 'اعتذار منكم، يمكن إعادة ترتيب الطلب من جديد.'
    });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('rejected', orderId));
    return { ok: true, message: 'تم رفض الطلب وإشعار العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_PREPARING) {
    await updateOrderStatus(rootDir, orderId, { status: 'preparing', status_label_ar: 'قيد التحضير' });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('preparing', orderId));
    return { ok: true, message: 'تم تحديث الطلب إلى قيد التحضير.' };
  }

  if (action === BUTTON_IDS.ADMIN_READY) {
    await updateOrderStatus(rootDir, orderId, { status: 'ready', status_label_ar: 'جاهز' });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('ready', orderId));
    return { ok: true, message: 'تم تحديث الطلب إلى جاهز.' };
  }

  if (action === BUTTON_IDS.ADMIN_OUT) {
    await updateOrderStatus(rootDir, orderId, { status: 'out_for_delivery', status_label_ar: 'قيد التوصيل' });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('out_for_delivery', orderId));
    await sendWhatsAppInteractive(rootDir, from, {
      type: 'button',
      body: `تأكيد إنهاء الطلب ${orderId}`,
      buttons: [{ id: `${BUTTON_IDS.ADMIN_DELIVERED}:${orderId}`, title: 'تم التسليم' }]
    });
    return { ok: true, message: 'تم تحديث الطلب إلى قيد التوصيل.' };
  }

  if (action === BUTTON_IDS.ADMIN_DELIVERED) {
    await updateOrderStatus(rootDir, orderId, { status: 'delivered', status_label_ar: 'تم التسليم' });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('delivered', orderId));
    return { ok: true, message: 'تم إغلاق الطلب على أنه تم التسليم.' };
  }

  return { ok: false, message: 'إجراء إداري غير معروف.' };
}

export async function processWhatsAppWebhook(rootDir, req, res, config) {
  try {
    const safeHost = getSafeHost(req);

    logWebhook('HTTP_WEBHOOK_REQUEST', {
      method: req?.method || 'POST',
      pathname: new URL(req?.url || '/api/webhooks/whatsapp', `http://${safeHost}`).pathname,
      time: nowIso()
    });

    const body = await parseBody(req);
    const value = body.entry?.[0]?.changes?.[0]?.value || body.value || {};
    const message = value.messages?.[0] || null;
    const status = value.statuses?.[0] || null;

    logWebhook('WEBHOOK_IN', {
      hasMessage: Boolean(message),
      hasStatuses: Boolean(status),
      from: message?.from || null,
      type: message?.type || null,
      messageId: message?.id || null,
      statusId: status?.id || null,
      statusType: status?.status || null
    });

    if (!message) {
      return json(res, 200, { ok: true, ignored: true });
    }

    const from = normalizePhone(message.from || '').replace(/^\+/, '');
    const to = normalizePhone(message.from || '').replace(/^\+/, '');
    const type = message.type;
    const text = type === 'text' ? String(message.text?.body || '').trim() : '';

    try {
      await saveIncomingMessage(rootDir, {
        id: message.id,
        phone: from,
        message_type: type,
        content: type === 'text' ? text : type === 'location' ? buildLocationText(message) : JSON.stringify(message),
        raw_payload: message
      });
    } catch (error) {
      console.error('MESSAGES_LOG_SUPABASE_ERROR', error);
    }

    if (isAdminPhone(from, config) && type === 'interactive') {
      const selection = readIncomingSelection(message, rootDir);
      if (
        selection.startsWith(BUTTON_IDS.ADMIN_APPROVE) ||
        selection.startsWith(BUTTON_IDS.ADMIN_MODIFY) ||
        selection.startsWith(BUTTON_IDS.ADMIN_REJECT) ||
        selection.startsWith(BUTTON_IDS.ADMIN_PREPARING) ||
        selection.startsWith(BUTTON_IDS.ADMIN_READY) ||
        selection.startsWith(BUTTON_IDS.ADMIN_OUT) ||
        selection.startsWith(BUTTON_IDS.ADMIN_DELIVERED)
      ) {
        const outcome = await handleAdminAction(rootDir, from, selection, config);
        const result = await sendWhatsAppText(rootDir, to, outcome.message);
        return json(res, 200, { ok: true, delivered: result, mode: 'admin_action' });
      }
    }

    if (isAdminPhone(from, config) && type === 'text') {
      const command = text.trim();

      if (command === '/pending') {
        const orders = await getOrdersByStatus(rootDir, 'awaiting_admin_review');
        const bodyText = orders.length
          ? ['طلبات بانتظار الاعتماد 🌿', '', ...orders.slice(0, 10).map(order => `${order.id} — ${order.phone} — ${money(order.total_jod)}`)].join('\n')
          : 'لا توجد طلبات بانتظار الاعتماد حاليًا.';

        const result = await sendWhatsAppText(rootDir, to, bodyText);
        return json(res, 200, { ok: true, delivered: result, mode: 'admin_pending' });
      }

      if (command.startsWith('/view ')) {
        const orderId = command.split(' ').slice(1).join(' ').trim();
        const order = await getOrderById(rootDir, orderId);

        if (!order) {
          const result = await sendWhatsAppText(rootDir, to, 'تعذر العثور على الطلب المطلوب.');
          return json(res, 200, { ok: true, delivered: result, mode: 'admin_view_missing' });
        }

        const items = await getOrderItems(rootDir, orderId);
        const summary = adminOrderSummary(order, items);
        await sendWhatsAppText(rootDir, to, summary);
        const result = await sendWhatsAppInteractive(rootDir, to, adminDecisionButtons(orderId));
        return json(res, 200, { ok: true, delivered: result, mode: 'admin_view' });
      }
    }

    let session = await getConversationSession(rootDir, from);
    let sessionData = readSessionData(session);
    let customerProfile = await getCustomerProfileSummary(rootDir, from);
    const openOrder = await getLatestOpenOrderByPhone(rootDir, from, TERMINAL_STATUSES);

    if (!session) {
      session = await persistSession(rootDir, from, null, {
        currentState: 'welcome',
        preferredLanguage: 'ar',
        consentStatus: 'pending',
        sessionData: { orderDraft: defaultDraft() }
      });
      sessionData = readSessionData(session);
      customerProfile = await getCustomerProfileSummary(rootDir, from);
    }

    const selection = readIncomingSelection(message, rootDir);
    const textMode = textIntent(text);

    if (openOrder && !selection && TRACK_TERMS.test(text)) {
      const result = await sendWhatsAppText(rootDir, to, mapPrepStatusToCustomer(openOrder.status, openOrder.id, openOrder.admin_notes || ''));
      return json(res, 200, { ok: true, delivered: result, mode: 'track_open_order' });
    }

    if (openOrder && !TERMINAL_STATUSES.includes(openOrder.status) && !selection && !TRACK_TERMS.test(text)) {
      const result = await sendWhatsAppText(
        rootDir,
        to,
        `لديك طلب قائم حاليًا 🌿\nرقم الطلب: ${openOrder.id}\nحالته: ${labelFromStatus(openOrder.status)}\nإذا رغبت بمتابعته أرسل: حالة طلبي`
      );
      return json(res, 200, { ok: true, delivered: result, mode: 'block_new_order' });
    }

    if (selection === BUTTON_IDS.HUMAN) {
      const links = buildTextLinks(config, req);
      const result = await sendWhatsAppText(rootDir, to, `يسعدنا خدمتك 🌿\nيمكنك التواصل مع موظف مباشر على الرقم: ${links.phone}`);
      return json(res, 200, { ok: true, delivered: result, mode: 'human' });
    }

    if (textMode === 'welcome' && (session.current_state === 'welcome' || !session.current_state)) {
      const result = await sendWhatsAppInteractive(rootDir, to, customerProfile.isReturning ? welcomeButtons(true) : welcomeButtons(false));
      return json(res, 200, { ok: true, delivered: result, mode: 'welcome' });
    }

    if (selection === BUTTON_IDS.AR || selection === BUTTON_IDS.EN) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_consent',
        preferredLanguage: selection === BUTTON_IDS.EN ? 'en' : 'ar'
      });
      const result = await sendWhatsAppInteractive(rootDir, to, consentButtons(selection === BUTTON_IDS.EN ? 'en' : 'ar'));
      return json(res, 200, { ok: true, delivered: result, mode: 'consent' });
    }

    if ([BUTTON_IDS.CONSENT_YES, BUTTON_IDS.CONSENT_SERVICE_ONLY, BUTTON_IDS.CONSENT_NO].includes(selection)) {
      const consentStatus =
        selection === BUTTON_IDS.CONSENT_YES
          ? 'marketing_opt_in'
          : selection === BUTTON_IDS.CONSENT_SERVICE_ONLY
            ? 'service_only'
            : 'declined';

      await upsertCustomer(rootDir, {
        phone: from,
        preferred_language: session?.preferred_language || 'ar',
        consent_status: consentStatus
      });

      session = await persistSession(rootDir, from, session, { currentState: 'main_menu', consentStatus });
      const result = await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(session?.preferred_language || 'ar'));
      return json(res, 200, { ok: true, delivered: result, mode: 'main_menu' });
    }

    if (selection === BUTTON_IDS.SHOW_MENU || selection === BUTTON_IDS.START_ORDER) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'menu_roots',
        sessionData: { lastPrompt: 'root' }
      });
      const result = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir));
      return json(res, 200, { ok: true, delivered: result, mode: 'menu_roots' });
    }

    if (selection === BUTTON_IDS.TRACK_ORDER || textMode === 'track') {
      const latest = await getLatestOpenOrderByPhone(rootDir, from, []);
      const result = latest
        ? await sendWhatsAppText(rootDir, to, mapPrepStatusToCustomer(latest.status, latest.id, latest.admin_notes || ''))
        : await sendWhatsAppText(rootDir, to, 'لا يوجد طلب مفتوح حاليًا على هذا الرقم 🌿');

      return json(res, 200, { ok: true, delivered: result, mode: 'track' });
    }

    if (selection.startsWith('roots_page:')) {
      const page = Number(selection.split(':')[1] || 0);
      const result = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, page));
      return json(res, 200, { ok: true, delivered: result, mode: 'roots_page' });
    }

    if (selection.startsWith('root:')) {
      const rootId = selection.split(':')[1];
      session = await persistSession(rootDir, from, session, {
        currentState: rootId === 'main_meat' ? 'awaiting_meat_type' : rootId === 'main_chicken' ? 'awaiting_status_filter' : 'awaiting_items',
        sessionData: {
          selectedSection: rootId,
          orderDraft: { rootId, meatType: null, statusFilter: null, categoryFilter: null },
          itemPage: 0,
          lastPrompt: rootId === 'main_meat' ? 'meat' : rootId === 'main_chicken' ? 'status' : 'items'
        }
      });

      if (rootId === 'main_meat') {
        const result = await sendWhatsAppInteractive(rootDir, to, meatTypeButtons('أطباق اللحوم'));
        return json(res, 200, { ok: true, delivered: result, mode: 'meat_type' });
      }

      if (rootId === 'main_chicken') {
        const result = await sendWhatsAppInteractive(rootDir, to, statusButtons());
        return json(res, 200, { ok: true, delivered: result, mode: 'status_filter' });
      }

      const result = await sendWhatsAppInteractive(rootDir, to, itemList(rootDir, { rootId }, 0));
      return json(res, 200, { ok: true, delivered: result, mode: 'items' });
    }

    if (selection.startsWith('meat:')) {
      const meatType = selection.split(':')[1];
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_status_filter',
        sessionData: { orderDraft: { meatType }, lastPrompt: 'status' }
      });
      const result = await sendWhatsAppInteractive(rootDir, to, statusButtons());
      return json(res, 200, { ok: true, delivered: result, mode: 'meat_selected' });
    }

    if (selection.startsWith('state:')) {
      const statusFilter = selection.split(':')[1];
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_items',
        sessionData: { orderDraft: { statusFilter }, itemPage: 0, lastPrompt: 'items' }
      });

      sessionData = readSessionData(session);
      const result = await sendWhatsAppInteractive(
        rootDir,
        to,
        itemList(
          rootDir,
          {
            rootId: sessionData.orderDraft.rootId,
            meatType: sessionData.orderDraft.meatType,
            statusFilter
          },
          0
        )
      );

      return json(res, 200, { ok: true, delivered: result, mode: 'status_selected' });
    }

    if (selection.startsWith('items_page:')) {
      const page = Number(selection.split(':')[1] || 0);
      sessionData = readSessionData(session);

      const result = await sendWhatsAppInteractive(
        rootDir,
        to,
        itemList(
          rootDir,
          {
            rootId: sessionData.orderDraft.rootId,
            meatType: sessionData.orderDraft.meatType,
            statusFilter: sessionData.orderDraft.statusFilter
          },
          page
        )
      );

      return json(res, 200, { ok: true, delivered: result, mode: 'items_page' });
    }

    if (selection.startsWith('item:')) {
      const itemId = selection.split(':')[1];
      const item = getMenuItemById(rootDir, itemId);

      if (!item) {
        const result = await sendWhatsAppText(rootDir, to, 'تعذر العثور على الصنف المطلوب. اختر من القائمة مرة أخرى.');
        return json(res, 200, { ok: true, delivered: result, mode: 'item_missing' });
      }

      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_quantity',
        sessionData: { pendingItemId: item.record_id, awaiting: 'quantity_text', lastPrompt: 'quantity' }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, quantityButtons(item));
      return json(res, 200, { ok: true, delivered: result, mode: 'quantity' });
    }

    if (selection.startsWith('qty:')) {
      const [, itemId, qtyRaw] = selection.split(':');
      const quantity = Number(qtyRaw || 1);
      const item = getMenuItemById(rootDir, itemId);

      if (!item) {
        const result = await sendWhatsAppText(rootDir, to, 'تعذر العثور على الصنف المطلوب.');
        return json(res, 200, { ok: true, delivered: result, mode: 'qty_item_missing' });
      }

      const newItem = {
        id: item.record_id,
        displayNameAr: item.display_name_ar || item.item_name_ar,
        unit_ar: item.unit_ar,
        price_1_jod: Number(item.price_1_jod || 0),
        quantity,
        lineTotalJod: Number(item.price_1_jod || 0) * quantity,
        notes: null
      };

      const cart = [...(sessionData.cart || []), newItem];
      const extras = getItemExtras(rootDir, item);

      session = await persistSession(rootDir, from, session, {
        currentState: extras.length ? 'awaiting_extra_choice' : 'reviewing_cart',
        sessionData: { cart, awaiting: extras.length ? 'extra_choice' : null }
      });

      const result = await sendWhatsAppInteractive(
        rootDir,
        to,
        extras.length ? extrasButtons(item, extras) : cartButtons(cartSummary(cart, sessionData.orderDraft).text)
      );

      return json(res, 200, { ok: true, delivered: result, mode: 'cart_after_qty' });
    }

    if (selection.startsWith('extra:')) {
      const [, itemId, extraSlug] = selection.split(':');
      const item = getMenuItemById(rootDir, itemId);
      const extras = getItemExtras(rootDir, item);
      const selectedExtra = extras.find(extra => slugify(extra.label) === extraSlug);
      const cart = [...(sessionData.cart || [])];
      const last = cart[cart.length - 1];

      if (last && selectedExtra) {
        last.notes = last.notes ? `${last.notes} + ${selectedExtra.label}` : selectedExtra.label;
        last.lineTotalJod = Number(last.lineTotalJod || 0) + Number(selectedExtra.price || 0);
      }

      session = await persistSession(rootDir, from, session, {
        currentState: 'reviewing_cart',
        sessionData: { cart, awaiting: null }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text));
      return json(res, 200, { ok: true, delivered: result, mode: 'extra_added' });
    }

    if (selection === BUTTON_IDS.CLEAR_CART) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'main_menu',
        sessionData: {
          cart: [],
          selectedSection: null,
          itemPage: 0,
          pendingItemId: null,
          awaiting: null,
          dayOptions: [],
          lastPrompt: null,
          orderDraft: defaultDraft()
        }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(session?.preferred_language || 'ar'));
      return json(res, 200, { ok: true, delivered: result, mode: 'cart_cleared' });
    }

    if (selection === BUTTON_IDS.ADD_MORE) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'menu_roots',
        sessionData: { lastPrompt: 'root', pendingItemId: null, awaiting: null }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir));
      return json(res, 200, { ok: true, delivered: result, mode: 'add_more' });
    }

    if (selection === BUTTON_IDS.CHECKOUT) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_day',
        sessionData: { lastPrompt: 'day' }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, dayList());
      return json(res, 200, { ok: true, delivered: result, mode: 'checkout_day' });
    }

    if (selection.startsWith('day:')) {
      const [, dayIso, label] = selection.split(':');
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_slot',
        sessionData: { orderDraft: { deliveryDayIso: dayIso, deliveryDayLabel: label }, lastPrompt: 'slot' }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, slotList(config));
      return json(res, 200, { ok: true, delivered: result, mode: 'slot_prompt' });
    }

    if (selection.startsWith('slot:')) {
      const slot = selection.split(':').slice(1).join(':');
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_delivery_type',
        sessionData: { orderDraft: { deliverySlot: slot }, lastPrompt: 'delivery_type' }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, deliveryTypeButtons());
      return json(res, 200, { ok: true, delivered: result, mode: 'delivery_type_prompt' });
    }

    if (selection === BUTTON_IDS.DELIVERY || selection === BUTTON_IDS.PICKUP) {
      const deliveryType = selection === BUTTON_IDS.PICKUP ? 'pickup' : 'delivery';
      session = await persistSession(rootDir, from, session, {
        currentState: deliveryType === 'pickup' ? 'awaiting_payment' : 'awaiting_sector',
        sessionData: { orderDraft: { deliveryType }, lastPrompt: deliveryType === 'pickup' ? 'payment' : 'sector' }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, deliveryType === 'pickup' ? paymentButtons() : sectorList(rootDir));
      return json(res, 200, { ok: true, delivered: result, mode: 'delivery_type_selected' });
    }

    if (selection.startsWith('sector:')) {
      const [, sectorKey, pageRaw] = selection.split(':');
      const page = Number(pageRaw || 0);
      const group = getDeliveryGroupByKey(rootDir, sectorKey);

      if (!group) {
        const result = await sendWhatsAppText(rootDir, to, 'تعذر العثور على هذا القطاع. اختر من جديد.');
        return json(res, 200, { ok: true, delivered: result, mode: 'sector_error' });
      }

      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_zone',
        sessionData: { orderDraft: { sectorKey, sectorTitle: group.group }, lastPrompt: 'zone' }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, zoneList(rootDir, sectorKey, page));
      return json(res, 200, { ok: true, delivered: result, mode: 'zone_prompt' });
    }

    if (selection.startsWith('zone:')) {
      const zoneId = selection.split(':')[1];
      const zone = getDeliveryZoneById(rootDir, zoneId);

      if (!zone) {
        const result = await sendWhatsAppText(rootDir, to, 'تعذر تحديد المنطقة المطلوبة. أعد الاختيار.');
        return json(res, 200, { ok: true, delivered: result, mode: 'zone_error' });
      }

      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_address',
        sessionData: {
          orderDraft: {
            zoneId: zone.zone_id,
            zoneName: zone.zone_name_ar,
            sectorTitle: `${zone.zone_type} — ${zone.sector_or_governorate}`,
            deliveryFeeJod: Number(zone.delivery_fee_jod || 0)
          },
          awaiting: 'address',
          lastPrompt: 'address'
        }
      });

      const result = await sendWhatsAppText(
        rootDir,
        to,
        `تم اختيار منطقة ${zone.zone_name_ar} ورسوم التوصيل ${money(zone.delivery_fee_jod)} 🌿\nأرسل العنوان بالتفصيل أو شارك الموقع الآن.`
      );

      return json(res, 200, { ok: true, delivered: result, mode: 'address_prompt' });
    }

    if (selection === BUTTON_IDS.PAY_CASH) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_notes_choice',
        sessionData: { orderDraft: { paymentMethod: 'cash' }, lastPrompt: 'notes' }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, notesButtons());
      return json(res, 200, { ok: true, delivered: result, mode: 'notes_prompt' });
    }

    if (selection === BUTTON_IDS.NOTES_ADD) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_notes_text',
        sessionData: { awaiting: 'notes_text' }
      });

      const result = await sendWhatsAppText(rootDir, to, 'اكتب الملاحظة التي تريد إضافتها على الطلب الآن.');
      return json(res, 200, { ok: true, delivered: result, mode: 'notes_text_prompt' });
    }

    if (selection === BUTTON_IDS.NOTES_SKIP) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'review_customer_summary',
        sessionData: { orderDraft: { notes: null }, awaiting: null }
      });

      const result = await sendWhatsAppInteractive(
        rootDir,
        to,
        customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, { ...sessionData.orderDraft, notes: null }))
      );

      return json(res, 200, { ok: true, delivered: result, mode: 'customer_summary' });
    }

    if (selection === BUTTON_IDS.CUSTOMER_EDIT) {
      session = await persistSession(rootDir, from, session, { currentState: 'editing_summary' });
      const result = await sendWhatsAppInteractive(rootDir, to, editList());
      return json(res, 200, { ok: true, delivered: result, mode: 'edit_list' });
    }

    if (selection === BUTTON_IDS.EDIT_ITEMS) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'menu_roots',
        sessionData: { lastPrompt: 'root' }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir));
      return json(res, 200, { ok: true, delivered: result, mode: 'edit_items' });
    }

    if (selection === BUTTON_IDS.EDIT_SCHEDULE) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_day' });
      const result = await sendWhatsAppInteractive(rootDir, to, dayList());
      return json(res, 200, { ok: true, delivered: result, mode: 'edit_schedule' });
    }

    if (selection === BUTTON_IDS.EDIT_ZONE) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_sector' });
      const result = await sendWhatsAppInteractive(rootDir, to, sectorList(rootDir));
      return json(res, 200, { ok: true, delivered: result, mode: 'edit_zone' });
    }

    if (selection === BUTTON_IDS.EDIT_NOTES) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_notes_choice' });
      const result = await sendWhatsAppInteractive(rootDir, to, notesButtons());
      return json(res, 200, { ok: true, delivered: result, mode: 'edit_notes' });
    }

    if (selection === BUTTON_IDS.CUSTOMER_CONFIRM) {
      const outcome = await createOrUpdateOrderFromDraft(rootDir, from, session);
      if (outcome.error) {
        const result = await sendWhatsAppText(rootDir, to, outcome.error);
        return json(res, 200, { ok: true, delivered: result, mode: 'create_order_error' });
      }

      await notifyAdminsNewOrder(rootDir, outcome.order, config);
      const result = await sendWhatsAppText(
        rootDir,
        to,
        `تم استلام طلبك وإرساله للإدارة للمراجعة ✅\nرقم المتابعة الداخلي: ${outcome.order.id}\nسنثبت الطلب بعد اعتماد الإدارة ونرسل لك الحالة مباشرة هنا.`
      );

      return json(res, 200, { ok: true, delivered: result, mode: 'sent_to_admin' });
    }

    if (type === 'location' && sessionData.awaiting === 'address') {
      const locationText = buildLocationText(message);
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_payment',
        sessionData: { orderDraft: { address: locationText }, awaiting: null }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, paymentButtons());
      return json(res, 200, { ok: true, delivered: result, mode: 'address_location_saved' });
    }

    if (type === 'text' && sessionData.awaiting === 'quantity_text') {
      const quantity = Number(text);
      const item = getMenuItemById(rootDir, sessionData.pendingItemId);

      if (!quantity || quantity < 1 || !item) {
        const result = await sendWhatsAppText(rootDir, to, 'أرسل رقم كمية صحيحًا مثل 2 أو 5.');
        return json(res, 200, { ok: true, delivered: result, mode: 'quantity_invalid' });
      }

      const newItem = {
        id: item.record_id,
        displayNameAr: item.display_name_ar || item.item_name_ar,
        unit_ar: item.unit_ar,
        price_1_jod: Number(item.price_1_jod || 0),
        quantity,
        lineTotalJod: Number(item.price_1_jod || 0) * quantity,
        notes: null
      };

      const cart = [...(sessionData.cart || []), newItem];
      const extras = getItemExtras(rootDir, item);

      session = await persistSession(rootDir, from, session, {
        currentState: extras.length ? 'awaiting_extra_choice' : 'reviewing_cart',
        sessionData: { cart, awaiting: extras.length ? 'extra_choice' : null }
      });

      const result = await sendWhatsAppInteractive(
        rootDir,
        to,
        extras.length ? extrasButtons(item, extras) : cartButtons(cartSummary(cart, sessionData.orderDraft).text)
      );

      return json(res, 200, { ok: true, delivered: result, mode: 'quantity_text_saved' });
    }

    if (type === 'text' && sessionData.awaiting === 'address') {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_payment',
        sessionData: { orderDraft: { address: text }, awaiting: null }
      });

      const result = await sendWhatsAppInteractive(rootDir, to, paymentButtons());
      return json(res, 200, { ok: true, delivered: result, mode: 'address_saved' });
    }

    if (type === 'text' && sessionData.awaiting === 'notes_text') {
      session = await persistSession(rootDir, from, session, {
        currentState: 'review_customer_summary',
        sessionData: { orderDraft: { notes: text }, awaiting: null }
      });

      const result = await sendWhatsAppInteractive(
        rootDir,
        to,
        customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, { ...sessionData.orderDraft, notes: text }))
      );

      return json(res, 200, { ok: true, delivered: result, mode: 'notes_saved' });
    }

    const fallbackIntent = textIntent(text);
    if (fallbackIntent === 'welcome') {
      const result = await sendWhatsAppInteractive(rootDir, to, customerProfile.isReturning ? welcomeButtons(true) : mainMenuButtons());
      return json(res, 200, { ok: true, delivered: result, mode: 'welcome_repeat' });
    }

    const result = await sendWhatsAppInteractive(rootDir, to, mainMenuButtons());
    return json(res, 200, { ok: true, delivered: result, mode: 'fallback_main' });
  } catch (error) {
    console.error('WEBHOOK_FATAL_ERROR', error);

    try {
      const body = await parseBody(req).catch(() => ({}));
      const value = body.entry?.[0]?.changes?.[0]?.value || body.value || {};
      const message = value.messages?.[0];
      const to = normalizePhone(message?.from || '').replace(/^\+/, '');

      if (to) {
        await sendWhatsAppPayload(to, {
          type: 'text',
          text: { body: 'وصلتنا رسالتك 🌿 حدث تأخير بسيط في المعالجة وسنعود لك حالًا.' }
        });
      }
    } catch (fallbackError) {
      console.error('WEBHOOK_FALLBACK_SEND_ERROR', fallbackError);
    }

    return json(res, 200, {
      ok: false,
      recovered: true,
      message: error.message
    });
  }
}
