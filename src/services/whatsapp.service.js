import crypto from 'node:crypto';
import { parseBody, json, normalizePhone, slugify } from '../utils/core.js';
import { getDeliveryGroupByKey, getDeliveryGroupList, getDeliveryZoneById } from './delivery.service.js';
import { getBotRoots, getItemExtras, getItemsForRoot, getMenuItemById } from './menu.service.js';
import {
  createOrder,
  findOrdersByPhone,
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

export function whatsappVerify(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
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
  return process.env.BASE_URL || config.site.baseUrl || `https://${req.headers.host}`;
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
    'العربية': BUTTON_IDS.AR,
    'english': BUTTON_IDS.EN,
    'أوافق': BUTTON_IDS.CONSENT_YES,
    'خدمة فقط': BUTTON_IDS.CONSENT_SERVICE_ONLY,
    'لا أوافق': BUTTON_IDS.CONSENT_NO,
    'اطلب': BUTTON_IDS.START_ORDER,
    'ابدأ الطلب': BUTTON_IDS.START_ORDER,
    'المنيو': BUTTON_IDS.SHOW_MENU,
    'تتبع': BUTTON_IDS.TRACK_ORDER,
    'موظف': BUTTON_IDS.HUMAN,
    'موظف مباشر': BUTTON_IDS.HUMAN,
    'إضافة': BUTTON_IDS.ADD_MORE,
    'متابعة': BUTTON_IDS.CHECKOUT,
    'إلغاء': BUTTON_IDS.CLEAR_CART,
    'توصيل': BUTTON_IDS.DELIVERY,
    'استلام': BUTTON_IDS.PICKUP,
    'كاش': BUTTON_IDS.PAY_CASH,
    'ملاحظات': BUTTON_IDS.NOTES_ADD,
    'بدون ملاحظات': BUTTON_IDS.NOTES_SKIP,
    'تأكيد': BUTTON_IDS.CUSTOMER_CONFIRM,
    'تعديل': BUTTON_IDS.CUSTOMER_EDIT,
    'خروج': BUTTON_IDS.CUSTOMER_EXIT,
    'الأصناف': BUTTON_IDS.EDIT_ITEMS,
    'الموعد': BUTTON_IDS.EDIT_SCHEDULE,
    'المنطقة': BUTTON_IDS.EDIT_ZONE,
    'الملاحظات': BUTTON_IDS.EDIT_NOTES
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
  if (language === 'en') {
    return {
      type: 'button',
      body: { text: 'Welcome to Matbakh Al Youm. Choose your language or contact a staff member directly.' },
      action: { buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.AR, title: shortButton('العربية') } },
        { type: 'reply', reply: { id: BUTTON_IDS.EN, title: shortButton('English') } },
        { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('Staff') } }
      ] }
    };
  }
  return {
    type: 'button',
    body: { text: body },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.AR, title: shortButton('العربية') } },
      { type: 'reply', reply: { id: BUTTON_IDS.EN, title: shortButton('English') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('موظف') } }
    ] }
  };
}

function consentButtons(language = 'ar') {
  if (language === 'en') {
    return {
      type: 'button',
      body: { text: 'Before we continue, do you agree to receive service updates and occasional offers related to your orders?' },
      action: { buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_YES, title: shortButton('Agree') } },
        { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_SERVICE_ONLY, title: shortButton('Service only') } },
        { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_NO, title: shortButton('Decline') } }
      ] }
    };
  }
  return {
    type: 'button',
    body: { text: 'قبل المتابعة 🌿\nنستخدم بيانات المحادثة لتحسين الخدمة وتنظيم الطلبات ضمن حدود العمل. هل توافقون على استقبال العروض والتحديثات المرتبطة بالخدمة؟' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_YES, title: shortButton('أوافق') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_SERVICE_ONLY, title: shortButton('خدمة فقط') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_NO, title: shortButton('لا أوافق') } }
    ] }
  };
}

function mainMenuButtons() {
  return {
    type: 'button',
    body: { text: 'كيف يمكننا خدمتك اليوم؟ اختر المسار المناسب وسنكمل معك خطوة بخطوة 🌿' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.START_ORDER, title: shortButton('اطلب') } },
      { type: 'reply', reply: { id: BUTTON_IDS.TRACK_ORDER, title: shortButton('تتبع') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('موظف') } }
    ] }
  };
}

function rootList(rootDir) {
  const rows = getBotRoots(rootDir).slice(0, 10).map(root => ({
    id: `root:${root.id}`,
    title: shortButton(root.title),
    description: `${root.count} خيار`
  }));
  return {
    type: 'list',
    body: { text: 'اختر القسم الرئيسي أولًا، وبعدها نرتب لك النوع والصنف والكمية بشكل احترافي 🌿' },
    action: {
      button: 'الأقسام',
      sections: [{ title: 'منيو مطبخ اليوم', rows }]
    }
  };
}

function simpleChoiceList(bodyText, buttonText, title, rows) {
  return {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: shortButton(buttonText),
      sections: [{ title, rows: rows.slice(0, 10) }]
    }
  };
}

function buildTypeList(rootId) {
  if (rootId === 'meat') {
    return simpleChoiceList('اختر نوع اللحم أولًا 🌿', 'اختر', 'نوع اللحم', [
      { id: 'type:بلدي', title: 'بلدي', description: 'أطباق اللحوم البلدي' },
      { id: 'type:روماني', title: 'روماني', description: 'أطباق اللحوم الروماني' }
    ]);
  }
  if (rootId === 'catering') {
    return simpleChoiceList('اختر فئة الوليمة أولًا 🌿', 'الفئات', 'الولائم', [
      { id: 'category:خاروف كامل', title: 'خاروف كامل', description: 'ولائم كاملة' },
      { id: 'category:نصف خاروف', title: 'نصف خاروف', description: 'نصف ذبيحة' },
      { id: 'category:ضلعة', title: 'ضلعة', description: 'محاشي الضلعة' }
    ]);
  }
  return null;
}

function statusRowsFromItems(items) {
  const map = new Map([
    ['ready', { title: 'مطبوخ', description: 'جاهز للأكل' }],
    ['raw', { title: 'جاهز للطبخ', description: 'تحضير منزلي' }],
    ['frozen', { title: 'مفرز', description: 'حفظ بالتجميد' }],
    ['made_to_order', { title: 'حسب الطلب', description: 'يُحضّر لك' }],
    ['bundle', { title: 'العروض', description: 'وجبات مجمعة' }]
  ]);
  return [...new Set(items.map(item => item.status).filter(Boolean))]
    .filter(status => map.has(status))
    .map(status => ({ id: `status:${status}`, title: shortButton(map.get(status).title), description: map.get(status).description }));
}

function buildStatusList(items, prompt = 'اختر نوع التجهيز المناسب 🌿') {
  const rows = statusRowsFromItems(items);
  if (rows.length <= 1) return null;
  return simpleChoiceList(prompt, 'التجهيز', 'نوع التجهيز', rows);
}

function getFilteredItems(rootDir, draft) {
  let items = getItemsForRoot(rootDir, draft.rootId);
  if (draft.rootId === 'meat' && draft.meatType) {
    items = items.filter(item => (item.type_ar || '') === draft.meatType);
  }
  if (draft.rootId === 'catering' && draft.categoryFilter) {
    items = items.filter(item => (item.category_ar || '') === draft.categoryFilter);
  }
  if (draft.rootId === 'catering' && draft.meatType) {
    items = items.filter(item => (item.type_ar || '') === draft.meatType);
  }
  if (draft.statusFilter) {
    items = items.filter(item => item.status === draft.statusFilter);
  }
  return items;
}

function itemList(rootDir, draft, page = 0) {
  const items = getFilteredItems(rootDir, draft);
  const pageSize = 9;
  const chunk = items.slice(page * pageSize, page * pageSize + pageSize);
  const rows = chunk.map(item => ({
    id: `item:${item.record_id}`,
    title: shortButton(item.display_name_ar || item.item_name_ar),
    description: `${money(item.price_1_jod)} — ${String(item.unit_ar || '').slice(0, 20)}`
  }));
  if (items.length > (page + 1) * pageSize) {
    rows.push({ id: `items_page:${page + 1}`, title: 'مزيد', description: `صفحة ${page + 2}` });
  }
  return simpleChoiceList('اختر الصنف المناسب من الخيارات التالية 🌿', 'الأصناف', 'الأصناف المتاحة', rows);
}

function quantityList(item) {
  const rows = [1, 2, 3, 4, 5].map(q => ({
    id: `qty:${q}`,
    title: `${q}`,
    description: `${q} × ${String(item.unit_ar || 'وحدة').slice(0, 14)}`
  }));
  rows.push({ id: 'qty:text', title: 'كمية أخرى', description: 'أرسل الرقم يدويًا' });
  return simpleChoiceList(`اختر الكمية المطلوبة من ${item.display_name_ar || item.item_name_ar}.\nالسعر للوحدة: ${money(item.price_1_jod)}`, 'الكمية', 'اختيار الكمية', rows);
}

function extrasButtons(item, extras) {
  const buttons = extras.slice(0, 2).map(extra => ({
    type: 'reply',
    reply: { id: `extra:${extra.record_id}`, title: shortButton(extra.display_name_ar || extra.item_name_ar) }
  }));
  buttons.push({ type: 'reply', reply: { id: 'extra:skip', title: shortButton('بدون إضافة') } });
  return {
    type: 'button',
    body: { text: `هل ترغب بإضافة شيء على ${item.display_name_ar || item.item_name_ar}؟` },
    action: { buttons }
  };
}

function cartSummary(cart, draft) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = Number(draft.deliveryFeeJod || 0);
  const lines = cart.map((item, index) => `${index + 1}. ${item.displayNameAr} × ${item.quantity} = ${money(item.lineTotalJod)}`);
  return {
    subtotal,
    total: subtotal + deliveryFee,
    text: `ملخص الطلب حتى الآن 🌿\n\n${lines.join('\n')}\n\nالإجمالي الحالي: ${money(subtotal)}`
  };
}

function cartButtons(summaryText) {
  return {
    type: 'button',
    body: { text: `${summaryText}\n\nاختر الإجراء التالي:` },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.ADD_MORE, title: shortButton('إضافة') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CHECKOUT, title: shortButton('متابعة') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CLEAR_CART, title: shortButton('إلغاء') } }
    ] }
  };
}

function buildDeliveryTypeButtons() {
  return {
    type: 'button',
    body: { text: 'اختر طريقة الاستلام المناسبة لطلبك 🌿' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.DELIVERY, title: shortButton('توصيل') } },
      { type: 'reply', reply: { id: BUTTON_IDS.PICKUP, title: shortButton('استلام') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EDIT, title: shortButton('تعديل') } }
    ] }
  };
}

function buildDayOptions(config) {
  const formatter = new Intl.DateTimeFormat('ar-JO-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: config.timezone || 'Asia/Amman' });
  return [0, 1, 2].map(offset => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const dateIso = date.toISOString().slice(0, 10);
    const label = offset === 0 ? 'اليوم' : offset === 1 ? 'غدًا' : formatter.format(date);
    return { id: `day:${offset}`, title: label, description: dateIso, dateIso, label };
  });
}

function dayList(config) {
  const rows = buildDayOptions(config).map(option => ({ id: option.id, title: shortButton(option.title), description: option.description }));
  return simpleChoiceList('اختر يوم التسليم أولًا 🌿', 'اليوم', 'أيام التسليم', rows);
}

function slotList(config) {
  const rows = (config.deliveryTimeSlots || []).slice(0, 10).map((slot, index) => ({
    id: `slot:${index}`,
    title: shortButton(slot),
    description: 'موعد التوصيل'
  }));
  return simpleChoiceList('اختر الساعة المناسبة لطلبك 🌿', 'الساعة', 'أوقات التوصيل', rows);
}

function sectorList(rootDir) {
  const rows = getDeliveryGroupList(rootDir).slice(0, 10).map(group => ({
    id: `sector:${group.key}:0`,
    title: shortButton(group.title),
    description: `${group.count} منطقة`
  }));
  return simpleChoiceList('اختر المحافظة/القطاع أولًا 🌿', 'المناطق', 'القطاعات', rows);
}

function zoneList(rootDir, sectorKey, page = 0) {
  const group = getDeliveryGroupByKey(rootDir, sectorKey);
  if (!group) return { type: 'text', text: 'لم نتمكن من العثور على القطاع المطلوب. أعد اختيار المنطقة مرة أخرى.' };
  const pageSize = 9;
  const zones = group.zones || [];
  const chunk = zones.slice(page * pageSize, page * pageSize + pageSize);
  const rows = chunk.map(zone => ({
    id: `zone:${zone.zone_id}`,
    title: shortButton(zone.zone_name_ar),
    description: `${money(zone.delivery_fee_jod)} توصيل`
  }));
  if (zones.length > (page + 1) * pageSize) {
    rows.push({ id: `sector:${sectorKey}:${page + 1}`, title: 'مزيد', description: `صفحة ${page + 2}` });
  }
  return simpleChoiceList(`اختر المنطقة داخل ${group.group} 🌿`, 'المناطق', group.group, rows);
}

function paymentButtons() {
  return {
    type: 'button',
    body: { text: 'طريقة الدفع المعتمدة حاليًا: الدفع عند الاستلام كاش. هل نكمل؟' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.PAY_CASH, title: shortButton('كاش') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EDIT, title: shortButton('تعديل') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('موظف') } }
    ] }
  };
}

function notesButtons() {
  return {
    type: 'button',
    body: { text: 'إذا عندك أي ملاحظة إضافية على الطلب أخبرنا الآن 🌿' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.NOTES_ADD, title: shortButton('ملاحظات') } },
      { type: 'reply', reply: { id: BUTTON_IDS.NOTES_SKIP, title: shortButton('بدون ملاحظات') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EDIT, title: shortButton('تعديل') } }
    ] }
  };
}

function editList() {
  return simpleChoiceList('اختر الجزء الذي تريد تعديله في الطلب 🌿', 'تعديل', 'تعديل الطلب', [
    { id: BUTTON_IDS.EDIT_ITEMS, title: 'الأصناف', description: 'إضافة أو تعديل السلة' },
    { id: BUTTON_IDS.EDIT_SCHEDULE, title: 'الموعد', description: 'اليوم والساعة' },
    { id: BUTTON_IDS.EDIT_ZONE, title: 'المنطقة', description: 'القطاع والعنوان' },
    { id: BUTTON_IDS.EDIT_NOTES, title: 'الملاحظات', description: 'تعديل الملاحظات' }
  ]);
}

function buildCustomerFinalSummary(cart, draft) {
  const summary = cartSummary(cart, draft);
  const deliveryTypeLabel = draft.deliveryType === 'pickup' ? 'استلام من المطبخ' : 'توصيل';
  return [
    'راجع طلبك النهائي 🌿',
    '',
    ...cart.map((item, index) => `${index + 1}. ${item.displayNameAr} × ${item.quantity} = ${money(item.lineTotalJod)}`),
    '',
    `الاستلام: ${deliveryTypeLabel}`,
    draft.deliveryDayLabel ? `اليوم: ${draft.deliveryDayLabel}` : null,
    draft.deliverySlot ? `الساعة: ${draft.deliverySlot}` : null,
    draft.sectorTitle ? `القطاع: ${draft.sectorTitle}` : null,
    draft.zoneName ? `المنطقة: ${draft.zoneName}` : null,
    draft.address ? `العنوان: ${draft.address}` : null,
    `الدفع: الدفع عند الاستلام - كاش`,
    `رسوم التوصيل: ${money(draft.deliveryFeeJod || 0)}`,
    `الإجمالي: ${money(summary.total)}`,
    draft.notes ? `ملاحظات: ${draft.notes}` : 'ملاحظات: بدون ملاحظات',
    '',
    'إذا كانت البيانات صحيحة اختر: تأكيد'
  ].filter(Boolean).join('\n');
}

function customerSummaryButtons(summaryText) {
  return {
    type: 'button',
    body: { text: summaryText },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_CONFIRM, title: shortButton('تأكيد') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EDIT, title: shortButton('تعديل') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EXIT, title: shortButton('خروج') } }
    ] }
  };
}

function buildOrderSummary(order) {
  const lines = (order.items || []).map((item, index) => `${index + 1}. ${item.displayNameAr || item.display_name_ar} × ${item.quantity} = ${money(item.lineTotalJod || item.line_total_jod || item.total)}`);
  return [
    `رقم الطلب: ${order.id}`,
    `الهاتف: ${order.phone}`,
    `الاستلام: ${order.deliveryType === 'pickup' || order.delivery_type === 'pickup' ? 'استلام' : 'توصيل'}`,
    order.deliveryDay || order.delivery_day ? `اليوم: ${order.deliveryDay || order.delivery_day}` : null,
    order.deliverySlot || order.delivery_slot ? `الساعة: ${order.deliverySlot || order.delivery_slot}` : null,
    order.deliverySector || order.delivery_sector ? `القطاع: ${order.deliverySector || order.delivery_sector}` : null,
    order.deliveryZoneName || order.delivery_zone_name ? `المنطقة: ${order.deliveryZoneName || order.delivery_zone_name}` : null,
    order.address || order.address_text ? `العنوان: ${order.address || order.address_text}` : null,
    `الدفع: الدفع عند الاستلام - كاش`,
    order.notes || order.order_notes ? `ملاحظات: ${order.notes || order.order_notes}` : 'ملاحظات: بدون ملاحظات',
    '--- الأصناف ---',
    ...lines,
    `الإجمالي: ${money(order.totalJod || order.total_jod)}`
  ].filter(Boolean).join('\n');
}

function adminActionButtons(orderId, stage = 'new') {
  if (stage === 'new') {
    return {
      type: 'button',
      body: { text: `اختر إجراء الإدارة للطلب ${orderId}` },
      action: { buttons: [
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_APPROVE}:${orderId}`, title: shortButton('موافقة') } },
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_MODIFY}:${orderId}`, title: shortButton('تعديل') } },
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_REJECT}:${orderId}`, title: shortButton('رفض') } }
      ] }
    };
  }
  if (stage === 'approved') {
    return {
      type: 'button',
      body: { text: `حدّث حالة الطلب ${orderId}` },
      action: { buttons: [
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_PREPARING}:${orderId}`, title: shortButton('تحضير') } },
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_READY}:${orderId}`, title: shortButton('جاهز') } },
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_OUT}:${orderId}`, title: shortButton('توصيل') } }
      ] }
    };
  }
  return {
    type: 'button',
    body: { text: `إغلاق حالة الطلب ${orderId}` },
    action: { buttons: [
      { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_DELIVERED}:${orderId}`, title: shortButton('تم التسليم') } },
      { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_READY}:${orderId}`, title: shortButton('جاهز') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('موظف') } }
    ] }
  };
}

async function sendWhatsAppPayload(to, payload) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return { skipped: true, reason: 'بيانات WhatsApp API غير مضبوطة.' };
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      ...payload
    })
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function sendWhatsAppText(rootDir, to, body) {
  const result = await sendWhatsAppPayload(to, { type: 'text', text: { body } });
  try {
    await saveOutgoingMessage(rootDir, {
      id: crypto.randomUUID(),
      to,
      type: 'text',
      text: body,
      payload: result.data,
      createdAt: nowIso()
    });
  } catch (error) {
    console.error('SAVE_OUTGOING_TEXT_ERROR', error);
  }
  logWebhook('OUTGOING_TEXT', { to, status: result.status, body });
  return result;
}

async function sendWhatsAppInteractive(rootDir, to, interactive) {
  const result = await sendWhatsAppPayload(to, { type: 'interactive', interactive });
  try {
    await saveOutgoingMessage(rootDir, {
      id: crypto.randomUUID(),
      to,
      type: `interactive_${interactive.type}`,
      text: interactive.body?.text || '',
      payload: result.data,
      createdAt: nowIso()
    });
  } catch (error) {
    console.error('SAVE_OUTGOING_INTERACTIVE_ERROR', error);
  }
  logWebhook('OUTGOING_INTERACTIVE', { to, status: result.status, type: interactive.type, body: interactive.body?.text || '' });
  return result;
}

async function replyHuman(rootDir, to, config, req) {
  const { phone } = buildTextLinks(config, req);
  return sendWhatsAppText(rootDir, to, `يسعدنا خدمتك 🌿 يمكنك التواصل مباشرة مع الموظف على الرقم ${phone} أو متابعة الطلب معنا هنا.`);
}

async function notifyAdminsNewOrder(rootDir, order, config) {
  const admins = getAdminNumbers(config);
  const uniqueAdmins = [...new Set(admins)];
  if (!uniqueAdmins.length) return;
  const body = `طلب جديد يحتاج مراجعة 🔔\n\n${buildOrderSummary(order)}`;
  for (const admin of uniqueAdmins) {
    await sendWhatsAppText(rootDir, admin, body);
    await sendWhatsAppInteractive(rootDir, admin, adminActionButtons(order.id, 'new'));
  }
}

async function notifyAdminsStatusStage(rootDir, order, config, stage = 'approved') {
  const admins = [...new Set(getAdminNumbers(config))];
  if (!admins.length) return;
  for (const admin of admins) {
    await sendWhatsAppInteractive(rootDir, admin, adminActionButtons(order.id, stage));
  }
}

function parseAdminAction(selection) {
  const parts = String(selection || '').split(':');
  if (parts[0] !== 'admin') return null;
  return { action: parts[1], orderId: parts[2] };
}

async function sendOrderStatusToCustomer(rootDir, order, items = null) {
  const phone = normalizePhone(order.phone).replace(/^\+/, '');
  const body = mapPrepStatusToCustomer(order.status, order.id, order.admin_notes || order.adminNotes || '');
  await sendWhatsAppText(rootDir, phone, body);
}

async function createOrUpdateOrderFromDraft(rootDir, phone, session, config) {
  const sessionData = readSessionData(session);
  const cart = sessionData.cart || [];
  const draft = sessionData.orderDraft || defaultDraft();
  if (!cart.length) return { error: 'لا يمكن إرسال طلب فارغ. أضف صنفًا واحدًا على الأقل.' };
  if (!draft.deliveryDayLabel || !draft.deliverySlot) return { error: 'نحتاج يوم التسليم والساعة قبل الإرسال.' };
  if (draft.deliveryType === 'delivery' && (!draft.zoneId || !draft.address)) return { error: 'نحتاج المنطقة والعنوان قبل الإرسال.' };

  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = draft.deliveryType === 'pickup' ? 0 : Number(draft.deliveryFeeJod || 0);
  const total = subtotal + deliveryFee;
  const customerProfile = await getCustomerProfileSummary(rootDir, phone);
  const customerTags = customerProfile.isReturning ? ['عميل متكرر'] : ['عميل جديد'];

  const baseOrder = {
    id: draft.revisionOrderId || await generateNextOrderCode(rootDir),
    customerName: customerProfile.customer?.full_name || 'عميل مطبخ اليوم',
    phone,
    items: cart,
    notes: draft.notes || null,
    address: draft.deliveryType === 'pickup' ? 'استلام من المطبخ' : draft.address,
    deliveryType: draft.deliveryType,
    deliveryDay: draft.deliveryDayLabel,
    deliverySlot: draft.deliverySlot,
    deliverySector: draft.sectorTitle,
    deliveryZoneId: draft.zoneId,
    deliveryZoneName: draft.zoneName,
    paymentMethod: draft.paymentMethod || 'cash',
    paymentStatus: 'pending',
    status: 'awaiting_admin_review',
    statusLabelAr: 'بانتظار اعتماد الإدارة',
    subtotalJod: subtotal,
    deliveryFeeJod: deliveryFee,
    totalJod: total,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    consentStatus: session.consent_status || 'service_only',
    preferredLanguage: session.preferred_language || 'ar',
    customerTags
  };

  let order;
  if (draft.revisionOrderId) {
    const existing = await getOrderById(rootDir, draft.revisionOrderId);
    order = await replaceOrder(rootDir, draft.revisionOrderId, {
      ...existing,
      ...baseOrder,
      createdAt: existing?.created_at || existing?.createdAt || nowIso(),
      updatedAt: nowIso()
    });
  } else {
    order = await createOrder(rootDir, baseOrder);
  }

  await persistSession(rootDir, phone, session, {
    currentState: 'awaiting_admin_review',
    lastOrderId: order.id,
    sessionData: {
      lastOrderId: order.id,
      orderDraft: { ...draft, revisionOrderId: order.id },
      lastPrompt: 'awaiting_admin_review'
    }
  });
  return { order: { ...baseOrder, id: order.id } };
}

function normalizeSelectionText(text = '') {
  return String(text || '').trim();
}

function textIntent(text = '') {
  if (/مرحبا|أهلا|اهلا|السلام عليكم|hello|hi/i.test(text)) return 'welcome';
  if (/موظف|اتصال|تواصل|human|agent/i.test(text)) return BUTTON_IDS.HUMAN;
  if (/تتبع|track|status|حالة|طلبي|جاهز|وين/i.test(text)) return BUTTON_IDS.TRACK_ORDER;
  if (/منيو|menu|اطلب|طلب/i.test(text)) return BUTTON_IDS.START_ORDER;
  return '';
}

async function handleAdminAction(rootDir, from, to, selection, text, config) {
  const actionInfo = parseAdminAction(selection);
  let action = actionInfo?.action;
  let orderId = actionInfo?.orderId;
  let adminNote = '';

  if (!action && /^\/(approve|reject|ready|out|delivered|modify|prep)\b/i.test(text)) {
    const parts = String(text).trim().split(/\s+/);
    const command = parts.shift().toLowerCase();
    orderId = parts.shift();
    adminNote = parts.join(' ').trim();
    const map = {
      '/approve': BUTTON_IDS.ADMIN_APPROVE,
      '/modify': BUTTON_IDS.ADMIN_MODIFY,
      '/reject': BUTTON_IDS.ADMIN_REJECT,
      '/prep': BUTTON_IDS.ADMIN_PREPARING,
      '/ready': BUTTON_IDS.ADMIN_READY,
      '/out': BUTTON_IDS.ADMIN_OUT,
      '/delivered': BUTTON_IDS.ADMIN_DELIVERED
    };
    action = map[command];
  }

  if (!action) {
    if (/^\/pending/i.test(text)) {
      const pending = await getOrdersByStatus(rootDir, 'awaiting_admin_review', 10);
      const body = pending.length
        ? pending.map(order => `• ${order.id} — ${order.customer_name || order.phone} — ${money(order.total_jod || order.totalJod)}`).join('\n')
        : 'لا توجد طلبات بانتظار اعتماد الإدارة حاليًا.';
      await sendWhatsAppText(rootDir, to, body);
      return { handled: true };
    }
    if (/^\/view\b/i.test(text)) {
      const orderIdText = String(text).trim().split(/\s+/)[1];
      const order = await getOrderById(rootDir, orderIdText);
      const items = order ? await getOrderItems(rootDir, orderIdText) : [];
      await sendWhatsAppText(rootDir, to, order ? buildOrderSummary({ ...order, items: items.map(item => ({ ...item, displayNameAr: item.display_name_ar, lineTotalJod: item.line_total_jod })) }) : 'لم يتم العثور على هذا الطلب.');
      return { handled: true };
    }
    if (/^\/help/i.test(text)) {
      await sendWhatsAppText(rootDir, to, 'أوامر الإدارة المتاحة:\n/pending\n/view ORDER_ID\n/approve ORDER_ID\n/modify ORDER_ID\n/reject ORDER_ID\n/prep ORDER_ID\n/ready ORDER_ID\n/out ORDER_ID\n/delivered ORDER_ID');
      return { handled: true };
    }
    return { handled: false };
  }

  const order = await getOrderById(rootDir, orderId);
  if (!order) {
    await sendWhatsAppText(rootDir, to, 'لم نتمكن من العثور على رقم الطلب المطلوب.');
    return { handled: true };
  }
  const orderItems = await getOrderItems(rootDir, orderId);

  const map = {
    [BUTTON_IDS.ADMIN_APPROVE]: { status: 'approved', label: 'تم اعتماد الطلب' },
    [BUTTON_IDS.ADMIN_MODIFY]: { status: 'awaiting_customer_edit', label: 'بانتظار تعديل العميل' },
    [BUTTON_IDS.ADMIN_REJECT]: { status: 'rejected', label: 'لم يتم اعتماد الطلب' },
    [BUTTON_IDS.ADMIN_PREPARING]: { status: 'preparing', label: 'قيد التحضير' },
    [BUTTON_IDS.ADMIN_READY]: { status: 'ready', label: 'جاهز' },
    [BUTTON_IDS.ADMIN_OUT]: { status: 'out_for_delivery', label: 'قيد التوصيل' },
    [BUTTON_IDS.ADMIN_DELIVERED]: { status: 'delivered', label: 'تم التسليم' }
  };
  const target = map[action];
  if (!target) return { handled: false };

  const updated = await updateOrderStatus(rootDir, orderId, target.status, target.label, {
    approvedByPhone: from,
    approvedAt: target.status === 'approved' ? nowIso() : order.approved_at,
    adminNotes: adminNote || order.admin_notes || ''
  });

  if (target.status === 'awaiting_customer_edit') {
    const session = await getConversationSession(rootDir, order.phone);
    const cart = orderItems.map(item => ({
      id: item.menu_item_id,
      displayNameAr: item.display_name_ar,
      unit_ar: item.unit_ar,
      price_1_jod: Number(item.unit_price_jod || 0),
      quantity: Number(item.quantity || 1),
      lineTotalJod: Number(item.line_total_jod || 0)
    }));
    await persistSession(rootDir, order.phone, session, {
      currentState: 'review_customer_summary',
      lastOrderId: order.id,
      sessionData: {
        cart,
        orderDraft: {
          revisionOrderId: order.id,
          deliveryType: order.delivery_type,
          deliveryDayLabel: order.delivery_day,
          deliverySlot: order.delivery_slot,
          sectorTitle: order.delivery_sector,
          zoneId: order.delivery_zone_id,
          zoneName: order.delivery_zone_name,
          deliveryFeeJod: Number(order.delivery_fee_jod || 0),
          address: order.address_text,
          paymentMethod: order.payment_method || 'cash',
          notes: order.order_notes
        }
      }
    });
    await sendWhatsAppText(rootDir, order.phone.replace(/^\+/, ''), mapPrepStatusToCustomer(target.status, order.id, adminNote));
    await sendWhatsAppInteractive(rootDir, order.phone.replace(/^\+/, ''), customerSummaryButtons(buildCustomerFinalSummary(cart, {
      deliveryType: order.delivery_type,
      deliveryDayLabel: order.delivery_day,
      deliverySlot: order.delivery_slot,
      sectorTitle: order.delivery_sector,
      zoneName: order.delivery_zone_name,
      deliveryFeeJod: Number(order.delivery_fee_jod || 0),
      address: order.address_text,
      paymentMethod: order.payment_method,
      notes: order.order_notes
    })));
    await sendWhatsAppText(rootDir, to, `تم تحويل الطلب ${order.id} إلى مسار التعديل من العميل.`);
    return { handled: true };
  }

  const customerSession = await getConversationSession(rootDir, order.phone);
  if (target.status === 'delivered' || target.status === 'rejected' || target.status === 'customer_exit') {
    await persistSession(rootDir, order.phone, customerSession, {
      currentState: 'main_menu',
      lastOrderId: target.status === 'delivered' ? order.id : null,
      sessionData: { awaiting: null }
    });
  } else {
    await persistSession(rootDir, order.phone, customerSession, {
      currentState: target.status,
      lastOrderId: order.id,
      sessionData: { lastOrderId: order.id, awaiting: null }
    });
  }
  await sendOrderStatusToCustomer(rootDir, { ...order, ...updated, phone: order.phone });
  await sendWhatsAppText(rootDir, to, `تم تحديث الطلب ${order.id} إلى حالة: ${target.label}`);
  if (target.status === 'approved') {
    await notifyAdminsStatusStage(rootDir, order, config, 'approved');
  }
  if (target.status === 'out_for_delivery') {
    await notifyAdminsStatusStage(rootDir, order, config, 'delivery');
  }
  return { handled: true };
}

function orderFlowLocked(session) {
  const state = session?.current_state || '';
  return [
    'menu_roots', 'awaiting_type', 'awaiting_status', 'awaiting_item', 'awaiting_quantity', 'reviewing_cart',
    'awaiting_day', 'awaiting_slot', 'awaiting_delivery_type', 'awaiting_sector', 'awaiting_zone',
    'awaiting_address', 'awaiting_payment', 'awaiting_notes_choice', 'awaiting_notes_text',
    'review_customer_summary', 'awaiting_admin_review'
  ].includes(state);
}

async function sendOpenOrderLockMessage(rootDir, to, order) {
  const body = `لديك طلب قائم بالفعل 🌿\nرقم الطلب: ${order.id}\nحالته الحالية: ${labelFromStatus(order.status)}\nأكمل متابعة هذا الطلب أولًا، وإذا رغبت سنعرض حالته الآن.`;
  return sendWhatsAppInteractive(rootDir, to, {
    type: 'button',
    body: { text: body },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.TRACK_ORDER, title: shortButton('تتبع') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('موظف') } },
      { type: 'reply', reply: { id: BUTTON_IDS.EXIT, title: shortButton('خروج') } }
    ] }
  });
}

export async function processWhatsAppWebhook(req, res, config, rootDir) {
  try {
    const body = await parseBody(req);
    const value = body.entry?.[0]?.changes?.[0]?.value || body.value || {};
    const message = value.messages?.[0];
    const statuses = value.statuses?.[0] || null;

    logWebhook('WEBHOOK_IN', {
      hasMessage: Boolean(message),
      hasStatuses: Boolean(statuses),
      from: message?.from || null,
      type: message?.type || null,
      messageId: message?.id || null,
      statusId: statuses?.id || null,
      statusType: statuses?.status || null
    });

    if (!message) {
      return json(res, 200, { ok: true, skipped: true, reason: statuses ? 'status_update' : 'no_message' });
    }

    const from = normalizePhone(message.from || '');
    const to = normalizePhone(value.metadata?.display_phone_number || '').replace(/^\+/, '');
    const type = message.type || 'text';
    const text = normalizeSelectionText(message.text?.body || '');
    const selection = readIncomingSelection(message, rootDir);
    const admin = isAdminPhone(from, config);

    try {
      await saveIncomingMessage(rootDir, {
        id: message.id || crypto.randomUUID(),
        from,
        type,
        text,
        audioId: message.audio?.id,
        payload: body,
        receivedAt: nowIso()
      });
    } catch (error) {
      console.error('SAVE_INCOMING_MESSAGE_ERROR', error);
    }

  if (admin) {
    const adminResult = await handleAdminAction(rootDir, from, to, selection, text, config);
    if (adminResult.handled) return json(res, 200, { ok: true, admin: true });
  }

  let session = await getConversationSession(rootDir, from);
  const sessionData = readSessionData(session);
  const currentLanguage = session?.preferred_language || 'ar';
  const customerProfile = await getCustomerProfileSummary(rootDir, from);
  const openOrder = session?.last_order_id ? await getOrderById(rootDir, session.last_order_id) : await getLatestOpenOrderByPhone(rootDir, from);

  if (!session) {
    session = await persistSession(rootDir, from, session, { preferredLanguage: 'ar', consentStatus: 'pending', currentState: 'welcome' });
    await upsertCustomer(rootDir, { phone: from, preferredLanguage: 'ar', consentStatus: 'pending' });
    const result = await sendWhatsAppInteractive(rootDir, to, welcomeButtons(customerProfile.isReturning));
    return json(res, 200, { ok: true, delivered: result, mode: 'welcome_buttons' });
  }

  if (TRACK_TERMS.test(text) && openOrder && !TERMINAL_STATUSES.includes(openOrder.status)) {
    const result = await sendWhatsAppText(rootDir, to, mapPrepStatusToCustomer(openOrder.status, openOrder.id, openOrder.admin_notes || ''));
    return json(res, 200, { ok: true, delivered: result, mode: 'track_open_order' });
  }

  if (selection === BUTTON_IDS.AR || /^العربية$/i.test(text)) {
    session = await persistSession(rootDir, from, session, { preferredLanguage: 'ar', currentState: 'awaiting_consent' });
    await upsertCustomer(rootDir, { phone: from, preferredLanguage: 'ar', consentStatus: session.consent_status || 'pending' });
    const result = await sendWhatsAppInteractive(rootDir, to, consentButtons('ar'));
    return json(res, 200, { ok: true, delivered: result, mode: 'consent' });
  }

  if (selection === BUTTON_IDS.EN || /^english$/i.test(text)) {
    session = await persistSession(rootDir, from, session, { preferredLanguage: 'en', currentState: 'awaiting_consent' });
    await upsertCustomer(rootDir, { phone: from, preferredLanguage: 'en', consentStatus: session.consent_status || 'pending' });
    const result = await sendWhatsAppInteractive(rootDir, to, consentButtons('en'));
    return json(res, 200, { ok: true, delivered: result, mode: 'consent_en' });
  }

  if ([BUTTON_IDS.CONSENT_YES, BUTTON_IDS.CONSENT_SERVICE_ONLY, BUTTON_IDS.CONSENT_NO].includes(selection)) {
    const consentStatus = selection === BUTTON_IDS.CONSENT_YES ? 'marketing_opt_in' : selection === BUTTON_IDS.CONSENT_SERVICE_ONLY ? 'service_only' : 'declined';
    session = await persistSession(rootDir, from, session, { consentStatus, currentState: 'main_menu' });
    await upsertCustomer(rootDir, { phone: from, preferredLanguage: currentLanguage, consentStatus });
    const result = await sendWhatsAppInteractive(rootDir, to, mainMenuButtons());
    return json(res, 200, { ok: true, delivered: result, mode: 'main_menu_after_consent' });
  }

  if (selection === BUTTON_IDS.HUMAN || textIntent(text) === BUTTON_IDS.HUMAN) {
    const result = await replyHuman(rootDir, to, config, req);
    return json(res, 200, { ok: true, delivered: result, mode: 'human_help' });
  }

  if (selection === BUTTON_IDS.TRACK_ORDER || textIntent(text) === BUTTON_IDS.TRACK_ORDER) {
    if (openOrder) {
      const result = await sendWhatsAppText(rootDir, to, mapPrepStatusToCustomer(openOrder.status, openOrder.id, openOrder.admin_notes || ''));
      return json(res, 200, { ok: true, delivered: result, mode: 'track_latest' });
    }
    const orders = await findOrdersByPhone(rootDir, from);
    const result = await sendWhatsAppText(rootDir, to, orders.length ? orders.slice(0, 5).map(order => `• ${order.id} — ${labelFromStatus(order.status)}`).join('\n') : 'لا يوجد طلبات سابقة مرتبطة بهذا الرقم حاليًا.');
    return json(res, 200, { ok: true, delivered: result, mode: 'track_history' });
  }

  if ((selection === BUTTON_IDS.START_ORDER || selection === BUTTON_IDS.SHOW_MENU || textIntent(text) === BUTTON_IDS.START_ORDER) && ((openOrder && !TERMINAL_STATUSES.includes(openOrder.status)) || orderFlowLocked(session))) {
    const result = await sendOpenOrderLockMessage(rootDir, to, openOrder || { id: session.last_order_id || '---', status: session.current_state });
    return json(res, 200, { ok: true, delivered: result, mode: 'open_order_lock' });
  }

  if (selection === BUTTON_IDS.START_ORDER || selection === BUTTON_IDS.SHOW_MENU || textIntent(text) === BUTTON_IDS.START_ORDER) {
    session = await persistSession(rootDir, from, session, {
      currentState: 'menu_roots',
      sessionData: { cart: [], selectedSection: null, itemPage: 0, pendingItemId: null, awaiting: null, orderDraft: defaultDraft(), lastPrompt: 'root' }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir));
    return json(res, 200, { ok: true, delivered: result, mode: 'root_list' });
  }

  if (selection.startsWith('root:')) {
    const rootId = selection.split(':')[1];
    const draft = { ...defaultDraft(), rootId };
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_type', sessionData: { orderDraft: draft, lastPrompt: 'root' } });
    const typeList = buildTypeList(rootId);
    if (typeList) {
      const result = await sendWhatsAppInteractive(rootDir, to, typeList);
      return json(res, 200, { ok: true, delivered: result, mode: 'root_type' });
    }
    const items = getFilteredItems(rootDir, draft);
    const statusList = buildStatusList(items);
    if (statusList) {
      const result = await sendWhatsAppInteractive(rootDir, to, statusList);
      return json(res, 200, { ok: true, delivered: result, mode: 'root_status' });
    }
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_item', sessionData: { orderDraft: draft, itemPage: 0 } });
    const result = await sendWhatsAppInteractive(rootDir, to, itemList(rootDir, draft, 0));
    return json(res, 200, { ok: true, delivered: result, mode: 'root_items' });
  }

  if (selection.startsWith('type:')) {
    const value = selection.split(':')[1];
    const draft = { ...sessionData.orderDraft, meatType: value };
    const items = getFilteredItems(rootDir, draft);
    const statusList = buildStatusList(items, 'اختر نوع التجهيز المناسب لهذا القسم 🌿');
    session = await persistSession(rootDir, from, session, { currentState: statusList ? 'awaiting_status' : 'awaiting_item', sessionData: { orderDraft: draft, itemPage: 0 } });
    const result = await sendWhatsAppInteractive(rootDir, to, statusList || itemList(rootDir, draft, 0));
    return json(res, 200, { ok: true, delivered: result, mode: 'type_selected' });
  }

  if (selection.startsWith('category:')) {
    const value = selection.split(':').slice(1).join(':');
    const draft = { ...sessionData.orderDraft, categoryFilter: value };
    if (draft.rootId === 'catering') {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_type', sessionData: { orderDraft: draft } });
      const result = await sendWhatsAppInteractive(rootDir, to, simpleChoiceList('اختر نوع الذبيحة 🌿', 'النوع', 'نوع الذبيحة', [
        { id: 'type:بلدي', title: 'بلدي', description: value },
        { id: 'type:مستورد', title: 'مستورد', description: value }
      ]));
      return json(res, 200, { ok: true, delivered: result, mode: 'catering_type' });
    }
  }

  if (selection.startsWith('status:')) {
    const statusFilter = selection.split(':')[1];
    const draft = { ...sessionData.orderDraft, statusFilter };
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_item', sessionData: { orderDraft: draft, itemPage: 0 } });
    const result = await sendWhatsAppInteractive(rootDir, to, itemList(rootDir, draft, 0));
    return json(res, 200, { ok: true, delivered: result, mode: 'status_selected' });
  }

  if (selection.startsWith('items_page:')) {
    const page = Number(selection.split(':')[1] || 0);
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_item', sessionData: { itemPage: page } });
    const result = await sendWhatsAppInteractive(rootDir, to, itemList(rootDir, sessionData.orderDraft, page));
    return json(res, 200, { ok: true, delivered: result, mode: 'items_page' });
  }

  if (selection.startsWith('item:')) {
    const itemId = selection.split(':')[1];
    const item = getMenuItemById(rootDir, itemId);
    if (!item) {
      const result = await sendWhatsAppText(rootDir, to, 'تعذر العثور على هذا الصنف. اختر من القائمة مرة أخرى.');
      return json(res, 200, { ok: true, delivered: result, mode: 'item_missing' });
    }
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_quantity', sessionData: { pendingItemId: itemId, awaiting: 'quantity' } });
    const result = await sendWhatsAppInteractive(rootDir, to, quantityList(item));
    return json(res, 200, { ok: true, delivered: result, mode: 'quantity_prompt' });
  }

  if (selection === 'qty:text') {
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_quantity_text', sessionData: { awaiting: 'quantity_text' } });
    const result = await sendWhatsAppText(rootDir, to, 'أرسل رقم الكمية التي تريدها الآن، مثل 2 أو 5.');
    return json(res, 200, { ok: true, delivered: result, mode: 'quantity_text_prompt' });
  }

  if (selection.startsWith('qty:')) {
    const quantity = Number(selection.split(':')[1] || 1);
    const item = getMenuItemById(rootDir, sessionData.pendingItemId);
    if (!item) {
      const result = await sendWhatsAppText(rootDir, to, 'تعذر تحديد الصنف الحالي. سنعيدك إلى المنيو.');
      await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: { cart: sessionData.cart, pendingItemId: null, awaiting: null } });
      await sendWhatsAppInteractive(rootDir, to, rootList(rootDir));
      return json(res, 200, { ok: true, delivered: result, mode: 'item_lost' });
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
      sessionData: { cart, pendingItemId: item.record_id, awaiting: extras.length ? 'extra_choice' : null }
    });
    const responsePayload = extras.length ? extrasButtons(item, extras) : cartButtons(cartSummary(cart, sessionData.orderDraft).text);
    const result = await sendWhatsAppInteractive(rootDir, to, responsePayload);
    return json(res, 200, { ok: true, delivered: result, mode: 'item_added' });
  }

  if (selection.startsWith('extra:')) {
    const extraId = selection.split(':')[1];
    let cart = [...(sessionData.cart || [])];
    if (extraId !== 'skip') {
      const extraItem = getMenuItemById(rootDir, extraId);
      if (extraItem) {
        cart.push({
          id: extraItem.record_id,
          displayNameAr: extraItem.display_name_ar || extraItem.item_name_ar,
          unit_ar: extraItem.unit_ar,
          price_1_jod: Number(extraItem.price_1_jod || 0),
          quantity: 1,
          lineTotalJod: Number(extraItem.price_1_jod || 0),
          notes: 'إضافة'
        });
      }
    }
    session = await persistSession(rootDir, from, session, { currentState: 'reviewing_cart', sessionData: { cart, awaiting: null } });
    const result = await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text));
    return json(res, 200, { ok: true, delivered: result, mode: 'extra_handled' });
  }

  if (selection === BUTTON_IDS.ADD_MORE) {
    session = await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: { orderDraft: sessionData.orderDraft } });
    const result = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir));
    return json(res, 200, { ok: true, delivered: result, mode: 'add_more' });
  }

  if (selection === BUTTON_IDS.CLEAR_CART || selection === BUTTON_IDS.EXIT || selection === BUTTON_IDS.CUSTOMER_EXIT) {
    if (openOrder && !TERMINAL_STATUSES.includes(openOrder.status) && session.current_state === 'awaiting_admin_review') {
      await updateOrderStatus(rootDir, openOrder.id, 'customer_exit', 'أغلقه العميل');
      await sendWhatsAppText(rootDir, to, `تم إغلاق طلبك الحالي ${openOrder.id}. إذا رغبت نبدأ من جديد في أي وقت.`);
    } else {
      await sendWhatsAppText(rootDir, to, 'تم إغلاق الطلب الحالي. عندما تكون جاهزًا نبدأ من جديد بكل سرور 🌿');
    }
    session = await persistSession(rootDir, from, session, { currentState: 'main_menu', lastOrderId: null, sessionData: { cart: [], awaiting: null, pendingItemId: null, itemPage: 0, orderDraft: defaultDraft(), lastOrderId: null } });
    await sendWhatsAppInteractive(rootDir, to, mainMenuButtons());
    return json(res, 200, { ok: true, mode: 'flow_exit' });
  }

  if (selection === BUTTON_IDS.CHECKOUT) {
    if (!(sessionData.cart || []).length) {
      const result = await sendWhatsAppText(rootDir, to, 'السلة فارغة حاليًا. أضف صنفًا أولًا.');
      return json(res, 200, { ok: true, delivered: result, mode: 'cart_empty' });
    }
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_day', sessionData: { dayOptions: buildDayOptions(config), lastPrompt: 'day' } });
    const result = await sendWhatsAppInteractive(rootDir, to, dayList(config));
    return json(res, 200, { ok: true, delivered: result, mode: 'day_prompt' });
  }

  if (selection.startsWith('day:')) {
    const offset = Number(selection.split(':')[1] || 0);
    const choice = buildDayOptions(config)[offset];
    if (!choice) {
      const result = await sendWhatsAppText(rootDir, to, 'تعذر تحديد اليوم. أعد المحاولة.');
      return json(res, 200, { ok: true, delivered: result, mode: 'day_error' });
    }
    session = await persistSession(rootDir, from, session, {
      currentState: 'awaiting_slot',
      sessionData: { orderDraft: { deliveryDayLabel: choice.title, deliveryDayIso: choice.dateIso }, lastPrompt: 'slot' }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, slotList(config));
    return json(res, 200, { ok: true, delivered: result, mode: 'slot_prompt' });
  }

  if (selection.startsWith('slot:')) {
    const idx = Number(selection.split(':')[1] || 0);
    const slot = (config.deliveryTimeSlots || [])[idx];
    session = await persistSession(rootDir, from, session, {
      currentState: 'awaiting_delivery_type',
      sessionData: { orderDraft: { deliverySlot: slot }, lastPrompt: 'delivery_type' }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildDeliveryTypeButtons());
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
    const result = await sendWhatsAppText(rootDir, to, `تم اختيار منطقة ${zone.zone_name_ar} ورسوم التوصيل ${money(zone.delivery_fee_jod)} 🌿\nأرسل العنوان بالتفصيل أو شارك الموقع الآن.`);
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
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_notes_text', sessionData: { awaiting: 'notes_text' } });
    const result = await sendWhatsAppText(rootDir, to, 'اكتب الملاحظة التي تريد إضافتها على الطلب الآن.');
    return json(res, 200, { ok: true, delivered: result, mode: 'notes_text_prompt' });
  }

  if (selection === BUTTON_IDS.NOTES_SKIP) {
    session = await persistSession(rootDir, from, session, { currentState: 'review_customer_summary', sessionData: { orderDraft: { notes: null }, awaiting: null } });
    const result = await sendWhatsAppInteractive(rootDir, to, customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, { ...sessionData.orderDraft, notes: null })));
    return json(res, 200, { ok: true, delivered: result, mode: 'customer_summary' });
  }

  if (selection === BUTTON_IDS.CUSTOMER_EDIT) {
    session = await persistSession(rootDir, from, session, { currentState: 'editing_summary' });
    const result = await sendWhatsAppInteractive(rootDir, to, editList());
    return json(res, 200, { ok: true, delivered: result, mode: 'edit_list' });
  }

  if (selection === BUTTON_IDS.EDIT_ITEMS) {
    session = await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: { lastPrompt: 'root' } });
    const result = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir));
    return json(res, 200, { ok: true, delivered: result, mode: 'edit_items' });
  }

  if (selection === BUTTON_IDS.EDIT_SCHEDULE) {
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_day' });
    const result = await sendWhatsAppInteractive(rootDir, to, dayList(config));
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
    const outcome = await createOrUpdateOrderFromDraft(rootDir, from, session, config);
    if (outcome.error) {
      const result = await sendWhatsAppText(rootDir, to, outcome.error);
      return json(res, 200, { ok: true, delivered: result, mode: 'create_order_error' });
    }
    await notifyAdminsNewOrder(rootDir, outcome.order, config);
    const result = await sendWhatsAppText(rootDir, to, `تم استلام طلبك وإرساله للإدارة للمراجعة ✅\nرقم المتابعة الداخلي: ${outcome.order.id}\nسنثبت الطلب بعد اعتماد الإدارة ونرسل لك الحالة مباشرة هنا.`);
    return json(res, 200, { ok: true, delivered: result, mode: 'sent_to_admin' });
  }

  if (type === 'location' && sessionData.awaiting === 'address') {
    const locationText = buildLocationText(message);
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_payment', sessionData: { orderDraft: { address: locationText }, awaiting: null } });
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
    session = await persistSession(rootDir, from, session, { currentState: extras.length ? 'awaiting_extra_choice' : 'reviewing_cart', sessionData: { cart, awaiting: extras.length ? 'extra_choice' : null } });
    const result = await sendWhatsAppInteractive(rootDir, to, extras.length ? extrasButtons(item, extras) : cartButtons(cartSummary(cart, sessionData.orderDraft).text));
    return json(res, 200, { ok: true, delivered: result, mode: 'quantity_text_saved' });
  }

  if (type === 'text' && sessionData.awaiting === 'address') {
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_payment', sessionData: { orderDraft: { address: text }, awaiting: null } });
    const result = await sendWhatsAppInteractive(rootDir, to, paymentButtons());
    return json(res, 200, { ok: true, delivered: result, mode: 'address_saved' });
  }

  if (type === 'text' && sessionData.awaiting === 'notes_text') {
    session = await persistSession(rootDir, from, session, { currentState: 'review_customer_summary', sessionData: { orderDraft: { notes: text }, awaiting: null } });
    const result = await sendWhatsAppInteractive(rootDir, to, customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, { ...sessionData.orderDraft, notes: text })));
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
    return json(res, 200, { ok: false, recovered: true, message: error.message });
  }
}


