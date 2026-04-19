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
  getRootTypeOptions,
  resolveRootId
} from './menu.service.js';
import {
  getActiveAdminPhones,
  getAdminProfile,
  isAdminAuthorized,
  profileCan
} from './admin-role.service.js';
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

const TRACK_TERMS = /(حاله|حالة|متابعه|متابعة|track|tracking|status|طلبي|الطلب|وين طلبي|وين الطلب|طلبي وين)/i;
const INCOMING_MESSAGE_CACHE = new Map();
const INCOMING_MESSAGE_TTL_MS = 10 * 60 * 1000;

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

function pruneIncomingMessageCache() {
  const now = Date.now();
  for (const [key, timestamp] of INCOMING_MESSAGE_CACHE.entries()) {
    if (now - timestamp > INCOMING_MESSAGE_TTL_MS) {
      INCOMING_MESSAGE_CACHE.delete(key);
    }
  }
}

function markIncomingMessageProcessed(messageId) {
  if (!messageId) return;
  pruneIncomingMessageCache();
  INCOMING_MESSAGE_CACHE.set(String(messageId), Date.now());
}

function hasIncomingMessageBeenProcessed(messageId) {
  if (!messageId) return false;
  pruneIncomingMessageCache();
  return INCOMING_MESSAGE_CACHE.has(String(messageId));
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function buildAbsoluteUrl(baseUrl, targetPath = '/') {
  const normalizedBase = normalizeUrl(baseUrl);
  if (!normalizedBase) return '';
  try {
    return new URL(targetPath, `${normalizedBase}/`).toString();
  } catch {
    return '';
  }
}

function getBaseUrl(config, req) {
  return (
    normalizeUrl(process.env.WEBSITE_URL) ||
    normalizeUrl(config?.channels?.website) ||
    normalizeUrl(process.env.BASE_URL) ||
    normalizeUrl(config?.site?.baseUrl) ||
    `https://${getSafeHost(req)}`
  );
}

function buildTextLinks(config, req) {
  const baseUrl = getBaseUrl(config, req);
  const humanPhone =
    process.env.WHATSAPP_HUMAN_ESCALATION_NUMBER ||
    config?.site?.businessPhoneDisplay ||
    config?.businessConfig?.whatsappDisplay ||
    config?.directCallPhone ||
    '';

  const whatsappDigits = String(
    config?.businessConfig?.whatsappPrimary ||
    config?.site?.businessPhoneIntl ||
    humanPhone
  ).replace(/[^\d]/g, '');

  return {
    websiteUrl: baseUrl,
    menuUrl:
      normalizeUrl(process.env.PUBLIC_MENU_URL) ||
      normalizeUrl(config?.channels?.menu) ||
      buildAbsoluteUrl(baseUrl, '/menu.html'),
    orderUrl:
      normalizeUrl(process.env.PUBLIC_ORDER_URL) ||
      normalizeUrl(config?.channels?.order) ||
      buildAbsoluteUrl(baseUrl, '/order.html'),
    trackUrl:
      normalizeUrl(process.env.PUBLIC_TRACKING_URL) ||
      normalizeUrl(config?.channels?.tracking) ||
      buildAbsoluteUrl(baseUrl, '/track.html'),
    whatsappUrl:
      normalizeUrl(config?.channels?.whatsappClick) ||
      (whatsappDigits ? `https://wa.me/${whatsappDigits}` : ''),
    facebookUrl: normalizeUrl(config?.channels?.facebook),
    instagramUrl: normalizeUrl(config?.channels?.instagram),
    phone: humanPhone
  };
}

function buildHumanContactText(links = {}) {
  const lines = ['يا هلا فيكم، يسعدنا خدمتكم 🌿'];

  if (links.phone) {
    lines.push(`للتواصل المباشر مع فريقنا: ${links.phone}`);
  }
  if (links.whatsappUrl) {
    lines.push(`رابط الواتساب المباشر: ${links.whatsappUrl}`);
  }
  if (links.menuUrl) {
    lines.push(`منيو المطبخ: ${links.menuUrl}`);
  }

  return lines.join('\n');
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

function isSameStatus(order, targetStatus) {
  return String(order?.status || '').trim() === String(targetStatus || '').trim();
}

function isTerminalOrderStatus(status) {
  return ['delivered', 'rejected', 'customer_exit', 'cancelled'].includes(String(status || '').trim());
}

function duplicateStatusMessage(orderId, status) {
  if (status === 'approved') return `الطلب ${orderId} معتمد مسبقًا.`;
  if (status === 'awaiting_customer_edit') return `الطلب ${orderId} بانتظار تعديل العميل مسبقًا.`;
  if (status === 'rejected') return `الطلب ${orderId} مرفوض مسبقًا.`;
  if (status === 'preparing') return `الطلب ${orderId} قيد التحضير مسبقًا.`;
  if (status === 'ready') return `الطلب ${orderId} جاهز مسبقًا.`;
  if (status === 'out_for_delivery') return `الطلب ${orderId} قيد التوصيل مسبقًا.`;
  if (status === 'delivered') return `الطلب ${orderId} تم تسليمه مسبقًا.`;
  return `الطلب ${orderId} في هذه الحالة مسبقًا.`;
}

function blockedTransitionMessage(orderId, currentStatus) {
  if (currentStatus === 'delivered') {
    return `الطلب ${orderId} تم تسليمه بالفعل، ولا يمكن تعديل حالته من هذا المسار.`;
  }
  if (currentStatus === 'rejected') {
    return `الطلب ${orderId} مرفوض بالفعل، ولا يمكن متابعة حالاته التشغيلية.`;
  }
  if (currentStatus === 'customer_exit' || currentStatus === 'cancelled') {
    return `الطلب ${orderId} مغلق، ولا يمكن متابعة حالاته التشغيلية.`;
  }
  return `لا يمكن تنفيذ هذا الإجراء على الطلب ${orderId} في حالته الحالية: ${labelFromStatus(currentStatus)}.`;
}

function mapPrepStatusToCustomer(status, orderId, notes = '') {
  if (status === 'approved') {
    return `تم اعتماد طلبكم اللي بيفتح النفس ✅\nرقم الطلب: ${orderId}\nرح نجهز لكم أطيب الأكلات بـ "نَفَس ست البيت". الدفع كاش عند الاستلام، ورح نوافيكم بالتحديثات هون.`;
  }
  if (status === 'awaiting_customer_edit') {
    return `يا هلا فيكم، طلبكم يحتاج تعديل بسيط ليكون بأفضل صورة 🌿\nسنرتب معكم التعديل هنا مباشرة.${notes ? `\n\nملاحظة من المطبخ: ${notes}` : ''}`;
  }
  if (status === 'rejected') {
    return `نعتذر منكم، ما قدرنا نعتمد الطلب الحالي 😔${notes ? `\n\n${notes}` : '\nيا ريت تتواصلوا معنا لترتيب طلب بديل يرضيكم.'}`;
  }
  if (status === 'preparing') return `أكلكم صار على النار 👨‍🍳🔥\nرقم الطلب: ${orderId}\nقيد التحضير بكل حب وعناية.`;
  if (status === 'ready') return `الأكل صار جاهز ومحمر ومقمر ✅\nرقم الطلب: ${orderId}\nبانتظار التوصيل أو الاستلام.`;
  if (status === 'out_for_delivery') return `المندوب بالطريق لكم 🚚\nرقم الطلب: ${orderId}\nجهزوا السفرة، الأكل السخن واصلكم قريب!`;
  if (status === 'delivered') return 'ألف صحة وهنا على قلوبكم ✅\nنتمنى تكون الأكلات بيضت وجهكم وعجبتكم. شاركونا رأيكم ولا تنسونا بطلباتكم الجاية 🌿';
  return `حالة طلبكم الحالية: ${labelFromStatus(status)}\nرقم الطلب: ${orderId}`;
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

function readInteractiveSelectionTitle(message) {
  if (message?.type === 'interactive' && message.interactive?.type === 'button_reply') {
    return message.interactive.button_reply?.title || message.interactive.button_reply?.id || '';
  }
  if (message?.type === 'interactive' && message.interactive?.type === 'list_reply') {
    return message.interactive.list_reply?.title || message.interactive.list_reply?.id || '';
  }
  if (message?.type === 'button') {
    return message.button?.text || message.button?.payload || '';
  }
  return '';
}

function buildIncomingMessageLogText(message) {
  if (!message) return '';
  const type = message.type || '';
  if (type === 'text') return String(message.text?.body || '').trim();
  if (type === 'location') return buildLocationText(message);
  if (type === 'interactive' || type === 'button') return readInteractiveSelectionTitle(message) || JSON.stringify(message);

  if (type === 'image') {
    const caption = String(message.image?.caption || '').trim();
    return caption ? `[صورة] ${caption}` : '[صورة]';
  }
  if (type === 'video') {
    const caption = String(message.video?.caption || '').trim();
    return caption ? `[فيديو] ${caption}` : '[فيديو]';
  }
  if (type === 'audio') {
    return message.audio?.voice ? '[رسالة صوتية]' : '[ملف صوتي]';
  }
  if (type === 'document') {
    const filename = String(message.document?.filename || '').trim();
    return filename ? `[ملف] ${filename}` : '[ملف]';
  }
  if (type === 'sticker') return '[ملصق]';
  if (type === 'contacts') {
    const firstName = message.contacts?.[0]?.name?.formatted_name || '';
    return firstName ? `[جهة اتصال] ${firstName}` : '[جهة اتصال]';
  }
  if (type === 'reaction') return `[تفاعل] ${message.reaction?.emoji || ''}`.trim();

  return JSON.stringify(message);
}

function buildRichContentReply(message, config, req) {
  const links = buildTextLinks(config, req);
  const directPhoneLine = links.phone ? `\nللتواصل المباشر: ${links.phone}` : '';
  const menuLine = links.menuUrl ? `\nالمنيو: ${links.menuUrl}` : '';

  if (message?.type === 'audio') {
    return `وصلتنا رسالتكم الصوتية يا هلا 🌿\nيا ريت تكتبوا لنا المطلوب باختصار أو نصاً لنقدر نخدمكم بسرعة ودقة.${directPhoneLine}${menuLine}`;
  }
  if (message?.type === 'image') {
    return `وصلتنا الصورة 🌿\nإذا الصورة مرتبطة بطلب معين، يا ريت تكتبوا لنا شرح بسيط معها. أو اضغطوا على "اطلب الآن" لترتيب الطلب.${directPhoneLine}${menuLine}`;
  }
  if (message?.type === 'video') {
    return `وصلنا الفيديو 🌿\nلإكمال الخدمة بسرعة، اكتبوا لنا المطلوب نصًا أو استخدموا زر "اطلب الآن".${directPhoneLine}${menuLine}`;
  }
  if (message?.type === 'document') {
    return `وصلنا الملف 🌿\nاكتبوا لنا المطلوب بخصوصه لنكمل معكم.${directPhoneLine}${menuLine}`;
  }
  if (message?.type === 'contacts') {
    return `وصلتنا جهة الاتصال 🌿\nاكتبوا لنا الطلب وسنكمل معكم مباشرة.${directPhoneLine}${menuLine}`;
  }
  if (message?.type === 'sticker' || message?.type === 'reaction') {
    return `يا هلا وغلا 🌿\nللمتابعة العملية، اكتبوا "اطلب الآن" أو "المنيو" أو "تتبع طلبي".${directPhoneLine}${menuLine}`;
  }

  return `يا هلا فيكم 🌿\nحاليًا بنستقبل الطلبات من خلال الأزرار والنص. اكتبوا "اطلب الآن" أو "المنيو" للمتابعة.${directPhoneLine}${menuLine}`;
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
    ? 'يا هلا وغلا فيكم من جديد بمطبخ اليوم المركزي 🌿\nنورتونا بطلتكم! جاهزين نجهز لكم أطيب الأكلات اللي تبيض الوجه. اختاروا اللغة أو اطلبوا موظف لمساعدتكم.'
    : 'يا هلا ومرحبا فيكم بمطبخ اليوم المركزي 🌿\nنقدم لكم أكل بيتي أصيل، مطبوخ بحب وبـ "نَفَس ست البيت"، شغل نظيف ومرتب يبيض وجهكم بالعزايم والجمعات. اختاروا اللغة لنكمل معاكم:';

  return {
    type: 'button',
    body,
    buttons: [
      { id: BUTTON_IDS.AR, title: language === 'en' ? 'Arabic' : 'العربية 🇯🇴' },
      { id: BUTTON_IDS.EN, title: 'English' },
      { id: BUTTON_IDS.HUMAN, title: language === 'en' ? 'Agent' : 'مساعدة موظف 👨‍💻' }
    ]
  };
}

function consentButtons(language = 'ar') {
  return {
    type: 'button',
    body: language === 'en'
      ? 'Do you agree to receive service updates and offers related to your orders?'
      : 'عشان نخدمكم صح 🌿\nهل بتسمحوا لنا نرسل لكم تحديثات لطلباتكم وعروضنا المميزة اللي ما تتفوت؟',
    buttons: [
      { id: BUTTON_IDS.CONSENT_YES, title: language === 'en' ? 'Agree' : 'أكيد موافق ✅' },
      { id: BUTTON_IDS.CONSENT_SERVICE_ONLY, title: language === 'en' ? 'Service only' : 'للطلبات فقط 🚚' },
      { id: BUTTON_IDS.CONSENT_NO, title: language === 'en' ? 'No' : 'لا أوافق ❌' }
    ]
  };
}

function mainMenuButtons(language = 'ar') {
  return {
    type: 'button',
    body: language === 'en'
      ? 'Choose what you want and we will continue step by step.'
      : 'كيف بنقدر نخدمكم اليوم؟ 🌿\nاختاروا اللي بيناسبكم وإحنا بالخدمة خطوة بخطوة:',
    buttons: [
      { id: BUTTON_IDS.START_ORDER, title: language === 'en' ? 'Order' : 'اطلب الآن 🍲' },
      { id: BUTTON_IDS.TRACK_ORDER, title: language === 'en' ? 'Track' : 'وين طلبي؟ 🚚' },
      { id: BUTTON_IDS.HUMAN, title: language === 'en' ? 'Agent' : 'مساعدة موظف 📞' }
    ]
  };
}

function adminPermissionDenied(profile, area) {
  return `صلاحيتك الحالية (${profile?.roleLabel || 'غير معروفة'}) لا تسمح باستخدام ${area}.`;
}

function adminHomeButtons(profile = null) {
  const buttons = [];
  if (profileCan(profile, 'admin.orders.view')) buttons.push({ id: BUTTON_IDS.ADMIN_ORDERS, title: 'الطلبات' });
  if (profileCan(profile, 'admin.reports.view')) buttons.push({ id: BUTTON_IDS.ADMIN_REPORTS, title: 'التقارير' });
  if (profileCan(profile, 'admin.campaigns.view')) buttons.push({ id: BUTTON_IDS.ADMIN_CAMPAIGNS, title: 'الحملات' });

  return {
    type: 'button',
    body: `لوحة الإدارة 🌿\n${profile?.displayName || 'إدارة'} — ${profile?.roleLabel || 'إدارة'}\nاختر المسار المطلوب.`,
    buttons: buttons.slice(0, 3)
  };
}

function paginateRows(rows, page = 0, pageSize = 9, moreIdFactory = () => '') {
  const start = page * pageSize;
  const subset = rows.slice(start, start + pageSize);
  if (start + pageSize < rows.length) {
    subset.push({
      id: moreIdFactory(page + 1),
      title: 'عرض المزيد ⬇️',
      description: 'خيارات إضافية'
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
    'تفضلوا منيو مطبخ اليوم المركزي 🌿\nاختاروا القسم المناسب، ورح نكمل معاكم خطوة بخطوة لنوصلكم أطيب أكل.',
    'تصفح الأقسام 🍽️',
    'الأقسام الرئيسية',
    rows
  );
}

function typeButtonsForRoot(rootTitle = 'القسم', typeOptions = []) {
  const buttons = typeOptions.slice(0, 3).map(option => ({
    id: `type:${slugify(option.value)}`,
    title: shortButton(option.label)
  }));

  return {
    type: 'button',
    body: `اختاروا النوع اللي بتفضلوه داخل ${rootTitle} 🌿`,
    buttons: buttons.length ? buttons : [{ id: BUTTON_IDS.EXIT, title: 'رجوع' }]
  };
}

function categoryListForRoot(rootTitle = 'القسم', rootId, options = [], page = 0) {
  const rows = paginateRows(
    options.map(option => ({
      id: `category:${rootId}:${slugify(option.value)}`,
      title: shortButton(option.label),
      description: `متاح ${option.count} صنف بيشهي`
    })),
    page,
    9,
    nextPage => `category_page:${rootId}:${nextPage}`
  );

  return listMessage(
    `اختاروا التصنيف اللي على ذوقكم من قسم ${rootTitle} 🌿`,
    'التصنيفات 📋',
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
    'اختاروا الصنف اللي نفسكم فيه، وبعدها بنحدد الكمية 🌿',
    'تصفح الأصناف 🍲',
    'الأصناف المتاحة',
    rows
  );
}

function quantityButtons(item) {
  return {
    type: 'button',
    body: `اختيار موفق: ${item.display_name_ar || item.item_name_ar} 🥘\nالسعر: ${money(item.price_1_jod)} للوحدة\nالوحدة: ${baseUnitLabel(item)}\n\nكم ${baseUnitLabel(item)} بتحبوا نجهزلكم؟`,
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
    description: `بـ ${money(extra.price)} إضافية`
  }));

  rows.push({
    id: BUTTON_IDS.ADD_MORE,
    title: 'لا شكراً، بدون إضافات',
    description: 'متابعة السلة'
  });

  return listMessage(
    `حابين تضيفوا لمسة زيادة على ${item.item_name_ar || item.display_name_ar}؟ 😋`,
    'الإضافات المتاحة 🧅',
    'إضافات الصنف',
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
    text: `سلة طلباتكم بتفتح النفس 🌿\n\n${lines.join('\n') || 'السلة فاضية حالياً'}\n\n${deliveryFee ? `رسوم التوصيل: ${money(deliveryFee)}\n` : ''}الإجمالي الحالي: ${money(total)}`
  };
}

function cartButtons(summaryText) {
  return {
    type: 'button',
    body: `${summaryText}\n\n💡 نصيحة ست البيت: السفرة ما بتكمل بدون مقبلات وسلطات تفتح الشهية! حابين تضيفوا شيء ولا نعتمد الطلب؟`,
    buttons: [
      { id: BUTTON_IDS.CHECKOUT, title: 'اعتماد ومتابعة ✅' },
      { id: BUTTON_IDS.ADD_MORE, title: 'إضافة أصناف 🥗' },
      { id: BUTTON_IDS.CLEAR_CART, title: 'إلغاء الطلب ❌' }
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
      ? 'اليوم (حسب التوافر)'
      : i === 1
        ? 'بكرة'
        : date.toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'numeric' });

    rows.push({
      id: `day:${date.toISOString().slice(0, 10)}:${label}`,
      title: shortButton(label),
      description: date.toISOString().slice(0, 10)
    });
  }

  return listMessage(
    'متى بتحبوا يكون الأكل جاهز؟ 🌿',
    'اختاروا اليوم 📅',
    'الأيام المتاحة',
    rows
  );
}

function slotList(config) {
  const slots = config?.deliveryTimeSlots || [
    '10:00 - 11:00 صباحاً',
    '11:00 - 12:30 ظهراً',
    '12:30 - 14:00 ظهراً',
    '14:00 - 15:30 عصراً',
    '15:30 - 17:00 عصراً',
    '17:00 - 18:30 مساءً'
  ];

  return listMessage(
    'واختاروا الوقت اللي بيناسبكم لنوصلكم الأكل سخن 🌿',
    'اختاروا الوقت ⏰',
    'أوقات التوصيل/الاستلام',
    slots.map(slot => ({
      id: `slot:${slot}`,
      title: shortButton(slot),
      description: 'موعد التسليم'
    }))
  );
}

function deliveryTypeButtons() {
  return {
    type: 'button',
    body: 'بتحبوا نوصلكم الطلب لباب البيت، ولا بتمروا تستلموه من المطبخ؟ 🚚',
    buttons: [
      { id: BUTTON_IDS.DELIVERY, title: 'توصيل لباب البيت 🚚' },
      { id: BUTTON_IDS.PICKUP, title: 'استلام من المطبخ 🚶' },
      { id: BUTTON_IDS.EXIT, title: 'خروج ❌' }
    ]
  };
}

function compactRegionTitle(value = '', max = 24) {
  const text = String(value || '').replace(/\s+/g, ' ').replace(/\s*[-–—]\s*/g, ' - ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function normalizeSectorLabel(group = {}) {
  const raw = String(group.title || group.group || '').trim();
  const directMap = new Map([
    ['شمال عمان', 'شمال عمّان'], ['جنوب عمان', 'جنوب عمّان'], ['شرق عمان', 'شرق عمّان'], ['غرب عمان', 'غرب عمّان'],
    ['الزرقاء', 'الزرقاء'], ['السلط', 'السلط'], ['جرش', 'جرش'], ['عجلون', 'عجلون'], ['الأغوار الوسطى', 'الأغوار الوسطى']
  ]);
  if (directMap.has(raw)) return directMap.get(raw);

  const normalized = raw.replace(/محافظة/g, '').replace(/منطقة/g, '').replace(/قطاع/g, '').replace(/\s+/g, ' ').trim();
  if (/شمال.*عمان|عمان.*شمال/i.test(normalized)) return 'شمال عمّان';
  if (/جنوب.*عمان|عمان.*جنوب/i.test(normalized)) return 'جنوب عمّان';
  if (/شرق.*عمان|عمان.*شرق/i.test(normalized)) return 'شرق عمّان';
  if (/غرب.*عمان|عمان.*غرب/i.test(normalized)) return 'غرب عمّان';
  if (/زرقاء/.test(normalized)) return 'الزرقاء';
  if (/سلط/.test(normalized)) return 'السلط';
  return compactRegionTitle(normalized || 'القطاع');
}

function zoneTitleShort(zone = {}) {
  const raw = String(zone.zone_name_ar || '').trim();
  return compactRegionTitle(raw || 'المنطقة');
}

function zoneDescription(zone = {}) {
  const fee = money(zone.delivery_fee_jod || 0);
  const fullName = String(zone.zone_name_ar || 'المنطقة').trim();
  return `${fullName} • التوصيل ${fee}`.slice(0, 72);
}

function sectorList(rootDir) {
  const groups = getDeliveryGroupList(rootDir);
  const rows = paginateRows(
    groups.map(group => ({
      id: `sector:${group.key}:0`,
      title: shortButton(normalizeSectorLabel(group), 24),
      description: `${group.count} منطقة`
    })),
    0, 9, nextPage => `sector_page:${nextPage}`
  );

  return listMessage(
    'عشان نوصلك بأسرع وقت، حدد محافظتك أو منطقتك الرئيسية أولاً 🌿',
    'المحافظة/القطاع 🗺️',
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
    page, 9, nextPage => `sector:${sectorKey}:${nextPage}`
  );

  return listMessage(
    `وين بالضبط في ${normalizeSectorLabel(group)}؟ 🌿`,
    'المنطقة الفرعية 📍',
    normalizeSectorLabel(group),
    rows
  );
}

function paymentButtons() {
  return {
    type: 'button',
    body: 'طريقة الدفع المعتمدة عندنا حالياً هي الدفع كاش عند الاستلام لراحتكم 💵',
    buttons: [
      { id: BUTTON_IDS.PAY_CASH, title: 'الدفع عند الاستلام 💵' },
      { id: BUTTON_IDS.HUMAN, title: 'استفسار من موظف 👨‍💻' },
      { id: BUTTON_IDS.EXIT, title: 'إلغاء ❌' }
    ]
  };
}

function notesButtons() {
  return {
    type: 'button',
    body: 'هل عندكم أي ملاحظات خاصة للطبّاخ؟ (مثلاً: بدون ملح، محمر زيادة، الخ..) 👨‍🍳',
    buttons: [
      { id: BUTTON_IDS.NOTES_ADD, title: 'نعم، عندي ملاحظة ✍️' },
      { id: BUTTON_IDS.NOTES_SKIP, title: 'لا، بدون ملاحظات' }
    ]
  };
}

function customerSummaryButtons(summaryText) {
  return {
    type: 'button',
    body: summaryText,
    buttons: [
      { id: BUTTON_IDS.CUSTOMER_CONFIRM, title: 'تأكيد وإرسال للمطبخ ✅' },
      { id: BUTTON_IDS.CUSTOMER_EDIT, title: 'تعديل الطلب ✏️' },
      { id: BUTTON_IDS.CUSTOMER_EXIT, title: 'إلغاء الطلب ❌' }
    ]
  };
}

function editList() {
  return listMessage(
    'ولا يهمكم، شو حابين تعدلوا في الطلب؟ 🌿',
    'خيارات التعديل ✏️',
    'قائمة التعديل',
    [
      { id: BUTTON_IDS.EDIT_ITEMS, title: 'الأصناف 🍲', description: 'إضافة أو تغيير الأكل' },
      { id: BUTTON_IDS.EDIT_SCHEDULE, title: 'الموعد ⏰', description: 'تغيير اليوم أو الوقت' },
      { id: BUTTON_IDS.EDIT_ZONE, title: 'المنطقة 📍', description: 'تعديل منطقة التوصيل' },
      { id: BUTTON_IDS.EDIT_NOTES, title: 'الملاحظات ✍️', description: 'تغيير ملاحظات الشيف' }
    ]
  );
}

function buildCustomerFinalSummary(cart = [], draft = {}) {
  const summary = cartSummary(cart, draft);
  const lines = [
    'ملخص طلبكم النهائي 🌿',
    'راجعوا التفاصيل وتأكدوا إنها تمام التمام:',
    '',
    ...cart.map((item, index) => {
      const extrasLabel = item.extras?.length ? ` + ${item.extras.map(extra => extra.label).join(' + ')}` : '';
      return `${index + 1}. ${item.displayNameAr} × ${item.quantity}${extrasLabel} = ${money(item.lineTotalJod)}`;
    }),
    '',
    `📅 اليوم: ${draft.deliveryDayLabel || 'غير محدد'}`,
    `⏰ الوقت: ${draft.deliverySlot || 'غير محدد'}`,
    `🚚 الاستلام: ${draft.deliveryType === 'pickup' ? 'استلام من المطبخ' : 'توصيل لباب البيت'}`,
    draft.sectorTitle ? `🗺️ القطاع: ${draft.sectorTitle}` : null,
    draft.zoneName ? `📍 المنطقة: ${draft.zoneName}` : null,
    draft.address ? `🏠 العنوان: ${draft.address}` : null,
    `💵 طريقة الدفع: ${draft.paymentMethod === 'cash' ? 'كاش عند الاستلام' : 'غير محدد'}`,
    draft.notes ? `✍️ ملاحظاتكم: ${draft.notes}` : null,
    '',
    draft.deliveryType === 'delivery' ? `رسوم التوصيل: ${money(draft.deliveryFeeJod)}` : null,
    `المجموع الكلي: ${money(summary.total)}`
  ].filter(Boolean);

  return lines.join('\n');
}

// === الأوامر الإدارية (تبدأ من هنا) ===
function adminOrdersButtons() {
  return {
    type: 'button',
    body: 'إدارة الطلبات 🌿',
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
    body: 'التقارير التشغيلية 🌿',
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
    body: 'إدارة الحملات 🌿',
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
    'حالات الطلبات',
    [
      { id: 'admin_follow_status:awaiting_admin_review', title: 'بانتظار الاعتماد', description: 'طلبات جديدة' },
      { id: 'admin_follow_status:awaiting_customer_edit', title: 'بانتظار التعديل', description: 'تحتاج متابعة مع العميل' },
      { id: 'admin_follow_status:approved', title: 'تم الاعتماد', description: 'مقبولة' },
      { id: 'admin_follow_status:preparing', title: 'قيد التحضير', description: 'داخل المطبخ' },
      { id: 'admin_follow_status:ready', title: 'جاهز', description: 'جاهز للتسليم' },
      { id: 'admin_follow_status:out_for_delivery', title: 'قيد التوصيل', description: 'مع المندوب' }
    ]
  );
}

function adminGroupsList() {
  return listMessage(
    'اختر مجموعة الجمهور المستهدف 🌿',
    'المجموعات',
    'المجموعات',
    [
      { id: 'admin_group:all', title: 'جميع العملاء', description: 'كل الأرقام' },
      { id: 'admin_group:returning', title: 'العملاء المتكررون', description: 'كرروا الطلب' },
      { id: 'admin_group:new', title: 'العملاء الجدد', description: 'طلب واحد' },
      { id: 'admin_group:inactive', title: 'غير النشطين', description: 'آخر طلب قديم' },
      { id: 'admin_group:value', title: 'الأعلى إنفاقًا', description: 'أكثر العملاء قيمة' },
      { id: 'admin_group:zone', title: 'حسب المنطقة', description: 'توزيع جغرافي' }
    ]
  );
}

function buildAdminOrderViewRows(orders = []) {
  return orders.map(order => ({
    id: `admin_view:${order.id}`,
    title: shortButton(order.id, 24),
    description: `${labelFromStatus(order.status)} — ${money(order.total_jod || order.totalJod || 0)}`
  }));
}

function adminViewOrdersList(title, rows) {
  return listMessage(
    `اختر الطلب المطلوب من ${title} 🌿`,
    'الطلبات',
    title,
    rows.length ? rows : [{ id: BUTTON_IDS.ADMIN_HOME, title: 'لا توجد نتائج', description: 'العودة' }]
  );
}

function buildAdminOrderSummary(order, items = []) {
  const lines = [
    `تفاصيل الطلب ${order.id} 🌿`,
    `الحالة: ${labelFromStatus(order.status)}`,
    `الهاتف: ${order.phone || '-'}`,
    order.customer_name || order.customerName ? `الاسم: ${order.customer_name || order.customerName}` : null,
    '',
    ...items.map((item, index) => `${index + 1}. ${item.display_name_ar || item.displayNameAr} × ${item.quantity} = ${money(item.line_total_jod || item.lineTotalJod)}`),
    '',
    `الإجمالي: ${money(order.total_jod || order.totalJod || 0)}`,
    order.delivery_slot || order.deliverySlot ? `الموعد: ${order.delivery_slot || order.deliverySlot}` : null,
    order.delivery_zone_name || order.deliveryZoneName ? `المنطقة: ${order.delivery_zone_name || order.deliveryZoneName}` : null,
    order.address_text || order.address ? `العنوان: ${order.address_text || order.address}` : null,
    order.order_notes || order.notes ? `الملاحظات: ${order.order_notes || order.notes}` : null
  ].filter(Boolean);

  return lines.join('\n');
}

function buildMessagesPhonesText(phones = []) {
  if (!phones.length) return 'لا يوجد تفاعل مسجل.';
  return phones.slice(0, 20).map((item, index) => `${index + 1}. ${item.phone} — إجمالي ${item.total}`).join('\n');
}

async function sendAdminPendingOrders(rootDir, to) {
  const orders = await getOrdersByStatus(rootDir, 'awaiting_admin_review', 10);
  return sendWhatsAppInteractive(rootDir, to, adminViewOrdersList('بانتظار الاعتماد', buildAdminOrderViewRows(orders)));
}

async function sendAdminOrdersByStatus(rootDir, to, status) {
  const orders = await getOrdersByStatus(rootDir, status, 10);
  return sendWhatsAppInteractive(rootDir, to, adminViewOrdersList(labelFromStatus(status), buildAdminOrderViewRows(orders)));
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
  const body = [
    `معاينة المجموعة: ${preview.label || groupKey} 🌿`,
    `العدد: ${preview.count}`,
    preview.phones?.length ? `أول الأرقام: ${preview.phones.slice(0, 10).join(', ')}` : 'لا توجد أرقام',
    groupKey === 'zone' && preview.zones?.length
      ? `\nالتوزيع حسب المنطقة:\n${preview.zones.slice(0, 20).map(item => `- ${item.zone}: ${item.count}`).join('\n')}`
      : null,
    '\nملاحظة: الإرسال الجماعي الفعلي يحتاج قوالب واتساب معتمدة.'
  ].filter(Boolean).join('\n');

  return sendWhatsAppText(rootDir, to, body);
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
  const normalized = normalizeUserText(text);
  if (!normalized) return 'empty';

  if (/^(مرحبا|السلام عليكم|اهلا|هلا|hello|hi|hey)\b/.test(normalized)) return 'welcome';
  if (/(المنيو|القائمه|الاصناف|الاقسام|عرض المنيو|اعرض المنيو)/.test(normalized) || /(^|\s)(menu|show menu|catalog)(\s|$)/.test(normalized)) return 'menu';
  if (/(اطلب|ابدا الطلب|طلب جديد|بدي اطلب|ابغى اطلب|اريد الطلب|اريد اطلب)/.test(normalized) || /(^|\s)(order|start order|new order|buy)(\s|$)/.test(normalized)) return 'order';
  if (/(موظف|خدمه العملاء|الدعم|تواصل مباشر)/.test(normalized) || /(^|\s)(agent|human|support|customer service)(\s|$)/.test(normalized)) return 'human';
  if (TRACK_TERMS.test(text) || /(وين طلبي|وين الطلب|طلبي وين)/.test(normalized)) return 'track';

  return 'text';
}

function readIncomingSelection(message, rootDir = '') {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    return message.interactive.button_reply?.id || '';
  }
  if (message.type === 'interactive' && message.interactive?.type === 'list_reply') {
    return message.interactive.list_reply?.id || '';
  }
  if (message.type === 'button') {
    return message.button?.payload || message.button?.text || '';
  }

  const rawText = String(message.text?.body || '').trim();
  const simple = normalizeUserText(rawText);
  if (!simple) return '';

  const exactMap = {
    العربيه: BUTTON_IDS.AR, عربي: BUTTON_IDS.AR, arabic: BUTTON_IDS.AR,
    english: BUTTON_IDS.EN, انجليزي: BUTTON_IDS.EN, انجليزيه: BUTTON_IDS.EN,
    اوافق: BUTTON_IDS.CONSENT_YES, خدمه: BUTTON_IDS.CONSENT_SERVICE_ONLY, 'خدمه فقط': BUTTON_IDS.CONSENT_SERVICE_ONLY, 'لا اوافق': BUTTON_IDS.CONSENT_NO,
    اطلب: BUTTON_IDS.START_ORDER, 'اطلب الان': BUTTON_IDS.START_ORDER, 'ابدا الطلب': BUTTON_IDS.START_ORDER, 'طلب جديد': BUTTON_IDS.START_ORDER,
    المنيو: BUTTON_IDS.SHOW_MENU, القائمه: BUTTON_IDS.SHOW_MENU, الاقسام: BUTTON_IDS.SHOW_MENU, الاصناف: BUTTON_IDS.SHOW_MENU,
    تتبع: BUTTON_IDS.TRACK_ORDER, متابعه: BUTTON_IDS.TRACK_ORDER, 'تتبع طلبي': BUTTON_IDS.TRACK_ORDER,
    موظف: BUTTON_IDS.HUMAN, 'موظف مباشر': BUTTON_IDS.HUMAN,
    اضافه: BUTTON_IDS.ADD_MORE, 'متابعه السله': BUTTON_IDS.CHECKOUT, 'متابعه الطلب': BUTTON_IDS.TRACK_ORDER, الغاء: BUTTON_IDS.CLEAR_CART,
    توصيل: BUTTON_IDS.DELIVERY, استلام: BUTTON_IDS.PICKUP, كاش: BUTTON_IDS.PAY_CASH,
    ملاحظات: BUTTON_IDS.NOTES_ADD, 'بدون ملاحظات': BUTTON_IDS.NOTES_SKIP,
    تاكيد: BUTTON_IDS.CUSTOMER_CONFIRM, تعديل: BUTTON_IDS.CUSTOMER_EDIT, خروج: BUTTON_IDS.EXIT,
    الموعد: BUTTON_IDS.EDIT_SCHEDULE, المنطقه: BUTTON_IDS.EDIT_ZONE, الملاحظات: BUTTON_IDS.EDIT_NOTES
  };

  if (exactMap[simple]) return exactMap[simple];

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
    console.error('WHATSAPP_API_ERROR', { status: response.status, data, payload: JSON.parse(requestBody) });
  }

  return { status: response.status, data };
}

async function sendWhatsAppText(rootDir, to, body) {
  const result = await sendWhatsAppPayload(to, { type: 'text', text: { body } });
  logWebhook('OUTGOING_TEXT', { to, status: result.status || null, body });

  try {
    await saveOutgoingMessage(rootDir, { id: crypto.randomUUID(), to, type: 'text', text: body, payload: result.data || null });
  } catch (error) { console.error('MESSAGES_LOG_ERROR', error); }

  return result;
}

function normalizeInteractivePayload(interactive) {
  if (!interactive || !interactive.type) throw new Error('INTERACTIVE_PAYLOAD_MISSING');

  if (interactive.type === 'button') {
    return {
      type: 'button',
      body: { text: String(interactive.body || '').slice(0, 1024) },
      action: {
        buttons: (interactive.buttons || []).slice(0, 3).map(button => ({
          type: 'reply',
          reply: { id: String(button.id || '').slice(0, 256), title: shortButton(button.title || '') }
        }))
      }
    };
  }

  if (interactive.type === 'list') {
    return {
      type: 'list',
      body: { text: String(interactive.body || '').slice(0, 1024) },
      action: {
        button: shortButton(interactive.buttonText || 'عرض الخيارات'),
        sections: (interactive.sections || []).slice(0, 10).map(section => ({
          title: shortButton(section.title || 'الخيارات'),
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
  if (!interactive) return 'يا هلا ومرحباً بمطبخ اليوم المركزي 🌿\nاكتب المطلوب وسنكمل معك مباشرة.';

  if (interactive.type === 'button') {
    const lines = (interactive.buttons || []).map((button, index) => `${index + 1}- ${button.title}`);
    return `${String(interactive.body || '').trim()}\n\n${lines.join('\n')}\n\nيرجى كتابة الخيار المطلوب نصاً.`;
  }

  if (interactive.type === 'list') {
    const rows = (interactive.sections || []).flatMap(section => section.rows || []);
    const lines = rows.map((row, index) => `${index + 1}- ${row.title}${row.description ? ` — ${row.description}` : ''}`);
    return `${String(interactive.body || '').trim()}\n\n${lines.join('\n')}\n\nيرجى كتابة اسم الخيار المطلوب نصاً.`;
  }

  return 'يا هلا ومرحباً بمطبخ اليوم المركزي 🌿\nاكتب المطلوب وسنكمل معك مباشرة.';
}

async function sendWhatsAppInteractive(rootDir, to, interactive) {
  let normalized;
  try {
    normalized = normalizeInteractivePayload(interactive);
  } catch (error) {
    console.error('WHATSAPP_INTERACTIVE_NORMALIZE_ERROR', { to, message: error?.message || null, interactive });
    return sendWhatsAppText(rootDir, to, interactiveFallbackText(interactive));
  }

  const result = await sendWhatsAppPayload(to, { type: 'interactive', interactive: normalized });

  try {
    await saveOutgoingMessage(rootDir, {
      id: crypto.randomUUID(), to, type: `interactive_${normalized.type}`,
      text: normalized.body?.text || '', payload: { request_interactive: normalized, response: result.data || null, status: result.status || null }
    });
  } catch (error) { console.error('MESSAGES_LOG_ERROR', error); }

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

  if (!resolvedRoot) return sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0));

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
    if (typeOptions.length > 0) {
      return sendWhatsAppInteractive(rootDir, to, typeButtonsForRoot(currentRootTitle(resolvedRoot), typeOptions));
    }
  }

  if (resolvedRoot === 'frozen' && !draft.categoryFilter) {
    const categoryOptions = getRootCategoryOptions(rootDir, resolvedRoot, draft);
    if (categoryOptions.length > 0) {
      return sendWhatsAppInteractive(rootDir, to, categoryListForRoot(currentRootTitle(resolvedRoot), resolvedRoot, categoryOptions, page));
    }
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
  const admins = getActiveAdminPhones(rootDir, config);

  if (!admins.length) return { sent: 0, failed: 0, admins: [] };

  const lines = items.map((item, index) => `${index + 1}. ${item.display_name_ar || item.displayNameAr} × ${item.quantity} = ${money(item.line_total_jod || item.lineTotalJod)}`);
  const summary = [
    'طلب جديد يحتاج اعتماد 🌿',
    `رقم الطلب: ${order.id}`,
    `الهاتف: ${order.phone}`,
    order.customer_name ? `الاسم: ${order.customer_name}` : null,
    '', ...lines, '',
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
      const profile = getAdminProfile(rootDir, adminPhone, config);

      let interactiveResult = null;
      if (profileCan(profile, 'admin.orders.view')) {
        interactiveResult = await sendWhatsAppInteractive(rootDir, adminPhone, adminDecisionButtons(order.id));
      }

      const okText = Boolean(textResult?.status >= 200 && textResult?.status < 300);
      const okInteractive = interactiveResult ? Boolean(interactiveResult?.status >= 200 && interactiveResult?.status < 300) : true;

      if (okText && okInteractive) sent += 1; else failed += 1;
    } catch (error) { failed += 1; }
  }

  return { sent, failed, admins };
}

async function createOrUpdateOrderFromDraft(rootDir, phone, session) {
  const sessionData = readSessionData(session);
  const draft = sessionData.orderDraft || defaultDraft();
  const cart = sessionData.cart || [];

  if (!cart.length) return { error: 'سلة الطلب فاضية حالياً.' };
  if (!draft.deliveryDayIso || !draft.deliverySlot) return { error: 'يرجى تحديد اليوم والوقت أولاً.' };
  if (draft.deliveryType === 'delivery' && (!draft.zoneId || !draft.address)) return { error: 'يرجى إكمال عنوان التوصيل.' };

  const customer = await upsertCustomer(rootDir, { phone, preferred_language: session?.preferred_language || 'ar', consent_status: session?.consent_status || 'pending' });

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
    id: item.id, display_name_ar: item.displayNameAr, quantity: item.quantity,
    unit_ar: item.unit_ar, price_1_jod: item.price_1_jod, lineTotalJod: item.lineTotalJod,
    notes: item.notes || (item.extras?.length ? item.extras.map(extra => extra.label).join(' + ') : null)
  }));

  const payload = {
    id: orderId, customerId: customer?.id || null, customerName: customer?.full_name || 'عميل مطبخ اليوم',
    phone, items, notes: draft.notes || null, address: draft.address || null,
    deliveryDay: draft.deliveryDayLabel || null, deliverySlot: draft.deliverySlot || null,
    deliveryType: draft.deliveryType || 'delivery', deliverySector: draft.sectorTitle || null,
    deliveryZoneId: draft.zoneId || null, deliveryZoneName: draft.zoneName || null,
    paymentMethod: draft.paymentMethod || 'cash', status: 'awaiting_admin_review',
    statusLabelAr: 'بانتظار اعتماد الإدارة', subtotalJod: subtotal, deliveryFeeJod: deliveryFee, totalJod: total,
    createdAt: existingOrder?.created_at || existingOrder?.createdAt || nowIso(), updatedAt: nowIso()
  };

  const order = existingOrder ? await replaceOrder(rootDir, orderId, payload) : await createOrder(rootDir, payload);

  await persistSession(rootDir, phone, session, {
    currentState: 'awaiting_admin_review', lastOrderId: order.id,
    sessionData: { ...resetDraftKeepingSession(), lastOrderId: order.id }
  });

  return { order };
}

async function handleAdminAction(rootDir, from, selection, config) {
  const adminProfile = getAdminProfile(rootDir, from, config);
  const [action, orderId] = selection.split(':');
  const order = await getOrderById(rootDir, orderId);

  if (!order) return { ok: false, message: 'تعذر العثور على الطلب المطلوب.' };
  const currentStatus = String(order.status || '').trim();

  if ([BUTTON_IDS.ADMIN_APPROVE, BUTTON_IDS.ADMIN_MODIFY, BUTTON_IDS.ADMIN_REJECT].includes(action)) {
    if (!profileCan(adminProfile, 'admin.orders.approve')) return { ok: false, message: adminPermissionDenied(adminProfile, 'صلاحيات اعتماد الطلبات') };
  }
  if ([BUTTON_IDS.ADMIN_PREPARING, BUTTON_IDS.ADMIN_READY, BUTTON_IDS.ADMIN_OUT, BUTTON_IDS.ADMIN_DELIVERED].includes(action)) {
    if (!profileCan(adminProfile, 'admin.orders.status')) return { ok: false, message: adminPermissionDenied(adminProfile, 'صلاحيات تغيير حالة الطلب') };
  }

  if (action === BUTTON_IDS.ADMIN_APPROVE) {
    if (isSameStatus(order, 'approved')) return { ok: true, message: duplicateStatusMessage(orderId, 'approved') };
    if (['ready', 'out_for_delivery', 'delivered'].includes(currentStatus)) return { ok: true, message: `الطلب ${orderId} تجاوز مرحلة الاعتماد بالفعل وحالته الحالية: ${labelFromStatus(currentStatus)}.` };
    if (['rejected', 'customer_exit', 'cancelled'].includes(currentStatus)) return { ok: true, message: blockedTransitionMessage(orderId, currentStatus) };

    await updateOrderStatus(rootDir, orderId, 'approved', 'تم اعتماد الطلب', { approvedByPhone: from, approvedAt: nowIso() });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('approved', orderId));
    if (profileCan(adminProfile, 'admin.orders.status')) await sendWhatsAppInteractive(rootDir, from, adminOpsButtons(orderId));
    return { ok: true, message: 'تم اعتماد الطلب وإشعار العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_MODIFY) {
    if (isSameStatus(order, 'awaiting_customer_edit')) return { ok: true, message: duplicateStatusMessage(orderId, 'awaiting_customer_edit') };
    if (isTerminalOrderStatus(currentStatus)) return { ok: true, message: blockedTransitionMessage(orderId, currentStatus) };

    await updateOrderStatus(rootDir, orderId, 'awaiting_customer_edit', 'بانتظار تعديل العميل', { adminNotes: 'يرجى مراجعة تفاصيل الطلب مع العميل.' });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('awaiting_customer_edit', orderId, 'يرجى مراجعة تفاصيل الطلب مع الموظف.'));
    return { ok: true, message: 'تم طلب تعديل الطلب من العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_REJECT) {
    if (isSameStatus(order, 'rejected')) return { ok: true, message: duplicateStatusMessage(orderId, 'rejected') };
    if (currentStatus === 'delivered') return { ok: true, message: blockedTransitionMessage(orderId, currentStatus) };

    await updateOrderStatus(rootDir, orderId, 'rejected', 'مرفوض', { adminNotes: 'تم رفض الطلب.' });
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('rejected', orderId));
    return { ok: true, message: 'تم رفض الطلب وإشعار العميل.' };
  }

  if (action === BUTTON_IDS.ADMIN_PREPARING) {
    if (isSameStatus(order, 'preparing')) return { ok: true, message: duplicateStatusMessage(orderId, 'preparing') };
    if (['ready', 'out_for_delivery', 'delivered'].includes(currentStatus)) return { ok: true, message: `لا يمكن العودة للتحضير.` };
    if (['rejected', 'customer_exit', 'cancelled'].includes(currentStatus)) return { ok: true, message: blockedTransitionMessage(orderId, currentStatus) };

    await updateOrderStatus(rootDir, orderId, 'preparing', 'قيد التحضير');
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('preparing', orderId));
    return { ok: true, message: 'تم تحديث الطلب إلى قيد التحضير.' };
  }

  if (action === BUTTON_IDS.ADMIN_READY) {
    if (isSameStatus(order, 'ready')) return { ok: true, message: duplicateStatusMessage(orderId, 'ready') };
    if (['out_for_delivery', 'delivered'].includes(currentStatus)) return { ok: true, message: `تجاوز حالة جاهز.` };
    if (['rejected', 'customer_exit', 'cancelled'].includes(currentStatus)) return { ok: true, message: blockedTransitionMessage(orderId, currentStatus) };

    await updateOrderStatus(rootDir, orderId, 'ready', 'جاهز');
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('ready', orderId));
    return { ok: true, message: 'تم تحديث الطلب إلى جاهز.' };
  }

  if (action === BUTTON_IDS.ADMIN_OUT) {
    if (isSameStatus(order, 'out_for_delivery')) return { ok: true, message: duplicateStatusMessage(orderId, 'out_for_delivery') };
    if (['rejected', 'customer_exit', 'cancelled', 'delivered'].includes(currentStatus)) return { ok: true, message: blockedTransitionMessage(orderId, currentStatus) };

    await updateOrderStatus(rootDir, orderId, 'out_for_delivery', 'قيد التوصيل');
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('out_for_delivery', orderId));
    await sendWhatsAppInteractive(rootDir, from, {
      type: 'button', body: `تأكيد إنهاء الطلب ${orderId}`, buttons: [{ id: `${BUTTON_IDS.ADMIN_DELIVERED}:${orderId}`, title: 'تم التسليم' }]
    });
    return { ok: true, message: 'تم التحديث لقيد التوصيل.' };
  }

  if (action === BUTTON_IDS.ADMIN_DELIVERED) {
    if (isSameStatus(order, 'delivered')) return { ok: true, message: duplicateStatusMessage(orderId, 'delivered') };
    if (['rejected', 'customer_exit', 'cancelled'].includes(currentStatus)) return { ok: true, message: blockedTransitionMessage(orderId, currentStatus) };

    await updateOrderStatus(rootDir, orderId, 'delivered', 'تم التسليم');
    await sendWhatsAppText(rootDir, order.phone, mapPrepStatusToCustomer('delivered', orderId));
    return { ok: true, message: 'تم إغلاق الطلب (تم التسليم).' };
  }

  return { ok: false, message: 'إجراء إداري غير معروف.' };
}

function orderTrackingText(order) {
  if (!order) return 'يا هلا، حالياً ما في طلب مفتوح أو نشط على هذا الرقم. بتقدروا تطلبوا من جديد 🌿';
  return [
    `رقم الطلب: ${order.id}`,
    `حالة الطلب: ${labelFromStatus(order.status)}`,
    order.delivery_slot || order.deliverySlot ? `الموعد المتوقع: ${order.delivery_slot || order.deliverySlot}` : null,
    order.delivery_zone_name || order.deliveryZoneName ? `منطقة التوصيل: ${order.delivery_zone_name || order.deliveryZoneName}` : null,
    order.total_jod || order.totalJod ? `الفاتورة: ${money(order.total_jod || order.totalJod)}` : null
  ].filter(Boolean).join('\n');
}

function selectMessageLanguageValue(selection) {
  if (selection === BUTTON_IDS.EN) return 'en';
  return 'ar';
}

async function sendTrackReply(rootDir, to, fromPhone) {
  const openOrder = await getLatestOpenOrderByPhone(rootDir, fromPhone);
  return sendWhatsAppText(rootDir, to, orderTrackingText(openOrder));
}

async function startOrderFlow(rootDir, to, from, session) {
  session = await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: resetDraftKeepingSession() });
  return { session, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)) };
}

export async function processWhatsAppWebhook(rootDir, req, res, config) {
  try {
    const body = await parseBody(req);
    const value = body.entry?.[0]?.changes?.[0]?.value || body.value || {};
    const message = value.messages?.[0] || null;

    logWebhook('WEBHOOK_IN', { hasMessage: Boolean(message), hasStatuses: Boolean(value.statuses?.[0]), from: message?.from || null, type: message?.type || null, messageId: message?.id || null });

    if (!message) return json(res, 200, { ok: true, ignored: true });

    const messageId = String(message.id || '').trim();
    if (messageId && hasIncomingMessageBeenProcessed(messageId)) {
      return json(res, 200, { ok: true, ignored: true, duplicate: true, messageId });
    }

    markIncomingMessageProcessed(messageId);

    const from = normalizePhone(message.from || '').replace(/^\+/, '');
    const to = from; 
    const type = message.type;
    const text = type === 'text' ? String(message.text?.body || '').trim() : '';
    const selection = readIncomingSelection(message, rootDir);

    try { await saveIncomingMessage(rootDir, { id: message.id || crypto.randomUUID(), from, type, text: buildIncomingMessageLogText(message), payload: message }); } catch (error) { console.error('MESSAGES_LOG_ERROR', error); }

    const adminProfile = isAdminAuthorized(rootDir, from, config) ? getAdminProfile(rootDir, from, config) : null;

    if (adminProfile && (type === 'interactive' || type === 'button')) {
      if (
        selection.startsWith(BUTTON_IDS.ADMIN_APPROVE) || selection.startsWith(BUTTON_IDS.ADMIN_MODIFY) || selection.startsWith(BUTTON_IDS.ADMIN_REJECT) ||
        selection.startsWith(BUTTON_IDS.ADMIN_PREPARING) || selection.startsWith(BUTTON_IDS.ADMIN_READY) || selection.startsWith(BUTTON_IDS.ADMIN_OUT) || selection.startsWith(BUTTON_IDS.ADMIN_DELIVERED)
      ) {
        const outcome = await handleAdminAction(rootDir, from, selection, config);
        const delivered = await sendWhatsAppText(rootDir, to, outcome.message);
        return json(res, 200, { ok: true, delivered, mode: 'admin_action' });
      }

      if (selection === BUTTON_IDS.ADMIN_HOME) {
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminHomeButtons(adminProfile));
        return json(res, 200, { ok: true, delivered, mode: 'admin_home' });
      }

      if (selection === BUTTON_IDS.ADMIN_ORDERS) {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'قسم الطلبات')), mode: 'admin_orders_denied' });
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminOrdersButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders' });
      }

      if (selection === BUTTON_IDS.ADMIN_REPORTS) {
        if (!profileCan(adminProfile, 'admin.reports.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'قسم التقارير')), mode: 'admin_reports_denied' });
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminReportsButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_reports' });
      }

      if (selection === BUTTON_IDS.ADMIN_CAMPAIGNS) {
        if (!profileCan(adminProfile, 'admin.campaigns.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'قسم الحملات')), mode: 'admin_campaigns_denied' });
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminCampaignButtons());
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaigns' });
      }

      if (selection === BUTTON_IDS.ADMIN_ORDERS_NEW) {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'الطلبات الجديدة')), mode: 'admin_orders_new_denied' });
        const delivered = await sendAdminPendingOrders(rootDir, to);
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders_new' });
      }

      if (selection === BUTTON_IDS.ADMIN_ORDERS_FOLLOW) {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'متابعة الطلبات')), mode: 'admin_orders_follow_denied' });
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminFollowupList());
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders_follow' });
      }

      if (selection === BUTTON_IDS.ADMIN_ORDERS_SEARCH) {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'البحث')), mode: 'admin_orders_search_denied' });
        const delivered = await sendWhatsAppText(rootDir, to, 'أرسل رقم الطلب بهذا الشكل:\n/view MAE001');
        return json(res, 200, { ok: true, delivered, mode: 'admin_orders_search_prompt' });
      }

      if (selection.startsWith('admin_follow_status:')) {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'عرض حالات الطلبات')), mode: 'admin_follow_denied' });
        const delivered = await sendAdminOrdersByStatus(rootDir, to, selection.split(':')[1]);
        return json(res, 200, { ok: true, delivered, mode: 'admin_follow_status' });
      }

      if (selection.startsWith('admin_view:')) {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'تفاصيل الطلب')), mode: 'admin_view_denied' });
        const delivered = await sendAdminOrderDetails(rootDir, to, selection.split(':')[1]);
        return json(res, 200, { ok: true, delivered, mode: 'admin_view_order' });
      }

      if (selection === BUTTON_IDS.ADMIN_REPORT_TODAY) {
        if (!profileCan(adminProfile, 'admin.reports.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'تقرير اليوم')), mode: 'admin_report_today_denied' });
        const delivered = await sendAdminQuickReport(rootDir, to, 'اليوم', 'today');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_today' });
      }

      if (selection === BUTTON_IDS.ADMIN_REPORT_WEEK) {
        if (!profileCan(adminProfile, 'admin.reports.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'تقرير الأسبوع')), mode: 'admin_report_week_denied' });
        const delivered = await sendAdminQuickReport(rootDir, to, 'الأسبوع', 'week');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_week' });
      }

      if (selection === BUTTON_IDS.ADMIN_REPORT_MONTH) {
        if (!profileCan(adminProfile, 'admin.reports.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'تقرير الشهر')), mode: 'admin_report_month_denied' });
        const delivered = await sendAdminQuickReport(rootDir, to, 'الشهر', 'month');
        return json(res, 200, { ok: true, delivered, mode: 'admin_report_month' });
      }

      if (selection === BUTTON_IDS.ADMIN_CAMPAIGN_NEW) {
        if (!profileCan(adminProfile, 'admin.campaigns.manage')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'إنشاء الحملات')), mode: 'admin_campaign_new_denied' });
        const delivered = await sendWhatsAppText(rootDir, to, 'وضع إنشاء عرض جديد تم فتحه 🌿\nالخطوة التالية:\n1) اختر المجموعة المستهدفة\n2) جهّز نص الحملة');
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaign_new' });
      }

      if (selection === BUTTON_IDS.ADMIN_CAMPAIGN_SCHEDULE) {
        if (!profileCan(adminProfile, 'admin.campaigns.manage')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'جدولة الحملات')), mode: 'admin_campaign_schedule_denied' });
        const delivered = await sendWhatsAppText(rootDir, to, 'وضع الجدولة تم فتحه 🌿');
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaign_schedule' });
      }

      if (selection === BUTTON_IDS.ADMIN_CAMPAIGN_GROUPS) {
        if (!profileCan(adminProfile, 'admin.groups.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'عرض المجموعات')), mode: 'admin_groups_denied' });
        const delivered = await sendWhatsAppInteractive(rootDir, to, adminGroupsList());
        return json(res, 200, { ok: true, delivered, mode: 'admin_campaign_groups' });
      }

      if (selection.startsWith('admin_group:')) {
        if (!profileCan(adminProfile, 'admin.groups.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'معاينة المجموعات')), mode: 'admin_group_preview_denied' });
        const delivered = await sendCampaignAudiencePreview(rootDir, to, selection.split(':')[1]);
        return json(res, 200, { ok: true, delivered, mode: 'admin_group_selected' });
      }
    }

    if (adminProfile && type === 'text') {
      const command = text.trim();
      const normalizedAdminText = normalizeUserText(command);

      if (command === '/admin' || /^(الاداره|اداره|لوحه الاداره|لوحة الادارة|admin)$/.test(normalizedAdminText)) {
        return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, adminHomeButtons(adminProfile)), mode: 'admin_home_text' });
      }
      if (command === '/pending') {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'الطلبات')), mode: 'admin_pending_denied' });
        return json(res, 200, { ok: true, delivered: await sendAdminPendingOrders(rootDir, to), mode: 'admin_pending' });
      }
      if (command.startsWith('/view ')) {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'عرض الطلب')), mode: 'admin_view_denied_text' });
        return json(res, 200, { ok: true, delivered: await sendAdminOrderDetails(rootDir, to, command.split(' ').slice(1).join(' ').trim()), mode: 'admin_view' });
      }
      if (/^(التقارير|تقارير)$/.test(normalizedAdminText)) {
        if (!profileCan(adminProfile, 'admin.reports.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'التقارير')), mode: 'admin_reports_denied_text' });
        return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, adminReportsButtons()), mode: 'admin_reports_text' });
      }
      if (/^(الطلبات|طلبات)$/.test(normalizedAdminText)) {
        if (!profileCan(adminProfile, 'admin.orders.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'الطلبات')), mode: 'admin_orders_denied_text' });
        return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, adminOrdersButtons()), mode: 'admin_orders_text' });
      }
      if (/^(الحملات|حملات|العروض|عروض)$/.test(normalizedAdminText)) {
        if (!profileCan(adminProfile, 'admin.campaigns.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'الحملات')), mode: 'admin_campaigns_denied_text' });
        return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, adminCampaignButtons()), mode: 'admin_campaigns_text' });
      }
      if (/^\/report-today$/i.test(command)) {
        if (!profileCan(adminProfile, 'admin.reports.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'تقرير اليوم')), mode: 'admin_report_today_denied_text' });
        return json(res, 200, { ok: true, delivered: await sendAdminQuickReport(rootDir, to, 'اليوم', 'today'), mode: 'admin_report_today_text' });
      }
      if (/^\/report-week$/i.test(command)) {
        if (!profileCan(adminProfile, 'admin.reports.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'تقرير الأسبوع')), mode: 'admin_report_week_denied_text' });
        return json(res, 200, { ok: true, delivered: await sendAdminQuickReport(rootDir, to, 'الأسبوع', 'week'), mode: 'admin_report_week_text' });
      }
      if (/^\/report-month$/i.test(command)) {
        if (!profileCan(adminProfile, 'admin.reports.view')) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, adminPermissionDenied(adminProfile, 'تقرير الشهر')), mode: 'admin_report_month_denied_text' });
        return json(res, 200, { ok: true, delivered: await sendAdminQuickReport(rootDir, to, 'الشهر', 'month'), mode: 'admin_report_month_text' });
      }
    }

    let session = await getConversationSession(rootDir, from);
    let sessionData = readSessionData(session);
    const customerProfile = await getCustomerProfileSummary(rootDir, from);

    if (!session) {
      session = await persistSession(rootDir, from, null, { currentState: 'welcome', preferredLanguage: 'ar', consentStatus: 'pending', sessionData: resetDraftKeepingSession() });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, welcomeButtons(customerProfile.isReturning, 'ar')), mode: 'new_welcome' });
    }

    if (selection === BUTTON_IDS.EXIT || selection === BUTTON_IDS.CUSTOMER_EXIT) {
      session = await persistSession(rootDir, from, session, { currentState: 'main_menu', sessionData: resetDraftKeepingSession() });
      return json(res, 200, { ok: true, delivered: await sendMainMenu(rootDir, to, session), mode: 'exit_to_main' });
    }

    if (selection === BUTTON_IDS.HUMAN || textIntent(text) === 'human') {
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, buildHumanContactText(buildTextLinks(config, req))), mode: 'human_contact' });
    }

    if (selection === BUTTON_IDS.AR || selection === BUTTON_IDS.EN) {
      session = await persistSession(rootDir, from, session, { currentState: 'consent', preferredLanguage: selectMessageLanguageValue(selection) });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, consentButtons(selectMessageLanguageValue(selection))), mode: 'consent_prompt' });
    }

    if ([BUTTON_IDS.CONSENT_YES, BUTTON_IDS.CONSENT_SERVICE_ONLY, BUTTON_IDS.CONSENT_NO].includes(selection)) {
      const consentStatus = selection === BUTTON_IDS.CONSENT_YES ? 'marketing_opt_in' : selection === BUTTON_IDS.CONSENT_SERVICE_ONLY ? 'service_only' : 'opt_out';
      session = await persistSession(rootDir, from, session, { currentState: 'main_menu', consentStatus });
      await upsertCustomer(rootDir, { phone: from, preferred_language: session?.preferred_language || 'ar', consent_status: consentStatus });
      return json(res, 200, { ok: true, delivered: await sendMainMenu(rootDir, to, session), mode: 'main_menu' });
    }

    if (selection === BUTTON_IDS.START_ORDER || textIntent(text) === 'order') {
      const outcome = await startOrderFlow(rootDir, to, from, session);
      return json(res, 200, { ok: true, delivered: outcome.delivered, mode: 'order_start' });
    }

    if (selection === BUTTON_IDS.SHOW_MENU || textIntent(text) === 'menu') {
      session = await persistSession(rootDir, from, session, { currentState: 'menu_roots' });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)), mode: 'menu_roots' });
    }

    if (selection === BUTTON_IDS.TRACK_ORDER || textIntent(text) === 'track') {
      return json(res, 200, { ok: true, delivered: await sendTrackReply(rootDir, to, from), mode: 'track' });
    }

    if (selection.startsWith('roots_page:')) {
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, Number(selection.split(':')[1] || 0))), mode: 'roots_page' });
    }

    if (selection.startsWith('root:')) {
      const rootId = resolveRootId(selection.split(':')[1]);
      session = await persistSession(rootDir, from, session, {
        currentState: 'root_filters', lastMenuSection: rootId,
        sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, rootId, categoryFilter: null, meatType: null, statusFilter: null } }
      });
      sessionData = readSessionData(session);
      return json(res, 200, { ok: true, delivered: await promptRootFlow(rootDir, to, session, rootId, 0), mode: 'root_selected' });
    }

    if (selection.startsWith('category_page:')) {
      const [, rootId, pageValue] = selection.split(':');
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, categoryListForRoot(currentRootTitle(rootId), rootId, getRootCategoryOptions(rootDir, rootId, sessionData.orderDraft), Number(pageValue || 0))), mode: 'category_page' });
    }

    if (selection.startsWith('category:')) {
      const [, rootId, slugValue] = selection.split(':');
      const categoryValue = extractCategoryValue(rootDir, rootId, slugValue, sessionData.orderDraft);
      session = await persistSession(rootDir, from, session, { currentState: 'root_filters', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, rootId, categoryFilter: categoryValue } } });
      return json(res, 200, { ok: true, delivered: await promptRootFlow(rootDir, to, session, rootId, 0), mode: 'category_selected' });
    }

    if (selection.startsWith('type:')) {
      const slugValue = selection.split(':')[1];
      const rootId = sessionData.orderDraft.rootId;
      const typeValue = extractTypeValue(rootDir, rootId, slugValue, sessionData.orderDraft) || slugValue;
      session = await persistSession(rootDir, from, session, { currentState: 'item_list', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, meatType: typeValue } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, itemList(rootDir, readSessionData(session).orderDraft, 0)), mode: 'type_selected' });
    }

    if (selection.startsWith('items_page:')) {
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, itemList(rootDir, sessionData.orderDraft, Number(selection.split(':')[1] || 0))), mode: 'items_page' });
    }

    if (selection.startsWith('item:')) {
      const item = getMenuItemById(rootDir, selection.split(':')[1]);
      if (!item) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, 'تعذر العثور على الصنف المطلوب.'), mode: 'item_missing' });
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_quantity', sessionData: { ...sessionData, pendingItemId: item.record_id, pendingExtras: getItemExtras(rootDir, item), awaiting: 'quantity' } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, quantityButtons(item)), mode: 'quantity_prompt' });
    }

    if (selection.startsWith('qty:')) {
      const [, itemId, quantityValue] = selection.split(':');
      const item = getMenuItemById(rootDir, itemId);
      const quantity = Number(quantityValue || 1);

      if (!item || !quantity || quantity < 1) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, 'خطأ في الكمية، يرجى الاختيار من جديد.'), mode: 'quantity_invalid' });

      const extras = getItemExtras(rootDir, item);
      const lineBase = Number(item.price_1_jod || 0) * quantity;
      const cartItem = { id: item.record_id, displayNameAr: item.display_name_ar || item.item_name_ar, unit_ar: item.unit_ar, price_1_jod: Number(item.price_1_jod || 0), quantity, extras: [], notes: null, lineTotalJod: lineBase };
      const cart = [...sessionData.cart, cartItem];

      session = await persistSession(rootDir, from, session, { currentState: extras.length ? 'awaiting_extra_choice' : 'reviewing_cart', sessionData: { ...sessionData, cart, pendingItemId: item.record_id, pendingExtras: extras, awaiting: extras.length ? 'extra_choice' : null } });
      const delivered = extras.length ? await sendWhatsAppInteractive(rootDir, to, extrasList(item, extras)) : await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text));
      return json(res, 200, { ok: true, delivered, mode: 'quantity_saved' });
    }

    if (selection.startsWith('extra:')) {
      const [, itemId, extraId] = selection.split(':');
      const item = getMenuItemById(rootDir, itemId);
      const extraItem = getMenuItemById(rootDir, extraId);

      if (!item || !extraItem || !sessionData.cart.length) return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(sessionData.cart, sessionData.orderDraft).text)), mode: 'extra_missing' });

      const cart = [...sessionData.cart];
      const lastIndex = cart.length - 1;
      const lastItem = { ...cart[lastIndex] };
      const extras = Array.isArray(lastItem.extras) ? [...lastItem.extras] : [];
      extras.push({ id: extraItem.record_id, label: extraItem.display_name_ar || extraItem.item_name_ar, price: Number(extraItem.price_1_jod || 0) });
      lastItem.extras = extras;
      lastItem.lineTotalJod = Number(lastItem.lineTotalJod || 0) + Number(extraItem.price_1_jod || 0);
      cart[lastIndex] = lastItem;

      session = await persistSession(rootDir, from, session, { currentState: 'reviewing_cart', sessionData: { ...sessionData, cart, awaiting: null } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text)), mode: 'extra_saved' });
    }

    if (selection === BUTTON_IDS.ADD_MORE) {
      session = await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: { ...sessionData, pendingItemId: null, pendingExtras: [], awaiting: null } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)), mode: 'add_more' });
    }

    if (selection === BUTTON_IDS.CLEAR_CART) {
      session = await persistSession(rootDir, from, session, { currentState: 'main_menu', sessionData: resetDraftKeepingSession() });
      return json(res, 200, { ok: true, delivered: await sendMainMenu(rootDir, to, session), mode: 'cart_cleared' });
    }

    if (selection === BUTTON_IDS.CHECKOUT) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_day' });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, dayList()), mode: 'day_prompt' });
    }

    if (selection.startsWith('day:')) {
      const [, isoDate, label] = selection.split(':');
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_slot', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, deliveryDayIso: isoDate, deliveryDayLabel: label } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, slotList(config)), mode: 'slot_prompt' });
    }

    if (selection.startsWith('slot:')) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_delivery_type', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, deliverySlot: selection.split(':').slice(1).join(':') } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, deliveryTypeButtons()), mode: 'delivery_type_prompt' });
    }

    if (selection === BUTTON_IDS.DELIVERY) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_sector', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, deliveryType: 'delivery' } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, sectorList(rootDir)), mode: 'sector_prompt' });
    }

    if (selection === BUTTON_IDS.PICKUP) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_payment', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, deliveryType: 'pickup', sectorKey: null, sectorTitle: 'استلام من المطبخ', zoneId: null, zoneName: null, deliveryFeeJod: 0, address: 'استلام من المطبخ' } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, paymentButtons()), mode: 'pickup_selected' });
    }

    if (selection.startsWith('sector_page:')) {
      const page = Number(selection.split(':')[1] || 0);
      const groups = getDeliveryGroupList(rootDir);
      const rows = paginateRows(groups.map(group => ({ id: `sector:${group.key}:0`, title: shortButton(normalizeSectorLabel(group), 24), description: `${group.count} منطقة` })), page, 9, nextPage => `sector_page:${nextPage}`);
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, listMessage('اختر المنطقة الرئيسية أولاً 🌿', 'المناطق', 'المناطق الرئيسية', rows)), mode: 'sector_page' });
    }

    if (selection.startsWith('sector:')) {
      const [, sectorKey, pageValue] = selection.split(':');
      const group = getDeliveryGroupByKey(rootDir, sectorKey);
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_zone', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, sectorKey, sectorTitle: normalizeSectorLabel(group) } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, zoneList(rootDir, sectorKey, Number(pageValue || 0))), mode: 'zone_list' });
    }

    if (selection.startsWith('zone:')) {
      const zoneId = selection.split(':')[1];
      const zone = getDeliveryZoneById(rootDir, zoneId);
      if (!zone) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, 'تعذر تحديد المنطقة. أعد الاختيار.'), mode: 'zone_missing' });

      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_address', sessionData: { ...sessionData, awaiting: 'address', orderDraft: { ...sessionData.orderDraft, zoneId: zone.zone_id, zoneName: zone.zone_name_ar, sectorTitle: `${zone.zone_type} — ${zone.sector_or_governorate}`, deliveryFeeJod: Number(zone.delivery_fee_jod || 0) } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, `اخترنا لكم منطقة ${zone.zone_name_ar} (رسوم التوصيل ${money(zone.delivery_fee_jod)}) 🌿\nيا ريت ترسلوا لنا العنوان بالتفصيل أو تشاركوا الموقع (Location) الآن.`), mode: 'address_prompt' });
    }

    if (selection === BUTTON_IDS.PAY_CASH) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_notes_choice', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, paymentMethod: 'cash' } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, notesButtons()), mode: 'notes_prompt' });
    }

    if (selection === BUTTON_IDS.NOTES_ADD) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_notes_text', sessionData: { ...sessionData, awaiting: 'notes_text' } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, 'اكتبوا لنا أي ملاحظات بتحبوا نراعيها (بدون ملح، محمر زيادة، الخ..) 👨‍🍳'), mode: 'notes_text_prompt' });
    }

    if (selection === BUTTON_IDS.NOTES_SKIP) {
      session = await persistSession(rootDir, from, session, { currentState: 'review_customer_summary', sessionData: { ...sessionData, awaiting: null, orderDraft: { ...sessionData.orderDraft, notes: null } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, { ...sessionData.orderDraft, notes: null }))), mode: 'customer_summary' });
    }

    if (selection === BUTTON_IDS.CUSTOMER_EDIT) {
      session = await persistSession(rootDir, from, session, { currentState: 'editing_summary' });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, editList()), mode: 'edit_list' });
    }

    if (selection === BUTTON_IDS.EDIT_ITEMS) {
      session = await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: { ...sessionData, pendingItemId: null, pendingExtras: [], awaiting: null } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)), mode: 'edit_items' });
    }

    if (selection === BUTTON_IDS.EDIT_SCHEDULE) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_day' });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, dayList()), mode: 'edit_schedule' });
    }

    if (selection === BUTTON_IDS.EDIT_ZONE) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_sector' });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, sectorList(rootDir)), mode: 'edit_zone' });
    }

    if (selection === BUTTON_IDS.EDIT_NOTES) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_notes_choice' });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, notesButtons()), mode: 'edit_notes' });
    }

    if (selection === BUTTON_IDS.CUSTOMER_CONFIRM) {
      const outcome = await createOrUpdateOrderFromDraft(rootDir, from, session);
      if (outcome.error) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, `عذراً 🌿\n${outcome.error}`), mode: 'create_order_error' });

      let adminNotification = { sent: 0, failed: 0, admins: [] };
      try { adminNotification = await notifyAdminsNewOrder(rootDir, outcome.order, config); } catch (error) { console.error('ADMIN_NOTIFY_FATAL', error); }

      const customerMessage = `تم استلام طلبكم اللي بيفتح النفس ✅\nرقم الطلب: ${outcome.order.id}\nتم إرساله للإدارة للمراجعة وتثبيت الموعد. رح نرسل لكم التأكيد هون مباشرة.`;
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, customerMessage), mode: 'sent_to_admin', adminNotification });
    }

    if (type === 'location' && sessionData.awaiting === 'address') {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_payment', sessionData: { ...sessionData, awaiting: null, orderDraft: { ...sessionData.orderDraft, address: buildLocationText(message) } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, paymentButtons()), mode: 'address_location_saved' });
    }

    if (type === 'text' && sessionData.awaiting === 'address') {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_payment', sessionData: { ...sessionData, awaiting: null, orderDraft: { ...sessionData.orderDraft, address: text } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, paymentButtons()), mode: 'address_saved' });
    }

    if (type === 'text' && sessionData.awaiting === 'notes_text') {
      session = await persistSession(rootDir, from, session, { currentState: 'review_customer_summary', sessionData: { ...sessionData, awaiting: null, orderDraft: { ...sessionData.orderDraft, notes: text } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, { ...sessionData.orderDraft, notes: text }))), mode: 'notes_saved' });
    }

    if (['audio', 'image', 'video', 'document', 'sticker', 'contacts', 'reaction'].includes(type)) {
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, buildRichContentReply(message, config, req)), mode: `rich_content_${type}` });
    }

    const fallbackIntent = textIntent(text);
    if (fallbackIntent === 'welcome') return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, customerProfile.isReturning ? welcomeButtons(true) : welcomeButtons(false)), mode: 'welcome_repeat' });
    if (fallbackIntent === 'menu') return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)), mode: 'fallback_menu' });
    if (fallbackIntent === 'track') return json(res, 200, { ok: true, delivered: await sendTrackReply(rootDir, to, from), mode: 'fallback_track' });
    if (fallbackIntent === 'human') return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, buildHumanContactText(buildTextLinks(config, req))), mode: 'fallback_human' });

    return json(res, 200, { ok: true, delivered: await sendMainMenu(rootDir, to, session), mode: 'fallback_main' });
  } catch (error) {
    console.error('WEBHOOK_FATAL_ERROR', error);
    return json(res, 200, { ok: false, recovered: true, message: error.message });
  }
}
