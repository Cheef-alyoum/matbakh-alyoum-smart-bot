import crypto from 'node:crypto';
import { parseBody, json, normalizePhone, slugify } from '../utils/core.js';
import { getDeliveryGroupByKey, getDeliveryGroupList, getDeliveryZoneById } from './delivery.service.js';
import {
  getBotRoots,
  getDisplayUnit,
  getItemExtras,
  getItemsForRoot,
  getMenuItemById,
  getRootById,
  getRootCategoryOptions,
  getRootStatusOptions,
  getRootTypeOptions,
  resolveRootId
} from './menu.service.js';
import {
  createOrder,
  generateNextOrderCode,
  getCampaignAudiencePreview,
  getConversationSession,
  getCustomerProfileSummary,
  getLatestOpenOrderByPhone,
  getOperationalReport,
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

  ADMIN_HOME: 'admin_home',
  ADMIN_ORDERS: 'admin_orders',
  ADMIN_REPORTS: 'admin_reports',
  ADMIN_CAMPAIGNS: 'admin_campaigns',
  ADMIN_ORDERS_NEW: 'orders_new',
  ADMIN_ORDERS_FOLLOW: 'orders_follow',
  ADMIN_ORDERS_SEARCH: 'orders_search',
  ADMIN_REPORT_TODAY: 'report_today',
  ADMIN_REPORT_WEEK: 'report_week',
  ADMIN_REPORT_MONTH: 'report_month',
  ADMIN_CAMPAIGN_NEW: 'campaign_new',
  ADMIN_CAMPAIGN_SCHEDULE: 'campaign_schedule',
  ADMIN_CAMPAIGN_GROUPS: 'campaign_groups',

  ADMIN_APPROVE: 'admin_approve',
  ADMIN_MODIFY: 'admin_modify',
  ADMIN_REJECT: 'admin_reject',
  ADMIN_PREPARING: 'admin_preparing',
  ADMIN_READY: 'admin_ready',
  ADMIN_OUT: 'admin_out',
  ADMIN_DELIVERED: 'admin_delivered'
};

const TERMINAL_STATUSES = ['delivered', 'cancelled', 'rejected', 'customer_exit'];
const TRACK_TERMS = /(حاله|حالة|متابعه|متابعة|track|tracking|status|طلبي|الطلب|وين طلبي|وين الطلب|طلبي وين)/i;

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
    phone: process.env.WHATSAPP_HUMAN_ESCALATION_NUMBER || config?.site?.businessPhoneDisplay || ''
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

function shortButton(title, max = 20) {
  return String(title || '').trim().slice(0, max);
}

function normalizeUserText(value = '') {
  return String(value || '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/🌿|✅|🚚|👨‍🍳/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelFromStatus(status) {
  return {
    awaiting_admin_review: 'بانتظار اعتماد الإدارة',
    awaiting_customer_edit: 'بانتظار التعديل',
    approved: 'تم اعتماد الطلب',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    out_for_delivery: 'قيد التوصيل',
    delivered: 'تم التسليم',
    rejected: 'مرفوض',
    customer_exit: 'مغلق'
  }[status] || 'قيد المتابعة';
}

function mapPrepStatusToCustomer(status, orderId, notes = '') {
  if (status === 'approved') {
    return `تم اعتماد طلبك ✅\nرقم الطلب: ${orderId}\nطريقة الدفع: الدفع عند الاستلام - كاش\nسنرسل لك التحديثات هنا حتى التسليم.`;
  }
  if (status === 'awaiting_customer_edit') {
    return `طلبك يحتاج تعديلًا بسيطًا قبل الاعتماد 🌿\nسنرتب معك التعديل هنا مباشرة.${notes ? `\n\nملاحظة الإدارة: ${notes}` : ''}`;
  }
  if (status === 'rejected') {
    return `نعتذر منك، لم يتم اعتماد الطلب الحالي.${notes ? `\n\n${notes}` : ''}`;
  }
  if (status === 'preparing') return `طلبك الآن قيد التحضير 👨‍🍳\nرقم الطلب: ${orderId}`;
  if (status === 'ready') return `طلبك أصبح جاهزًا ✅\nرقم الطلب: ${orderId}`;
  if (status === 'out_for_delivery') return `طلبك قيد التوصيل الآن 🚚\nرقم الطلب: ${orderId}`;
  if (status === 'delivered') return 'تم تسليم طلبك بنجاح ✅\nنتمنى لك وجبة هنيّة.';
  return `حالة طلبك الحالية: ${labelFromStatus(status)}\nرقم الطلب: ${orderId}`;
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

function baseUnitLabel(item) {
  return getDisplayUnit(item);
}

function quantityButtonLabel(item, quantity) {
  const unit = baseUnitLabel(item);
  if (unit === 'طلب') return `${quantity} طلب`;
  return shortButton(`${quantity} ${unit}`);
}

function defaultDraft() {
  return {
    rootId: null,
    meatType: null,
    statusFilter: null,
    categoryFilter: null,
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
    pendingItemId: raw.pendingItemId || null,
    pendingExtras: Array.isArray(raw.pendingExtras) ? raw.pendingExtras : [],
    awaiting: raw.awaiting || null,
    dayOptions: Array.isArray(raw.dayOptions) ? raw.dayOptions : [],
    lastOrderId: session?.last_order_id || raw.lastOrderId || null,
    orderDraft: { ...defaultDraft(), ...(raw.orderDraft || {}) }
  };
}

function mergeSessionData(session, patch = {}) {
  const current = readSessionData(session);
  return {
    cart: patch.cart !== undefined ? patch.cart : current.cart,
    pendingItemId: patch.pendingItemId !== undefined ? patch.pendingItemId : current.pendingItemId,
    pendingExtras: patch.pendingExtras !== undefined ? patch.pendingExtras : current.pendingExtras,
    awaiting: patch.awaiting !== undefined ? patch.awaiting : current.awaiting,
    dayOptions: patch.dayOptions !== undefined ? patch.dayOptions : current.dayOptions,
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
    lastMenuSection: patch.lastMenuSection || patch.last_menu_section || mergedData.orderDraft.rootId || session?.last_menu_section || null,
    lastOrderId: patch.lastOrderId || patch.last_order_id || mergedData.lastOrderId || session?.last_order_id || null,
    sessionData: mergedData
  });
}

function resetDraftKeepingSession() {
  return {
    cart: [],
    pendingItemId: null,
    pendingExtras: [],
    awaiting: null,
    dayOptions: [],
    orderDraft: defaultDraft()
  };
}

function welcomeButtons(returning = false, language = 'ar') {
  const body = returning
    ? 'يسعدنا تواصلك معنا من جديد 🌿\nجاهزون لترتيب طلبك بسرعة. اختر اللغة أو اطلب موظفًا.'
    : 'أهلًا وسهلًا بك في مطبخ اليوم المركزي 🌿\nأكل بيتي محلي بطعم أصيل وجودة مرتبة. اختر اللغة أو اطلب موظفًا.';

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
      ? 'Do you agree to receive service updates and offers related to your orders?'
      : 'قبل المتابعة 🌿\nهل توافق على استقبال تحديثات الخدمة والعروض المرتبطة بطلباتك؟',
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
      ? 'Choose what you want and we will continue step by step.'
      : 'كيف نقدر نخدمك اليوم؟ اختر المسار المناسب وسنكمل خطوة بخطوة 🌿',
    buttons: [
      { id: BUTTON_IDS.START_ORDER, title: language === 'en' ? 'Order' : 'اطلب الآن' },
      { id: BUTTON_IDS.TRACK_ORDER, title: language === 'en' ? 'Track' : 'تتبع طلبي' },
      { id: BUTTON_IDS.HUMAN, title: language === 'en' ? 'Agent' : 'موظف' }
    ]
  };
}

function paginateRows(rows, page = 0, pageSize = 9, moreIdFactory = () => '') {
  const start = page * pageSize;
  const subset = rows.slice(start, start + pageSize);
  if (start + pageSize < rows.length) {
    subset.push({
      id: moreIdFactory(page + 1),
      title: 'المزيد',
      description: 'عرض خيارات إضافية'
    });
  }
  return subset;
}

function listMessage(body, buttonText, title, rows) {
  return {
    type: 'list',
    body,
    buttonText,
    sections: [{ title, rows }]
  };
}

function rootList(rootDir, page = 0) {
  const roots = getBotRoots(rootDir);
  const rows = paginateRows(
    roots.map(root => ({
      id: `root:${root.id}`,
      title: shortButton(root.title),
      description: `${root.description} — ${root.count} صنف`
    })),
    page,
    9,
    nextPage => `roots_page:${nextPage}`
  );

  return listMessage(
    'تفضل منيو مطبخ اليوم المركزي 🌿\nاختر القسم المناسب ثم نكمل مثل تطبيقات الطلب خطوة بخطوة.',
    'الأقسام',
    'الأقسام الرئيسية',
    rows
  );
}

function statusButtonsForRoot(rootTitle = 'القسم', statusOptions = []) {
  const buttons = statusOptions.slice(0, 3).map(option => ({
    id: `status:${option.value}`,
    title: shortButton(option.label)
  }));

  return {
    type: 'button',
    body: `اختر الحالة المطلوبة داخل ${rootTitle} 🌿`,
    buttons: buttons.length ? buttons : [{ id: BUTTON_IDS.EXIT, title: 'خروج' }]
  };
}

function typeButtonsForRoot(rootTitle = 'القسم', typeOptions = []) {
  const buttons = typeOptions.slice(0, 3).map(option => ({
    id: `type:${slugify(option.value)}`,
    title: shortButton(option.label)
  }));

  return {
    type: 'button',
    body: `اختر النوع المناسب داخل ${rootTitle} 🌿`,
    buttons: buttons.length ? buttons : [{ id: BUTTON_IDS.EXIT, title: 'خروج' }]
  };
}

function categoryListForRoot(rootTitle = 'القسم', rootId, options = [], page = 0) {
  const rows = paginateRows(
    options.map(option => ({
      id: `category:${rootId}:${slugify(option.value)}`,
      title: shortButton(option.label),
      description: `${option.count} صنف`
    })),
    page,
    9,
    nextPage => `category_page:${rootId}:${nextPage}`
  );

  return listMessage(
    `اختر التصنيف المناسب داخل ${rootTitle} 🌿`,
    'التصنيفات',
    rootTitle,
    rows
  );
}

function itemList(rootDir, filters = {}, page = 0) {
  const items = getItemsForRoot(rootDir, filters);
  const rows = paginateRows(
    items.map(item => ({
      id: `item:${item.record_id}`,
      title: shortButton(item.item_name_ar || item.display_name_ar),
      description: `${money(item.price_1_jod)} — ${baseUnitLabel(item)}`
    })),
    page,
    9,
    nextPage => `items_page:${nextPage}`
  );

  return listMessage(
    'اختر الصنف المناسب، وبعدها ننتقل للكمية والإضافات 🌿',
    'الأصناف',
    'الأصناف',
    rows
  );
}

function quantityButtons(item) {
  return {
    type: 'button',
    body: `${item.display_name_ar || item.item_name_ar}\nالسعر: ${money(item.price_1_jod)} للوحدة\nالوحدة: ${baseUnitLabel(item)}\nاختر الكمية المطلوبة.`,
    buttons: [
      { id: `qty:${item.record_id}:1`, title: quantityButtonLabel(item, 1) },
      { id: `qty:${item.record_id}:2`, title: quantityButtonLabel(item, 2) },
      { id: `qty:${item.record_id}:3`, title: quantityButtonLabel(item, 3) }
    ]
  };
}

function extrasList(item, extras = []) {
  const rows = extras.map(extra => ({
    id: `extra:${item.record_id}:${extra.id}`,
    title: shortButton(extra.label),
    description: `${money(extra.price)}`
  }));

  rows.push({
    id: BUTTON_IDS.ADD_MORE,
    title: 'بدون إضافة',
    description: 'الانتقال للسلة'
  });

  return listMessage(
    `هل تريد إضافة شيء على ${item.item_name_ar || item.display_name_ar}؟`,
    'الإضافات',
    'الإضافات',
    rows
  );
}

function cartSummary(cart = [], draft = {}) {
  const subtotal = (cart || []).reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = Number(draft.deliveryFeeJod || 0);
  const total = subtotal + deliveryFee;
  const lines = cart.map((item, index) => {
    const extrasLabel = item.extras?.length ? ` + ${item.extras.map(extra => extra.label).join(' + ')}` : '';
    return `${index + 1}. ${item.displayNameAr} × ${item.quantity}${extrasLabel} = ${money(item.lineTotalJod)}`;
  });

  return {
    subtotal,
    deliveryFee,
    total,
    text: `سلة الطلب 🌿\n\n${lines.join('\n') || 'لا توجد أصناف'}\n\n${deliveryFee ? `رسوم التوصيل: ${money(deliveryFee)}\n` : ''}الإجمالي الحالي: ${money(total)}`
  };
}

function cartButtons(summaryText) {
  return {
    type: 'button',
    body: `${summaryText}\n\nاختر الخطوة التالية.`,
    buttons: [
      { id: BUTTON_IDS.ADD_MORE, title: 'إضافة' },
      { id: BUTTON_IDS.CHECKOUT, title: 'متابعة' },
      { id: BUTTON_IDS.CLEAR_CART, title: 'إلغاء' }
    ]
  };
}

function dayList() {
  const now = new Date();
  const rows = [];
  for (let i = 0; i < 5; i += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const label = i === 0
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

  return listMessage(
    'اختر اليوم المناسب للتنفيذ أو التوصيل 🌿',
    'الأيام',
    'الأيام المتاحة',
    rows
  );
}

function slotList(config) {
  const slots = config?.deliveryTimeSlots || config?.orderWindow?.deliveryTimeSlots || [
    '10:00 - 12:00',
    '12:00 - 14:00',
    '14:00 - 16:00',
    '16:00 - 18:00'
  ];

  return listMessage(
    'اختر الوقت المناسب 🌿',
    'الأوقات',
    'أوقات التوصيل',
    slots.map(slot => ({
      id: `slot:${slot}`,
      title: shortButton(slot),
      description: 'موعد التنفيذ'
    }))
  );
}

function deliveryTypeButtons() {
  return {
    type: 'button',
    body: 'هل تريد توصيل أم استلام؟',
    buttons: [
      { id: BUTTON_IDS.DELIVERY, title: 'توصيل' },
      { id: BUTTON_IDS.PICKUP, title: 'استلام' },
      { id: BUTTON_IDS.EXIT, title: 'خروج' }
    ]
  };
}

function compactRegionTitle(value = '', max = 24) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*/g, ' - ')
    .trim();

  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function normalizeSectorLabel(group = {}) {
  const raw = String(group.title || group.group || '').trim();

  const directMap = new Map([
    ['شمال عمان', 'شمال عمّان'],
    ['جنوب عمان', 'جنوب عمّان'],
    ['شرق عمان', 'شرق عمّان'],
    ['غرب عمان', 'غرب عمّان'],
    ['شمال عمّان', 'شمال عمّان'],
    ['جنوب عمّان', 'جنوب عمّان'],
    ['شرق عمّان', 'شرق عمّان'],
    ['غرب عمّان', 'غرب عمّان'],
    ['الزرقاء', 'الزرقاء'],
    ['السلط', 'السلط'],
    ['جرش', 'جرش'],
    ['عجلون', 'عجلون'],
    ['الأغوار الوسطى', 'الأغوار الوسطى']
  ]);

  if (directMap.has(raw)) return directMap.get(raw);

  const normalized = raw
    .replace(/محافظة/g, '')
    .replace(/منطقة/g, '')
    .replace(/قطاع/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/شمال.*عمان|عمان.*شمال/i.test(normalized)) return 'شمال عمّان';
  if (/جنوب.*عمان|عمان.*جنوب/i.test(normalized)) return 'جنوب عمّان';
  if (/شرق.*عمان|عمان.*شرق/i.test(normalized)) return 'شرق عمّان';
  if (/غرب.*عمان|عمان.*غرب/i.test(normalized)) return 'غرب عمّان';
  if (/زرقاء/.test(normalized)) return 'الزرقاء';
  if (/سلط/.test(normalized)) return 'السلط';
  if (/جرش/.test(normalized)) return 'جرش';
  if (/عجلون/.test(normalized)) return 'عجلون';
  if (/اغوار|أغوار/.test(normalized)) return 'الأغوار الوسطى';

  return compactRegionTitle(normalized || 'القطاع');
}

function zoneTitleShort(zone = {}) {
  const raw = String(zone.zone_name_ar || '').trim();

  const replacements = [
    [/شفا بدران ابو نصير جبيهة/gi, 'شفا بدران / أبو نصير'],
    [/شفا بدران\s*\/?\s*ابو نصير\s*\/?\s*جبيهة/gi, 'شفا بدران / أبو نصير'],
    [/عبدالله غوشة/gi, 'عبدالله غوشة'],
    [/شارع الجامعة/gi, 'شارع الجامعة'],
    [/الدوار السابع/gi, 'السابع'],
    [/الدوار الخامس/gi, 'الخامس']
  ];

  let text = raw;
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return compactRegionTitle(text || 'المنطقة');
}

function zoneDescription(zone = {}) {
  const fee = money(zone.delivery_fee_jod || 0);
  const fullName = String(zone.zone_name_ar || 'المنطقة').trim();
  return `${fullName} • رسوم ${fee}`.slice(0, 72);
}

function sectorList(rootDir) {
  const groups = getDeliveryGroupList(rootDir);
  const rows = paginateRows(
    groups.map(group => ({
      id: `sector:${group.key}:0`,
      title: shortButton(normalizeSectorLabel(group), 24),
      description: `${group.count} منطقة`
    })),
    0,
    9,
    nextPage => `sector_page:${nextPage}`
  );

  return listMessage(
    'اختر المنطقة الرئيسية أولًا 🌿',
    'المناطق',
    'المناطق الرئيسية',
    rows
  );
}

function zoneList(rootDir, sectorKey, page = 0) {
  const group = getDeliveryGroupByKey(rootDir, sectorKey);
  const zones = group?.zones || [];
  const rows = paginateRows(
    zones.map(zone => ({
      id: `zone:${zone.zone_id}`,
      title: shortButton(zoneTitleShort(zone), 24),
      description: zoneDescription(zone)
    })),
    page,
    9,
    nextPage => `sector:${sectorKey}:${nextPage}`
  );

  return listMessage(
    `اختر المنطقة داخل ${normalizeSectorLabel(group)} 🌿`,
    'المناطق',
    normalizeSectorLabel(group),
    rows
  );
}

function paymentButtons() {
  return {
    type: 'button',
    body: 'اختر طريقة الدفع المناسبة.',
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
    'ملخص الطلب النهائي 🌿',
    '',
    ...cart.map((item, index) => {
      const extrasLabel = item.extras?.length ? ` + ${item.extras.map(extra => extra.label).join(' + ')}` : '';
      return `${index + 1}. ${item.displayNameAr} × ${item.quantity}${extrasLabel} = ${money(item.lineTotalJod)}`;
    }),
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
  return listMessage(
    'اختر الجزء الذي تريد تعديله 🌿',
    'التعديل',
    'التعديل',
    [
      { id: BUTTON_IDS.EDIT_ITEMS, title: 'الأصناف', description: 'إضافة أو تعديل الأصناف' },
      { id: BUTTON_IDS.EDIT_SCHEDULE, title: 'الموعد', description: 'تعديل اليوم أو الوقت' },
      { id: BUTTON_IDS.EDIT_ZONE, title: 'المنطقة', description: 'تعديل المنطقة والعنوان' },
      { id: BUTTON_IDS.EDIT_NOTES, title: 'الملاحظات', description: 'تعديل الملاحظات' }
    ]
  );
}

/* =========================
   ADMIN UI
========================= */

function adminHomeButtons() {
  return {
    type: 'button',
    body: 'لوحة إدارة مطبخ اليوم المركزي 🌿\nاختر الإجراء المطلوب.',
    buttons: [
      { id: BUTTON_IDS.ADMIN_ORDERS, title: 'الطلبات' },
      { id: BUTTON_IDS.ADMIN_REPORTS, title: 'التقارير' },
      { id: BUTTON_IDS.ADMIN_CAMPAIGNS, title: 'الحملات' }
    ]
  };
}

function adminOrdersButtons() {
  return {
    type: 'button',
    body: 'إدارة الطلبات 🌿\nاختر المسار المناسب.',
    buttons: [
      { id: BUTTON_IDS.ADMIN_ORDERS_NEW, title: 'جديدة' },
      { id: BUTTON_IDS.ADMIN_ORDERS_FOLLOW, title: 'متابعة' },
      { id: BUTTON_IDS.ADMIN_ORDERS_SEARCH, title: 'بحث' }
    ]
  };
}

function adminReportsButtons() {
  return {
    type: 'button',
    body: 'التقارير الإدارية 🌿\nاختر نوع التقرير.',
    buttons: [
      { id: BUTTON_IDS.ADMIN_REPORT_TODAY, title: 'اليوم' },
      { id: BUTTON_IDS.ADMIN_REPORT_WEEK, title: 'الأسبوع' },
      { id: BUTTON_IDS.ADMIN_REPORT_MONTH, title: 'الشهر' }
    ]
  };
}

function adminCampaignButtons() {
  return {
    type: 'button',
    body: 'إدارة الحملات والعروض 🌿\nاختر الإجراء المطلوب.',
    buttons: [
      { id: BUTTON_IDS.ADMIN_CAMPAIGN_NEW, title: 'عرض جديد' },
      { id: BUTTON_IDS.ADMIN_CAMPAIGN_SCHEDULE, title: 'جدولة' },
      { id: BUTTON_IDS.ADMIN_CAMPAIGN_GROUPS, title: 'المجموعات' }
    ]
  };
}

function adminFollowupList() {
  return listMessage(
    'اختر الحالة التي تريد متابعتها 🌿',
    'الحالات',
    'متابعة الطلبات',
    [
      { id: 'admin_follow_status:awaiting_admin_review', title: 'بانتظار الاعتماد', description: 'طلبات جديدة' },
      { id: 'admin_follow_status:awaiting_customer_edit', title: 'بانتظار التعديل', description: 'بحاجة تواصل' },
      { id: 'admin_follow_status:approved', title: 'تم الاعتماد', description: 'اعتماد من الإدارة' },
      { id: 'admin_follow_status:preparing', title: 'قيد التحضير', description: 'داخل المطبخ' },
      { id: 'admin_follow_status:ready', title: 'جاهز', description: 'جاهز للتسليم' },
      { id: 'admin_follow_status:out_for_delivery', title: 'قيد التوصيل', description: 'مع السائق' }
    ]
  );
}

function adminGroupsList() {
  return listMessage(
    'اختر المجموعة المستهدفة 🌿',
    'المجموعات',
    'المجموعات',
    [
      { id: 'admin_group:all', title: 'جميع العملاء', description: 'إرسال عام' },
      { id: 'admin_group:returning', title: 'المتكررون', description: 'العملاء العائدون' },
      { id: 'admin_group:new', title: 'الجدد', description: 'العملاء الجدد' },
      { id: 'admin_group:inactive', title: 'غير النشطين', description: 'إعادة تنشيط' },
      { id: 'admin_group:zone', title: 'حسب المنطقة', description: 'تقسيم جغرافي' },
      { id: 'admin_group:value', title: 'حسب الإنفاق', description: 'الأعلى إنفاقًا' }
    ]
  );
}

function adminViewOrdersList(title, rows) {
  return listMessage(
    `اختر الطلب المطلوب من ${title} 🌿`,
    'الطلبات',
    title,
    rows
  );
}

function buildAdminOrderViewRows(orders = []) {
  return orders.map(order => ({
    id: `admin_view:${order.id}`,
    title: shortButton(order.id, 24),
    description: `${order.phone || '-'} • ${money(order.total_jod || order.totalJod || 0)}`.slice(0, 72)
  }));
}

function buildAdminOrderSummary(order, items = []) {
  const lines = [
    `رقم الطلب: ${order.id}`,
    `الهاتف: ${order.phone || '-'}`,
    `الحالة: ${labelFromStatus(order.status)}`,
    order.customer_name ? `الاسم: ${order.customer_name}` : null,
    '',
    ...(items || []).map((item, index) => `${index + 1}. ${item.display_name_ar} × ${item.quantity} = ${money(item.line_total_jod || item.lineTotalJod)}`),
    '',
    order.delivery_day ? `اليوم: ${order.delivery_day}` : null,
    order.delivery_slot ? `الوقت: ${order.delivery_slot}` : null,
    order.delivery_type ? `النوع: ${order.delivery_type === 'pickup' ? 'استلام' : 'توصيل'}` : null,
    order.delivery_zone_name ? `المنطقة: ${order.delivery_zone_name}` : null,
    order.address_text ? `العنوان: ${order.address_text}` : null,
    order.payment_method ? `الدفع: ${order.payment_method}` : null,
    order.order_notes ? `الملاحظات: ${order.order_notes}` : null,
    `الإجمالي: ${money(order.total_jod || order.totalJod || 0)}`
  ].filter(Boolean);

  return lines.join('\n');
}

function buildMessagesPhonesText(phones = [], limit = 15) {
  if (!phones.length) return 'لا توجد أرقام مراسلات في هذه الفترة.';
  const rows = phones.slice(0, limit).map((item, index) => {
    const lastAt = item.last_at ? String(item.last_at).replace('T', ' ').slice(0, 16) : '-';
    return `${index + 1}. ${item.phone}\n   إجمالي: ${item.total} | وارد: ${item.inbound} | صادر: ${item.outbound}\n   آخر تفاعل: ${lastAt}`;
  });
  return rows.join('\n');
}

function buildAudiencePreviewText(preview = {}) {
  const lines = [
    `معاينة المجموعة: ${preview.label || preview.groupKey || '-'}`,
    `عدد الأرقام: ${preview.count || 0}`
  ];

  if (preview.groupKey === 'zone' && Array.isArray(preview.zones)) {
    lines.push('', 'أهم المناطق:');
    for (const zone of preview.zones.slice(0, 10)) {
      lines.push(`- ${zone.zone}: ${zone.count}`);
    }
    return lines.join('\n');
  }

  if (Array.isArray(preview.sample) && preview.sample.length) {
    lines.push('', 'عينة من الأرقام:');
    for (const item of preview.sample.slice(0, 10)) {
      lines.push(`- ${item.phone} | طلبات: ${item.orders_count} | إنفاق: ${money(item.total_spent_jod || 0)}`);
    }
  }

  return lines.join('\n');
}

async function sendAdminPendingOrders(rootDir, to) {
  const orders = await getOrdersByStatus(rootDir, 'awaiting_admin_review');
  if (!orders.length) {
    return sendWhatsAppText(rootDir, to, 'لا توجد طلبات بانتظار الاعتماد حاليًا.');
  }
  return sendWhatsAppInteractive(rootDir, to, adminViewOrdersList('الطلبات الجديدة', buildAdminOrderViewRows(orders.slice(0, 10))));
}

async function sendAdminOrdersByStatus(rootDir, to, status) {
  const orders = await getOrdersByStatus(rootDir, status);
  if (!orders.length) {
    return sendWhatsAppText(rootDir, to, `لا توجد طلبات ضمن حالة: ${labelFromStatus(status)} حاليًا.`);
  }
  return sendWhatsAppInteractive(rootDir, to, adminViewOrdersList(labelFromStatus(status), buildAdminOrderViewRows(orders.slice(0, 10))));
}

async function sendAdminOrderDetails(rootDir, to, orderId) {
  const order = await getOrderById(rootDir, orderId);
  if (!order) {
    return sendWhatsAppText(rootDir, to, 'تعذر العثور على الطلب المطلوب.');
  }
  const items = await getOrderItems(rootDir, orderId);
  await sendWhatsAppText(rootDir, to, buildAdminOrderSummary(order, items));
  return sendWhatsAppInteractive(rootDir, to, adminDecisionButtons(orderId));
}

async function sendAdminQuickReport(rootDir, to, periodLabel, periodKey) {
  const report = await getOperationalReport(rootDir, periodKey);

  const body = [
    `تقرير ${periodLabel} 🌿`,
    '',
    `إجمالي الطلبات: ${report.orders.total}`,
    `بانتظار الاعتماد: ${report.orders.awaiting_admin_review}`,
    `بانتظار التعديل: ${report.orders.awaiting_customer_edit}`,
    `تم الاعتماد: ${report.orders.approved}`,
    `قيد التحضير: ${report.orders.preparing}`,
    `جاهز: ${report.orders.ready}`,
    `قيد التوصيل: ${report.orders.out_for_delivery}`,
    `تم التسليم: ${report.orders.delivered}`,
    `مرفوض: ${report.orders.rejected}`,
    '',
    `إجمالي مبيعات الطلبات المسلّمة: ${money(report.orders.delivered_sales_jod)}`,
    '',
    `إجمالي المراسلات: ${report.messages.total}`,
    `الواردة: ${report.messages.inbound}`,
    `الصادرة: ${report.messages.outbound}`,
    `عدد الأرقام المتفاعلة: ${report.messages.unique_phones}`,
    '',
    'الأرقام المتفاعلة:',
    buildMessagesPhonesText(report.messages.phones)
  ].join('\n');

  return sendWhatsAppText(rootDir, to, body);
}

async function sendCampaignAudiencePreview(rootDir, to, groupKey) {
  const preview = await getCampaignAudiencePreview(rootDir, groupKey);
  return sendWhatsAppText(rootDir, to, `${buildAudiencePreviewText(preview)}\n\nملاحظة: الإرسال الجماعي الفعلي خارج نافذة 24 ساعة يحتاج قوالب واتساب معتمدة.`);
}

/* =========================
   EXISTING ADMIN ORDER FLOW
========================= */

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
  const normalized = normalizeUserText(text);

  if (!normalized) return 'empty';

  if (/^(مرحبا|السلام عليكم|السلام عليكم ورحمه الله|اهلا|اهلا وسهلا|هلا|hello|hi|hey)\b/.test(normalized)) {
    return 'welcome';
  }

  if (
    /(المنيو|القائمه|الاصناف|الاقسام|عرض المنيو|اعرض المنيو)/.test(normalized) ||
    /(^|\s)(menu|show menu|catalog)(\s|$)/.test(normalized)
  ) {
    return 'menu';
  }

  if (
    /(اطلب|ابدا الطلب|طلب جديد|بدي اطلب|ابغى اطلب|اريد الطلب|اريد اطلب)/.test(normalized) ||
    /(^|\s)(order|start order|new order|buy)(\s|$)/.test(normalized)
  ) {
    return 'order';
  }

  if (
    /(موظف|خدمه العملاء|الدعم|تواصل مباشر)/.test(normalized) ||
    /(^|\s)(agent|human|support|customer service)(\s|$)/.test(normalized)
  ) {
    return 'human';
  }

  if (TRACK_TERMS.test(text) || /(وين طلبي|وين الطلب|طلبي وين)/.test(normalized)) {
    return 'track';
  }

  return 'text';
}

function readIncomingSelection(message, rootDir = '') {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    return message.interactive.button_reply?.id || '';
  }

  if (message.type === 'interactive' && message.interactive?.type === 'list_reply') {
    return message.interactive.list_reply?.id || '';
  }

  const rawText = String(message.text?.body || '').trim();
  const simple = normalizeUserText(rawText);

  if (!simple) return '';

  const exactMap = {
    العربيه: BUTTON_IDS.AR,
    عربي: BUTTON_IDS.AR,
    arabic: BUTTON_IDS.AR,
    english: BUTTON_IDS.EN,
    انجليزي: BUTTON_IDS.EN,
    انجليزيه: BUTTON_IDS.EN,
    اوافق: BUTTON_IDS.CONSENT_YES,
    خدمه: BUTTON_IDS.CONSENT_SERVICE_ONLY,
    'خدمه فقط': BUTTON_IDS.CONSENT_SERVICE_ONLY,
    'لا اوافق': BUTTON_IDS.CONSENT_NO,
    اطلب: BUTTON_IDS.START_ORDER,
    'اطلب الان': BUTTON_IDS.START_ORDER,
    'ابدا الطلب': BUTTON_IDS.START_ORDER,
    'طلب جديد': BUTTON_IDS.START_ORDER,
    المنيو: BUTTON_IDS.SHOW_MENU,
    القائمه: BUTTON_IDS.SHOW_MENU,
    الاقسام: BUTTON_IDS.SHOW_MENU,
    الاصناف: BUTTON_IDS.SHOW_MENU,
    تتبع: BUTTON_IDS.TRACK_ORDER,
    متابعه: BUTTON_IDS.TRACK_ORDER,
    'تتبع طلبي': BUTTON_IDS.TRACK_ORDER,
    موظف: BUTTON_IDS.HUMAN,
    'موظف مباشر': BUTTON_IDS.HUMAN,
    اضافه: BUTTON_IDS.ADD_MORE,
    'متابعه السله': BUTTON_IDS.CHECKOUT,
    'متابعه الطلب': BUTTON_IDS.TRACK_ORDER,
    الغاء: BUTTON_IDS.CLEAR_CART,
    توصيل: BUTTON_IDS.DELIVERY,
    استلام: BUTTON_IDS.PICKUP,
    كاش: BUTTON_IDS.PAY_CASH,
    ملاحظات: BUTTON_IDS.NOTES_ADD,
    'بدون ملاحظات': BUTTON_IDS.NOTES_SKIP,
    تاكيد: BUTTON_IDS.CUSTOMER_CONFIRM,
    تعديل: BUTTON_IDS.CUSTOMER_EDIT,
    خروج: BUTTON_IDS.EXIT,
    الموعد: BUTTON_IDS.EDIT_SCHEDULE,
    المنطقه: BUTTON_IDS.EDIT_ZONE,
    الملاحظات: BUTTON_IDS.EDIT_NOTES
  };

  if (exactMap[simple]) return exactMap[simple];

  if (
    /(المنيو|القائمه|الاصناف|الاقسام|عرض المنيو|اعرض المنيو)/.test(simple) ||
    /(^|\s)(menu|show menu|catalog)(\s|$)/.test(simple)
  ) {
    return BUTTON_IDS.SHOW_MENU;
  }

  if (
    /(اطلب|ابدا الطلب|طلب جديد|بدي اطلب|ابغى اطلب|اريد الطلب|اريد اطلب)/.test(simple) ||
    /(^|\s)(order|start order|new order|buy)(\s|$)/.test(simple)
  ) {
    return BUTTON_IDS.START_ORDER;
  }

  if (TRACK_TERMS.test(simple) || /(وين طلبي|وين الطلب|طلبي وين)/.test(simple)) {
    return BUTTON_IDS.TRACK_ORDER;
  }

  if (
    /(موظف|خدمه العملاء|الدعم|تواصل مباشر)/.test(simple) ||
    /(^|\s)(agent|human|support|customer service)(\s|$)/.test(simple)
  ) {
    return BUTTON_IDS.HUMAN;
  }

  if (rootDir && rawText) {
    const directItem = getMenuItemById(rootDir, rawText);
    if (directItem) return `item:${directItem.record_id}`;
  }

  return '';
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
      Authorization: `Bearer ${accessToken}`
    },
    body: Buffer.from(requestBody, 'utf8')
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('WHATSAPP_API_ERROR', {
      status: response.status,
      data,
      payload: JSON.parse(requestBody)
    });
  }

  return { status: response.status, data };
}

async function sendWhatsAppText(rootDir, to, body) {
  const result = await sendWhatsAppPayload(to, { type: 'text', text: { body } });
  logWebhook('OUTGOING_TEXT', { to, status: result.status || null, body });

  try {
    await saveOutgoingMessage(rootDir, {
      id: crypto.randomUUID(),
      to,
      type: 'text',
      text: body,
      payload: result.data || null
    });
  } catch (error) {
    console.error('MESSAGES_LOG_SUPABASE_ERROR', error);
  }

  return result;
}

function normalizeInteractivePayload(interactive) {
  if (!interactive || !interactive.type) {
    throw new Error('INTERACTIVE_PAYLOAD_MISSING');
  }

  if (interactive.type === 'button') {
    return {
      type: 'button',
      body: {
        text: String(interactive.body || '').slice(0, 1024)
      },
      action: {
        buttons: (interactive.buttons || []).slice(0, 3).map(button => ({
          type: 'reply',
          reply: {
            id: String(button.id || '').slice(0, 256),
            title: shortButton(button.title || '')
          }
        }))
      }
    };
  }

  if (interactive.type === 'list') {
    return {
      type: 'list',
      body: {
        text: String(interactive.body || '').slice(0, 1024)
      },
      action: {
        button: shortButton(interactive.buttonText || 'عرض'),
        sections: (interactive.sections || []).slice(0, 10).map(section => ({
          title: shortButton(section.title || 'خيارات'),
          rows: (section.rows || []).slice(0, 10).map(row => ({
            id: String(row.id || '').slice(0, 200),
            title: shortButton(row.title || '', 24),
            description: String(row.description || '').slice(0, 72)
          }))
        }))
      }
    };
  }

  throw new Error(`INTERACTIVE_TYPE_UNSUPPORTED:${interactive.type}`);
}

function interactiveFallbackText(interactive) {
  if (!interactive) {
    return 'أهلًا وسهلًا بك في مطبخ اليوم المركزي 🌿\nاكتب ما تحتاجه وسنكمل معك مباشرة.';
  }

  if (interactive.type === 'button') {
    const lines = (interactive.buttons || []).map((button, index) => `${index + 1}- ${button.title}`);
    return `${String(interactive.body || '').trim()}\n\n${lines.join('\n')}\n\nاكتب الخيار نصًا كما يظهر أمامك.`;
  }

  if (interactive.type === 'list') {
    const rows = (interactive.sections || []).flatMap(section => section.rows || []);
    const lines = rows.map((row, index) => `${index + 1}- ${row.title}${row.description ? ` — ${row.description}` : ''}`);
    return `${String(interactive.body || '').trim()}\n\n${lines.join('\n')}\n\nاكتب اسم الخيار المطلوب نصًا.`;
  }

  return 'أهلًا وسهلًا بك في مطبخ اليوم المركزي 🌿\nاكتب ما تحتاجه وسنكمل معك مباشرة.';
}

async function sendWhatsAppInteractive(rootDir, to, interactive) {
  let normalized;

  try {
    normalized = normalizeInteractivePayload(interactive);
  } catch (error) {
    console.error('WHATSAPP_INTERACTIVE_NORMALIZE_ERROR', {
      to,
      message: error?.message || null,
      interactive
    });
    return sendWhatsAppText(rootDir, to, interactiveFallbackText(interactive));
  }

  const result = await sendWhatsAppPayload(to, { type: 'interactive', interactive: normalized });

  logWebhook('OUTGOING_INTERACTIVE', {
    to,
    status: result.status || null,
    metaError: result.data?.error || null,
    type: normalized.type
  });

  try {
    await saveOutgoingMessage(rootDir, {
      id: crypto.randomUUID(),
      to,
      type: `interactive_${normalized.type}`,
      text: normalized.body?.text || '',
      payload: {
        request_interactive: normalized,
        response: result.data || null,
        status: result.status || null
      }
    });
  } catch (error) {
    console.error('MESSAGES_LOG_SUPABASE_ERROR', error);
  }

  if (!result.status || result.status < 200 || result.status >= 300) {
    return sendWhatsAppText(rootDir, to, interactiveFallbackText(interactive));
  }

  return result;
}

function currentRootTitle(rootId) {
  return getRootById(rootId)?.title || 'القسم';
}

async function promptRootFlow(rootDir, to, session, rootId, page = 0) {
  const sessionData = readSessionData(session);
  const draft = sessionData.orderDraft || defaultDraft();
  const resolvedRoot = resolveRootId(rootId || draft.rootId);

  if (!resolvedRoot) {
    return sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0));
  }

  if (resolvedRoot === 'meat' && !draft.meatType) {
    const typeOptions = getRootTypeOptions(rootDir, resolvedRoot);
    return sendWhatsAppInteractive(rootDir, to, typeButtonsForRoot('قسم اللحوم', typeOptions));
  }

  if (['mahashi', 'yalangi', 'maftoul'].includes(resolvedRoot) && !draft.statusFilter) {
    const statusOptions = getRootStatusOptions(rootDir, resolvedRoot).filter(option => ['ready', 'raw'].includes(option.value));
    return sendWhatsAppInteractive(rootDir, to, statusButtonsForRoot(currentRootTitle(resolvedRoot), statusOptions));
  }

  if (resolvedRoot === 'bundles' && !draft.categoryFilter) {
    const categoryOptions = getRootCategoryOptions(rootDir, resolvedRoot, draft);
    return sendWhatsAppInteractive(rootDir, to, categoryListForRoot(currentRootTitle(resolvedRoot), resolvedRoot, categoryOptions, page));
  }

  if (resolvedRoot === 'bundles' && draft.categoryFilter && !draft.meatType) {
    const typeOptions = getRootTypeOptions(rootDir, resolvedRoot, draft);
    if (typeOptions.length > 1) {
      return sendWhatsAppInteractive(rootDir, to, typeButtonsForRoot(currentRootTitle(resolvedRoot), typeOptions));
    }
  }

  if (resolvedRoot === 'catering' && !draft.categoryFilter) {
    const categoryOptions = getRootCategoryOptions(rootDir, resolvedRoot, draft);
    return sendWhatsAppInteractive(rootDir, to, categoryListForRoot(currentRootTitle(resolvedRoot), resolvedRoot, categoryOptions, page));
  }

  if (resolvedRoot === 'catering' && draft.categoryFilter && !draft.meatType) {
    const typeOptions = getRootTypeOptions(rootDir, resolvedRoot, draft);
    return sendWhatsAppInteractive(rootDir, to, typeButtonsForRoot(currentRootTitle(resolvedRoot), typeOptions));
  }

  return sendWhatsAppInteractive(rootDir, to, itemList(rootDir, draft, page));
}

async function sendMainMenu(rootDir, to, session) {
  return sendWhatsAppInteractive(rootDir, to, mainMenuButtons(session?.preferred_language || 'ar'));
}

function extractCategoryValue(rootDir, rootId, slugValue, draft = {}) {
  const options = getRootCategoryOptions(rootDir, rootId, draft);
  return options.find(option => slugify(option.value) === slugify(slugValue))?.value || null;
}

function extractTypeValue(rootDir, rootId, slugValue, draft = {}) {
  const options = getRootTypeOptions(rootDir, rootId, draft);
  return options.find(option => slugify(option.value) === slugify(slugValue))?.value || null;
}

async function notifyAdminsNewOrder(rootDir, order, config) {
  const items = await getOrderItems(rootDir, order.id);
  const admins = getAdminNumbers(config);

  if (!admins.length) {
    console.warn('ADMIN_NUMBERS_EMPTY_OR_INVALID', {
      orderId: order.id
    });
    return { sent: 0, failed: 0, admins: [] };
  }

  const lines = items.map((item, index) => `${index + 1}. ${item.display_name_ar} × ${item.quantity} = ${money(item.line_total_jod || item.lineTotalJod)}`);
  const summary = [
    'طلب جديد يحتاج اعتماد 🌿',
    `رقم الطلب: ${order.id}`,
    `الهاتف: ${order.phone}`,
    order.customer_name ? `الاسم: ${order.customer_name}` : null,
    '',
    ...lines,
    '',
    `الإجمالي: ${money(order.total_jod || order.totalJod)}`,
    order.delivery_slot ? `الموعد: ${order.delivery_slot}` : null,
    order.delivery_zone_name ? `المنطقة: ${order.delivery_zone_name}` : null,
    order.address_text ? `العنوان: ${order.address_text}` : null,
    order.order_notes ? `الملاحظات: ${order.order_notes}` : null
  ].filter(Boolean).join('\n');

  let sent = 0;
  let failed = 0;

  for (const adminPhone of admins) {
    try {
      const textResult = await sendWhatsAppText(rootDir, adminPhone, summary);
      const interactiveResult = await sendWhatsAppInteractive(rootDir, adminPhone, adminDecisionButtons(order.id));

      const okText = Boolean(textResult?.status >= 200 && textResult?.status < 300);
      const okInteractive = Boolean(interactiveResult?.status >= 200 && interactiveResult?.status < 300);

      if (okText || okInteractive) {
        sent += 1;
      } else {
        failed += 1;
      }

      console.info('ADMIN_ORDER_NOTIFICATION_RESULT', JSON.stringify({
        orderId: order.id,
        adminPhone,
        okText,
        okInteractive,
        textStatus: textResult?.status || null,
        interactiveStatus: interactiveResult?.status || null
      }));
    } catch (error) {
      failed += 1;
      console.error('ADMIN_ORDER_NOTIFICATION_ERROR', {
        orderId: order.id,
        adminPhone,
        message: error?.message || null
      });
    }
  }

  return { sent, failed, admins };
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

  let orderId = sessionData.lastOrderId || null;
  let existingOrder = null;

  if (draft.revisionOrderId) {
    existingOrder = await getOrderById(rootDir, draft.revisionOrderId);
    orderId = existingOrder?.id || draft.revisionOrderId;
  }

  if (!orderId) orderId = await generateNextOrderCode(rootDir);

  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = Number(draft.deliveryType === 'delivery' ? draft.deliveryFeeJod || 0 : 0);
  const total = subtotal + deliveryFee;

  const items = cart.map(item => ({
    id: item.id,
    display_name_ar: item.displayNameAr,
    quantity: item.quantity,
    unit_ar: item.unit_ar,
    price_1_jod: item.price_1_jod,
    lineTotalJod: item.lineTotalJod,
    notes: item.notes || (item.extras?.length ? item.extras.map(extra => extra.label).join(' + ') : null)
  }));

  const payload = {
    id: orderId,
    customerId: customer?.id || null,
    customerName: customer?.full_name || 'عميل مطبخ اليوم',
    phone,
    items,
    notes: draft.notes || null,
    address: draft.address || null,
    deliveryDay: draft.deliveryDayLabel || null,
    deliverySlot: draft.deliverySlot || null,
    deliveryType: draft.deliveryType || 'delivery',
    deliverySector: draft.sectorTitle || null,
    deliveryZoneId: draft.zoneId || null,
    deliveryZoneName: draft.zoneName || null,
    paymentMethod: draft.paymentMethod || 'cash',
    status: 'awaiting_admin_review',
    statusLabelAr: 'بانتظار اعتماد الإدارة',
    subtotalJod: subtotal,
    deliveryFeeJod: deliveryFee,
    totalJod: total,
    createdAt: existingOrder?.created_at || existingOrder?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  const order = existingOrder
    ? await replaceOrder(rootDir, orderId, payload)
    : await createOrder(rootDir, payload);

  await persistSession(rootDir, phone, session, {
    currentState: 'awaiting_admin_review',
    lastOrderId: order.id,
    sessionData: {
      ...resetDraftKeepingSession(),
      lastOrderId: order.id
    }
  });

  return { order };
}

async function handleAdminAction(rootDir, from, selection) {
  const [action, orderId] = selection.split(':');
  const order = await getOrderById(rootDir, orderId);

  if (!order) return { ok: false, message: 'تعذر العثور على الطلب المطلوب.' };

  if (action === BUTTON_IDS.ADMIN_APPROVE) {
    await updateOrderStatus(rootDir, orderId, 'approved', 'تم اعتماد الطلب', {
      approvedByPhone: from,
      approvedAt: nowIso()
    });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('approved', orderId));
    await sendWhatsAppInteractive(rootDir, from, adminOpsButtons(orderId));
    return { ok: true, message: 'تم اعتماد الطلب وإشعار العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_MODIFY) {
    await updateOrderStatus(rootDir, orderId, 'awaiting_customer_edit', 'بانتظار تعديل العميل', {
      adminNotes: 'يرجى مراجعة تفاصيل الطلب مع العميل قبل الاعتماد.'
    });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('awaiting_customer_edit', orderId, 'يرجى مراجعة تفاصيل الطلب مع الموظف أو إعادة إرسال التعديلات.'));
    return { ok: true, message: 'تم طلب تعديل الطلب من العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_REJECT) {
    await updateOrderStatus(rootDir, orderId, 'rejected', 'مرفوض', {
      adminNotes: 'اعتذار منكم، يمكن إعادة ترتيب الطلب من جديد.'
    });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('rejected', orderId));
    return { ok: true, message: 'تم رفض الطلب وإشعار العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_PREPARING) {
    await updateOrderStatus(rootDir, orderId, 'preparing', 'قيد التحضير');
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('preparing', orderId));
    return { ok: true, message: 'تم تحديث الطلب إلى قيد التحضير.' };
  }

  if (action === BUTTON_IDS.ADMIN_READY) {
    await updateOrderStatus(rootDir, orderId, 'ready', 'جاهز');
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('ready', orderId));
    return { ok: true, message: 'تم تحديث الطلب إلى جاهز.' };
  }

  if (action === BUTTON_IDS.ADMIN_OUT) {
    await updateOrderStatus(rootDir, orderId, 'out_for_delivery', 'قيد التوصيل');
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('out_for_delivery', orderId));
    await sendWhatsAppInteractive(rootDir, from, {
      type: 'button',
      body: `تأكيد إنهاء الطلب ${orderId}`,
      buttons: [{ id: `${BUTTON_IDS.ADMIN_DELIVERED}:${orderId}`, title: 'تم التسليم' }]
    });
    return { ok: true, message: 'تم تحديث الطلب إلى قيد التوصيل.' };
  }

  if (action === BUTTON_IDS.ADMIN_DELIVERED) {
    await updateOrderStatus(rootDir, orderId, 'delivered', 'تم التسليم');
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('delivered', orderId));
    return { ok: true, message: 'تم إغلاق الطلب على أنه تم التسليم.' };
  }

  return { ok: false, message: 'إجراء إداري غير معروف.' };
}

export async function processWhatsAppWebhook(rootDir, req, res, config) {
  try {
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
        id: message.id || crypto.randomUUID(),
        from,
        type,
        text: type === 'text' ? text : type === 'location' ? buildLocationText(message) : JSON.stringify(message),
        payload: message
      });
    } catch (error) {
      console.error('MESSAGES_LOG_SUPABASE_ERROR', error);
    }

    /* ========= ADMIN FLOW ========= */

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
        const outcome = await handleAdminAction(rootDir, from, selection);
        const delivered = await sendWhatsAppText(rootDir, to, outcome.message);
        return json(res, 200, { ok: true, delivered, mode: 'admin_action' });
      }

      if (selection === BUTTON_IDS.ADMIN_HOME) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminHomeButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_home' });
      }

      if (selection === BUTTON_IDS.ADMIN_ORDERS) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminOrdersButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders' });
      }

      if (selection === BUTTON_IDS.ADMIN_REPORTS) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminReportsButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_reports' });
      }

      if (selection === BUTTON_IDS.ADMIN_CAMPAIGNS) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminCampaignButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaigns' });
      }

      if (selection === BUTTON_IDS.ADMIN_ORDERS_NEW) {
        const delivered = await sendAdminPendingOrders(rootDir, to);
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders_new' });
      }

      if (selection === BUTTON_IDS.ADMIN_ORDERS_FOLLOW) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminFollowupList());
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders_follow' });
      }

      if (selection === BUTTON_IDS.ADMIN_ORDERS_SEARCH) {
        const delivered = await sendWhatsAppText(rootDir, to, 'أرسل رقم الطلب بهذا الشكل:\n/view MAE001');
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders_search_prompt' });
      }

      if (selection.startsWith('admin_follow_status:')) {
        const statusKey = selection.split(':')[1];
        const delivered = await sendAdminOrdersByStatus(rootDir, to, statusKey);
        return json(res, 200, { ok: true, delivered, mode: 'admin_follow_status' });
      }

      if (selection.startsWith('admin_view:')) {
        const orderId = selection.split(':')[1];
        const delivered = await sendAdminOrderDetails(rootDir, to, orderId);
        return json(res, 200, { ok: true, delivered, mode: 'admin_view_order' });
      }

      if (selection === BUTTON_IDS.ADMIN_REPORT_TODAY) {
        const delivered = await sendAdminQuickReport(rootDir, to, 'اليوم', 'today');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_today' });
      }

      if (selection === BUTTON_IDS.ADMIN_REPORT_WEEK) {
        const delivered = await sendAdminQuickReport(rootDir, to, 'الأسبوع', 'week');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_week' });
      }

      if (selection === BUTTON_IDS.ADMIN_REPORT_MONTH) {
        const delivered = await sendAdminQuickReport(rootDir, to, 'الشهر', 'month');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_month' });
      }

      if (selection === BUTTON_IDS.ADMIN_CAMPAIGN_NEW) {
        const delivered = await sendWhatsAppText(
          rootDir,
          to,
          'وضع إنشاء عرض جديد تم فتحه 🌿\nالخطوة التالية:\n1) اختر المجموعة المستهدفة\n2) جهّز نص الحملة\n3) اعتمد قالب واتساب إذا كان الإرسال خارج نافذة 24 ساعة.'
        );
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaign_new' });
      }

      if (selection === BUTTON_IDS.ADMIN_CAMPAIGN_SCHEDULE) {
        const delivered = await sendWhatsAppText(
          rootDir,
          to,
          'وضع الجدولة تم فتحه 🌿\nالجدولة الآن جاهزة كمسار إداري، وربط التنفيذ التلقائي سيكون في طبقة المهام اللاحقة.\nابدأ أولًا باختيار المجموعة المستهدفة من شاشة المجموعات.'
        );
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaign_schedule' });
      }

      if (selection === BUTTON_IDS.ADMIN_CAMPAIGN_GROUPS) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminGroupsList());
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaign_groups' });
      }

      if (selection.startsWith('admin_group:')) {
        const groupKey = selection.split(':')[1];
        const delivered = await sendCampaignAudiencePreview(rootDir, to, groupKey);
        return json(res, 200, { ok: true, delivered, mode: 'admin_group_selected' });
      }
    }

    if (isAdminPhone(from, config) && type === 'text') {
      const command = text.trim();
      const normalizedAdminText = normalizeUserText(command);

      if (command === '/admin' || /^(الاداره|اداره|لوحه الاداره|لوحة الادارة|admin)$/.test(normalizedAdminText)) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminHomeButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_home_text' });
      }

      if (command === '/pending') {
        const delivered = await sendAdminPendingOrders(rootDir, to);
        return json(res, 200, { ok: true, delivered, mode: 'admin_pending' });
      }

      if (command.startsWith('/view ')) {
        const orderId = command.split(' ').slice(1).join(' ').trim();
        const delivered = await sendAdminOrderDetails(rootDir, to, orderId);
        return json(res, 200, { ok: true, delivered, mode: 'admin_view' });
      }

      if (/^(التقارير|تقارير)$/.test(normalizedAdminText)) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminReportsButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_reports_text' });
      }

      if (/^(الطلبات|طلبات)$/.test(normalizedAdminText)) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminOrdersButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders_text' });
      }

      if (/^(الحملات|حملات|العروض|عروض)$/.test(normalizedAdminText)) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminCampaignButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaigns_text' });
      }

      if (/^\/report-today$/i.test(command)) {
        const delivered = await sendAdminQuickReport(rootDir, to, 'اليوم', 'today');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_today_text' });
      }

      if (/^\/report-week$/i.test(command)) {
        const delivered = await sendAdminQuickReport(rootDir, to, 'الأسبوع', 'week');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_week_text' });
      }

      if (/^\/report-month$/i.test(command)) {
        const delivered = await sendAdminQuickReport(rootDir, to, 'الشهر', 'month');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_month_text' });
      }
    }

    /* ========= CUSTOMER FLOW ========= */

    let session = await getConversationSession(rootDir, from);
    let sessionData = readSessionData(session);
    let customerProfile = await getCustomerProfileSummary(rootDir, from);
    const openOrder = await getLatestOpenOrderByPhone(rootDir, from);

    if (!session) {
      session = await persistSession(rootDir, from, null, {
        currentState: 'welcome',
        preferredLanguage: 'ar',
        consentStatus: 'pending',
        sessionData: resetDraftKeepingSession()
      });
      sessionData = readSessionData(session);
      customerProfile = await getCustomerProfileSummary(rootDir, from);
    }

    const selection = readIncomingSelection(message, rootDir);
    const textMode = textIntent(text);

    if (openOrder && !selection && TRACK_TERMS.test(text)) {
      const delivered = await sendWhatsAppText(rootDir, to, mapPrepStatusToCustomer(openOrder.status, openOrder.id, openOrder.admin_notes || openOrder.adminNotes || ''));
      return json(res, 200, { ok: true, delivered, mode: 'track_open_order' });
    }

    if (selection === BUTTON_IDS.EXIT || selection === BUTTON_IDS.CUSTOMER_EXIT) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'main_menu',
        sessionData: resetDraftKeepingSession()
      });
      const delivered = await sendMainMenu(rootDir, to, session);
      return json(res, 200, { ok: true, delivered, mode: 'exit_to_main' });
    }

    if (selection === BUTTON_IDS.HUMAN || textMode === 'human') {
      const links = buildTextLinks(config, req);
      const delivered = await sendWhatsAppText(rootDir, to, `يسعدنا خدمتك 🌿\nيمكنك التواصل مع موظف مباشر على الرقم: ${links.phone}`);
      return json(res, 200, { ok: true, delivered, mode: 'human' });
    }

    if (textMode === 'welcome' && (!session.current_state || session.current_state === 'welcome')) {
      const delivered = await sendWhatsAppInteractive(rootDir, to, customerProfile.isReturning ? welcomeButtons(true) : welcomeButtons(false));
      return json(res, 200, { ok: true, delivered, mode: 'welcome' });
    }

    if (selection === BUTTON_IDS.AR || selection === BUTTON_IDS.EN) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_consent',
        preferredLanguage: selection === BUTTON_IDS.EN ? 'en' : 'ar'
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, consentButtons(selection === BUTTON_IDS.EN ? 'en' : 'ar'));
      return json(res, 200, { ok: true, delivered, mode: 'consent' });
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
      const delivered = await sendMainMenu(rootDir, to, session);
      return json(res, 200, { ok: true, delivered, mode: 'main_menu' });
    }

    if (selection === BUTTON_IDS.SHOW_MENU || selection === BUTTON_IDS.START_ORDER || textMode === 'menu' || textMode === 'order') {
      session = await persistSession(rootDir, from, session, {
        currentState: 'menu_roots',
        sessionData: {
          ...sessionData,
          orderDraft: defaultDraft(),
          pendingItemId: null,
          pendingExtras: [],
          awaiting: null
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0));
      return json(res, 200, { ok: true, delivered, mode: 'menu_roots' });
    }

    if (selection === BUTTON_IDS.TRACK_ORDER || textMode === 'track') {
      const latest = await getLatestOpenOrderByPhone(rootDir, from);
      const delivered = latest
        ? await sendWhatsAppText(rootDir, to, mapPrepStatusToCustomer(latest.status, latest.id, latest.admin_notes || latest.adminNotes || ''))
        : await sendWhatsAppText(rootDir, to, 'لا يوجد طلب مفتوح حاليًا على هذا الرقم 🌿');
      return json(res, 200, { ok: true, delivered, mode: 'track' });
    }

    if (selection.startsWith('roots_page:')) {
      const page = Number(selection.split(':')[1] || 0);
      const delivered = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, page));
      return json(res, 200, { ok: true, delivered, mode: 'roots_page' });
    }

    if (selection.startsWith('root:')) {
      const rootId = resolveRootId(selection.split(':')[1]);
      session = await persistSession(rootDir, from, session, {
        currentState: 'choosing_root_filters',
        lastMenuSection: rootId,
        sessionData: {
          ...sessionData,
          pendingItemId: null,
          pendingExtras: [],
          awaiting: null,
          orderDraft: {
            ...defaultDraft(),
            rootId
          }
        }
      });

      const delivered = await promptRootFlow(rootDir, to, session, rootId, 0);
      return json(res, 200, { ok: true, delivered, mode: 'root_selected' });
    }

    if (selection.startsWith('category_page:')) {
      const [, rootId, pageRaw] = selection.split(':');
      sessionData = readSessionData(session);
      const options = getRootCategoryOptions(rootDir, rootId, sessionData.orderDraft);
      const delivered = await sendWhatsAppInteractive(rootDir, to, categoryListForRoot(currentRootTitle(rootId), rootId, options, Number(pageRaw || 0)));
      return json(res, 200, { ok: true, delivered, mode: 'category_page' });
    }

    if (selection.startsWith('category:')) {
      const [, rootId, categorySlug] = selection.split(':');
      const categoryValue = extractCategoryValue(rootDir, rootId, categorySlug, sessionData.orderDraft);

      session = await persistSession(rootDir, from, session, {
        currentState: 'choosing_root_filters',
        sessionData: {
          ...sessionData,
          orderDraft: {
            ...sessionData.orderDraft,
            rootId: resolveRootId(rootId),
            categoryFilter: categoryValue,
            meatType: sessionData.orderDraft.rootId === 'bundles' ? null : sessionData.orderDraft.meatType
          }
        }
      });

      sessionData = readSessionData(session);
      const typeOptions = getRootTypeOptions(rootDir, rootId, sessionData.orderDraft);
      if ((rootId === 'bundles' || rootId === 'catering') && typeOptions.length > 1 && !sessionData.orderDraft.meatType) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, typeButtonsForRoot(currentRootTitle(rootId), typeOptions));
        return json(res, 200, { ok: true, delivered, mode: 'category_selected_type_prompt' });
      }

      const delivered = await promptRootFlow(rootDir, to, session, rootId, 0);
      return json(res, 200, { ok: true, delivered, mode: 'category_selected' });
    }

    if (selection.startsWith('type:')) {
      const [, typeSlug] = selection.split(':');
      const rootId = resolveRootId(sessionData.orderDraft.rootId);
      const typeValue = extractTypeValue(rootDir, rootId, typeSlug, sessionData.orderDraft);

      session = await persistSession(rootDir, from, session, {
        currentState: 'choosing_root_filters',
        sessionData: {
          ...sessionData,
          orderDraft: {
            ...sessionData.orderDraft,
            meatType: typeValue
          }
        }
      });

      const delivered = await promptRootFlow(rootDir, to, session, rootId, 0);
      return json(res, 200, { ok: true, delivered, mode: 'type_selected' });
    }

    if (selection.startsWith('status:')) {
      const statusValue = selection.split(':')[1];
      const rootId = resolveRootId(sessionData.orderDraft.rootId);

      session = await persistSession(rootDir, from, session, {
        currentState: 'choosing_root_filters',
        sessionData: {
          ...sessionData,
          orderDraft: {
            ...sessionData.orderDraft,
            statusFilter: statusValue
          }
        }
      });

      const delivered = await promptRootFlow(rootDir, to, session, rootId, 0);
      return json(res, 200, { ok: true, delivered, mode: 'status_selected' });
    }

    if (selection.startsWith('items_page:')) {
      const page = Number(selection.split(':')[1] || 0);
      sessionData = readSessionData(session);
      const delivered = await sendWhatsAppInteractive(rootDir, to, itemList(rootDir, sessionData.orderDraft, page));
      return json(res, 200, { ok: true, delivered, mode: 'items_page' });
    }

    if (selection.startsWith('item:')) {
      const itemId = selection.split(':')[1];
      const item = getMenuItemById(rootDir, itemId);

      if (!item) {
        const delivered = await sendWhatsAppText(rootDir, to, 'تعذر العثور على الصنف المطلوب. اختر من القائمة مرة أخرى.');
        return json(res, 200, { ok: true, delivered, mode: 'item_missing' });
      }

      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_quantity',
        sessionData: {
          ...sessionData,
          pendingItemId: item.record_id,
          awaiting: 'quantity_text',
          pendingExtras: getItemExtras(rootDir, item)
        }
      });

      const delivered = await sendWhatsAppInteractive(rootDir, to, quantityButtons(item));
      return json(res, 200, { ok: true, delivered, mode: 'quantity_prompt' });
    }

    if (selection.startsWith('qty:')) {
      const [, itemId, qtyRaw] = selection.split(':');
      const quantity = Number(qtyRaw || 1);
      const item = getMenuItemById(rootDir, itemId);

      if (!item || !quantity || quantity < 1) {
        const delivered = await sendWhatsAppText(rootDir, to, 'تعذر تحديد الكمية المطلوبة. أرسل رقمًا صحيحًا مثل 1 أو 2 أو 3.');
        return json(res, 200, { ok: true, delivered, mode: 'quantity_error' });
      }

      const extras = getItemExtras(rootDir, item);
      const cart = [
        ...(sessionData.cart || []),
        {
          id: item.record_id,
          displayNameAr: item.display_name_ar || item.item_name_ar,
          unit_ar: item.unit_ar,
          price_1_jod: Number(item.price_1_jod || 0),
          quantity,
          extras: [],
          notes: null,
          lineTotalJod: Number(item.price_1_jod || 0) * quantity
        }
      ];

      session = await persistSession(rootDir, from, session, {
        currentState: extras.length ? 'awaiting_extra_choice' : 'reviewing_cart',
        sessionData: {
          ...sessionData,
          cart,
          pendingItemId: item.record_id,
          pendingExtras: extras,
          awaiting: extras.length ? 'extra_choice' : null
        }
      });

      const delivered = extras.length
        ? await sendWhatsAppInteractive(rootDir, to, extrasList(item, extras))
        : await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text));

      return json(res, 200, { ok: true, delivered, mode: 'after_quantity' });
    }

    if (selection.startsWith('extra:')) {
      const [, itemId, extraId] = selection.split(':');
      const item = getMenuItemById(rootDir, itemId);
      const extras = getItemExtras(rootDir, item);
      const selectedExtra = extras.find(extra => extra.id === extraId);
      const cart = [...(sessionData.cart || [])];
      const last = cart[cart.length - 1];

      if (selectedExtra && last) {
        const existingIds = new Set((last.extras || []).map(extra => extra.id));
        if (!existingIds.has(selectedExtra.id)) {
          last.extras = [...(last.extras || []), selectedExtra];
          last.notes = last.extras.map(extra => extra.label).join(' + ');
          last.lineTotalJod = Number(last.lineTotalJod || 0) + Number(selectedExtra.price || 0);
        }
      }

      session = await persistSession(rootDir, from, session, {
        currentState: 'reviewing_cart',
        sessionData: {
          ...sessionData,
          cart,
          pendingExtras: [],
          awaiting: null
        }
      });

      const delivered = await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text));
      return json(res, 200, { ok: true, delivered, mode: 'extra_added' });
    }

    if (selection === BUTTON_IDS.CLEAR_CART) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'main_menu',
        sessionData: resetDraftKeepingSession()
      });
      const delivered = await sendMainMenu(rootDir, to, session);
      return json(res, 200, { ok: true, delivered, mode: 'cart_cleared' });
    }

    if (selection === BUTTON_IDS.ADD_MORE) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'menu_roots',
        sessionData: {
          ...sessionData,
          pendingItemId: null,
          pendingExtras: [],
          awaiting: null
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0));
      return json(res, 200, { ok: true, delivered, mode: 'add_more' });
    }

    if (selection === BUTTON_IDS.CHECKOUT) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_day',
        sessionData: {
          ...sessionData,
          awaiting: null
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, dayList());
      return json(res, 200, { ok: true, delivered, mode: 'day_prompt' });
    }

    if (selection.startsWith('day:')) {
      const [, dayIso, label] = selection.split(':');
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_slot',
        sessionData: {
          ...sessionData,
          orderDraft: {
            ...sessionData.orderDraft,
            deliveryDayIso: dayIso,
            deliveryDayLabel: label
          }
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, slotList(config));
      return json(res, 200, { ok: true, delivered, mode: 'slot_prompt' });
    }

    if (selection.startsWith('slot:')) {
      const slot = selection.split(':').slice(1).join(':');
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_delivery_type',
        sessionData: {
          ...sessionData,
          orderDraft: {
            ...sessionData.orderDraft,
            deliverySlot: slot
          }
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, deliveryTypeButtons());
      return json(res, 200, { ok: true, delivered, mode: 'delivery_type_prompt' });
    }

    if (selection === BUTTON_IDS.DELIVERY || selection === BUTTON_IDS.PICKUP) {
      const deliveryType = selection === BUTTON_IDS.PICKUP ? 'pickup' : 'delivery';
      session = await persistSession(rootDir, from, session, {
        currentState: deliveryType === 'pickup' ? 'awaiting_payment' : 'awaiting_sector',
        sessionData: {
          ...sessionData,
          orderDraft: {
            ...sessionData.orderDraft,
            deliveryType,
            deliveryFeeJod: deliveryType === 'pickup' ? 0 : sessionData.orderDraft.deliveryFeeJod,
            zoneId: deliveryType === 'pickup' ? null : sessionData.orderDraft.zoneId,
            zoneName: deliveryType === 'pickup' ? null : sessionData.orderDraft.zoneName,
            address: deliveryType === 'pickup' ? 'استلام من الفرع' : sessionData.orderDraft.address
          }
        }
      });
      const delivered = deliveryType === 'pickup'
        ? await sendWhatsAppInteractive(rootDir, to, paymentButtons())
        : await sendWhatsAppInteractive(rootDir, to, sectorList(rootDir));
      return json(res, 200, { ok: true, delivered, mode: 'delivery_type_selected' });
    }

    if (selection.startsWith('sector_page:')) {
      const page = Number(selection.split(':')[1] || 0);
      const groups = getDeliveryGroupList(rootDir);
      const rows = paginateRows(
        groups.map(group => ({
          id: `sector:${group.key}:0`,
          title: shortButton(normalizeSectorLabel(group), 24),
          description: `${group.count} منطقة`
        })),
        page,
        9,
        nextPage => `sector_page:${nextPage}`
      );
      const delivered = await sendWhatsAppInteractive(rootDir, to, listMessage('اختر المنطقة الرئيسية أولًا 🌿', 'المناطق', 'المناطق الرئيسية', rows));
      return json(res, 200, { ok: true, delivered, mode: 'sector_page' });
    }

    if (selection.startsWith('sector:')) {
      const [, sectorKey, pageRaw] = selection.split(':');
      const page = Number(pageRaw || 0);
      const group = getDeliveryGroupByKey(rootDir, sectorKey);

      if (!group) {
        const delivered = await sendWhatsAppText(rootDir, to, 'تعذر العثور على القطاع المطلوب. اختر من جديد.');
        return json(res, 200, { ok: true, delivered, mode: 'sector_missing' });
      }

      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_zone',
        sessionData: {
          ...sessionData,
          orderDraft: {
            ...sessionData.orderDraft,
            sectorKey,
            sectorTitle: group.group
          }
        }
      });

      const delivered = await sendWhatsAppInteractive(rootDir, to, zoneList(rootDir, sectorKey, page));
      return json(res, 200, { ok: true, delivered, mode: 'zone_prompt' });
    }

    if (selection.startsWith('zone:')) {
      const zoneId = selection.split(':')[1];
      const zone = getDeliveryZoneById(rootDir, zoneId);

      if (!zone) {
        const delivered = await sendWhatsAppText(rootDir, to, 'تعذر تحديد المنطقة المطلوبة. أعد الاختيار.');
        return json(res, 200, { ok: true, delivered, mode: 'zone_missing' });
      }

      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_address',
        sessionData: {
          ...sessionData,
          awaiting: 'address',
          orderDraft: {
            ...sessionData.orderDraft,
            zoneId: zone.zone_id,
            zoneName: zone.zone_name_ar,
            sectorTitle: `${zone.zone_type} — ${zone.sector_or_governorate}`,
            deliveryFeeJod: Number(zone.delivery_fee_jod || 0)
          }
        }
      });

      const delivered = await sendWhatsAppText(
        rootDir,
        to,
        `تم اختيار منطقة ${zone.zone_name_ar} ورسوم التوصيل ${money(zone.delivery_fee_jod)} 🌿\nأرسل العنوان بالتفصيل أو شارك الموقع الآن.`
      );

      return json(res, 200, { ok: true, delivered, mode: 'address_prompt' });
    }

    if (selection === BUTTON_IDS.PAY_CASH) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_notes_choice',
        sessionData: {
          ...sessionData,
          orderDraft: {
            ...sessionData.orderDraft,
            paymentMethod: 'cash'
          }
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, notesButtons());
      return json(res, 200, { ok: true, delivered, mode: 'notes_prompt' });
    }

    if (selection === BUTTON_IDS.NOTES_ADD) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_notes_text',
        sessionData: {
          ...sessionData,
          awaiting: 'notes_text'
        }
      });
      const delivered = await sendWhatsAppText(rootDir, to, 'اكتب الملاحظة التي تريد إضافتها على الطلب الآن.');
      return json(res, 200, { ok: true, delivered, mode: 'notes_text_prompt' });
    }

    if (selection === BUTTON_IDS.NOTES_SKIP) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'review_customer_summary',
        sessionData: {
          ...sessionData,
          awaiting: null,
          orderDraft: {
            ...sessionData.orderDraft,
            notes: null
          }
        }
      });
      const delivered = await sendWhatsAppInteractive(
        rootDir,
        to,
        customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, { ...sessionData.orderDraft, notes: null }))
      );
      return json(res, 200, { ok: true, delivered, mode: 'customer_summary' });
    }

    if (selection === BUTTON_IDS.CUSTOMER_EDIT) {
      session = await persistSession(rootDir, from, session, { currentState: 'editing_summary' });
      const delivered = await sendWhatsAppInteractive(rootDir, to, editList());
      return json(res, 200, { ok: true, delivered, mode: 'edit_list' });
    }

    if (selection === BUTTON_IDS.EDIT_ITEMS) {
      session = await persistSession(rootDir, from, session, {
        currentState: 'menu_roots',
        sessionData: {
          ...sessionData,
          pendingItemId: null,
          pendingExtras: [],
          awaiting: null
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0));
      return json(res, 200, { ok: true, delivered, mode: 'edit_items' });
    }

    if (selection === BUTTON_IDS.EDIT_SCHEDULE) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_day' });
      const delivered = await sendWhatsAppInteractive(rootDir, to, dayList());
      return json(res, 200, { ok: true, delivered, mode: 'edit_schedule' });
    }

    if (selection === BUTTON_IDS.EDIT_ZONE) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_sector' });
      const delivered = await sendWhatsAppInteractive(rootDir, to, sectorList(rootDir));
      return json(res, 200, { ok: true, delivered, mode: 'edit_zone' });
    }

    if (selection === BUTTON_IDS.EDIT_NOTES) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_notes_choice' });
      const delivered = await sendWhatsAppInteractive(rootDir, to, notesButtons());
      return json(res, 200, { ok: true, delivered, mode: 'edit_notes' });
    }

    if (selection === BUTTON_IDS.CUSTOMER_CONFIRM) {
      const outcome = await createOrUpdateOrderFromDraft(rootDir, from, session);
      if (outcome.error) {
        const delivered = await sendWhatsAppText(rootDir, to, outcome.error);
        return json(res, 200, { ok: true, delivered, mode: 'create_order_error' });
      }

      let adminNotification = { sent: 0, failed: 0, admins: [] };

      try {
        adminNotification = await notifyAdminsNewOrder(rootDir, outcome.order, config);
      } catch (error) {
        console.error('ADMIN_NOTIFY_FATAL', {
          orderId: outcome.order.id,
          message: error?.message || null
        });
      }

      const customerMessage = adminNotification.sent > 0
        ? `تم استلام طلبك وإرساله للإدارة للمراجعة ✅\nرقم الطلب: ${outcome.order.id}\nسنرسل لك الحالة مباشرة هنا بعد اعتماد الإدارة.`
        : `تم استلام طلبك بنجاح ✅\nرقم الطلب: ${outcome.order.id}\nطلبك الآن قيد المعالجة، وسيتم تحديث الحالة هنا مباشرة.`;

      const delivered = await sendWhatsAppText(rootDir, to, customerMessage);

      return json(res, 200, {
        ok: true,
        delivered,
        mode: 'sent_to_admin',
        adminNotification
      });
    }

    if (type === 'location' && sessionData.awaiting === 'address') {
      const locationText = buildLocationText(message);
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_payment',
        sessionData: {
          ...sessionData,
          awaiting: null,
          orderDraft: {
            ...sessionData.orderDraft,
            address: locationText
          }
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, paymentButtons());
      return json(res, 200, { ok: true, delivered, mode: 'address_location_saved' });
    }

    if (type === 'text' && sessionData.awaiting === 'quantity_text') {
      const quantity = Number(text);
      const item = getMenuItemById(rootDir, sessionData.pendingItemId);

      if (!quantity || quantity < 1 || !item) {
        const delivered = await sendWhatsAppText(rootDir, to, 'أرسل رقم كمية صحيحًا مثل 1 أو 2 أو 3.');
        return json(res, 200, { ok: true, delivered, mode: 'quantity_invalid' });
      }

      const extras = getItemExtras(rootDir, item);
      const cart = [
        ...(sessionData.cart || []),
        {
          id: item.record_id,
          displayNameAr: item.display_name_ar || item.item_name_ar,
          unit_ar: item.unit_ar,
          price_1_jod: Number(item.price_1_jod || 0),
          quantity,
          extras: [],
          notes: null,
          lineTotalJod: Number(item.price_1_jod || 0) * quantity
        }
      ];

      session = await persistSession(rootDir, from, session, {
        currentState: extras.length ? 'awaiting_extra_choice' : 'reviewing_cart',
        sessionData: {
          ...sessionData,
          cart,
          awaiting: extras.length ? 'extra_choice' : null,
          pendingExtras: extras
        }
      });

      const delivered = extras.length
        ? await sendWhatsAppInteractive(rootDir, to, extrasList(item, extras))
        : await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text));

      return json(res, 200, { ok: true, delivered, mode: 'quantity_text_saved' });
    }

    if (type === 'text' && sessionData.awaiting === 'address') {
      session = await persistSession(rootDir, from, session, {
        currentState: 'awaiting_payment',
        sessionData: {
          ...sessionData,
          awaiting: null,
          orderDraft: {
            ...sessionData.orderDraft,
            address: text
          }
        }
      });
      const delivered = await sendWhatsAppInteractive(rootDir, to, paymentButtons());
      return json(res, 200, { ok: true, delivered, mode: 'address_saved' });
    }

    if (type === 'text' && sessionData.awaiting === 'notes_text') {
      session = await persistSession(rootDir, from, session, {
        currentState: 'review_customer_summary',
        sessionData: {
          ...sessionData,
          awaiting: null,
          orderDraft: {
            ...sessionData.orderDraft,
            notes: text
          }
        }
      });
      const delivered = await sendWhatsAppInteractive(
        rootDir,
        to,
        customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, { ...sessionData.orderDraft, notes: text }))
      );
      return json(res, 200, { ok: true, delivered, mode: 'notes_saved' });
    }

    if (type !== 'text' && type !== 'interactive' && type !== 'location') {
      const delivered = await sendWhatsAppText(rootDir, to, 'وصلتنا رسالتك 🌿 حاليًا ندعم الأزرار والنص والموقع. اكتب "اطلب الآن" أو "المنيو" للمتابعة.');
      return json(res, 200, { ok: true, delivered, mode: 'unsupported_media' });
    }

    const fallbackIntent = textIntent(text);
    if (fallbackIntent === 'welcome') {
      const delivered = await sendWhatsAppInteractive(rootDir, to, customerProfile.isReturning ? welcomeButtons(true) : welcomeButtons(false));
      return json(res, 200, { ok: true, delivered, mode: 'welcome_repeat' });
    }

    const delivered = await sendMainMenu(rootDir, to, session);
    return json(res, 200, { ok: true, delivered, mode: 'fallback_main' });
  } catch (error) {
    console.error('WEBHOOK_FATAL_ERROR', error);
    return json(res, 200, {
      ok: false,
      recovered: true,
      message: error.message
    });
  }
}
