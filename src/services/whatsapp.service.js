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
  AR: 'lang_ar', EN: 'lang_en', HUMAN: 'human_agent',
  CONSENT_YES: 'consent_marketing_opt_in', CONSENT_SERVICE_ONLY: 'consent_service_only', CONSENT_NO: 'consent_no',
  START_ORDER: 'start_order', TRACK_ORDER: 'track_order', SHOW_MENU: 'show_menu', EXIT: 'exit_flow',
  ADD_MORE: 'cart_add_more', CHECKOUT: 'cart_checkout', CLEAR_CART: 'cart_clear',
  DELIVERY: 'delivery_delivery', PICKUP: 'delivery_pickup', PAY_CASH: 'pay_cash',
  NOTES_SKIP: 'notes_skip', NOTES_ADD: 'notes_add',
  CUSTOMER_CONFIRM: 'cust_confirm', CUSTOMER_EDIT: 'cust_edit', CUSTOMER_EXIT: 'cust_exit',
  EDIT_ITEMS: 'edit_items', EDIT_SCHEDULE: 'edit_schedule', EDIT_ZONE: 'edit_zone', EDIT_NOTES: 'edit_notes',

  ADMIN_HOME: 'admin_home', ADMIN_ORDERS: 'admin_orders', ADMIN_REPORTS: 'admin_reports', ADMIN_CAMPAIGNS: 'admin_campaigns',
  ADMIN_ORDERS_NEW: 'orders_new', ADMIN_ORDERS_FOLLOW: 'orders_follow', ADMIN_ORDERS_SEARCH: 'orders_search',
  ADMIN_REPORT_TODAY: 'report_today', ADMIN_REPORT_WEEK: 'report_week', ADMIN_REPORT_MONTH: 'report_month',
  ADMIN_CAMPAIGN_NEW: 'campaign_new', ADMIN_CAMPAIGN_SCHEDULE: 'campaign_schedule', ADMIN_CAMPAIGN_GROUPS: 'campaign_groups',
  ADMIN_APPROVE: 'admin_approve', ADMIN_MODIFY: 'admin_modify', ADMIN_REJECT: 'admin_reject',
  ADMIN_PREPARING: 'admin_preparing', ADMIN_READY: 'admin_ready', ADMIN_OUT: 'admin_out', ADMIN_DELIVERED: 'admin_delivered'
};

const TRACK_TERMS = /(حاله|حالة|متابعه|متابعة|track|tracking|status|طلبي|الطلب|وين طلبي|وين الطلب|طلبي وين)/i;
const INCOMING_MESSAGE_CACHE = new Map();
const INCOMING_MESSAGE_TTL_MS = 10 * 60 * 1000;

function getSafeHost(req) { return req?.headers?.host || process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:10000'; }

export function whatsappVerify(req, res) {
  const url = new URL(req?.url || '/api/webhooks/whatsapp', `http://${getSafeHost(req)}`);
  if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === (process.env.WHATSAPP_VERIFY_TOKEN || '')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(url.searchParams.get('hub.challenge'));
  }
  return json(res, 403, { ok: false, message: 'فشل التحقق من Webhook.' });
}

function markIncomingMessageProcessed(messageId) {
  if (!messageId) return;
  const now = Date.now();
  for (const [key, timestamp] of INCOMING_MESSAGE_CACHE.entries()) {
    if (now - timestamp > INCOMING_MESSAGE_TTL_MS) INCOMING_MESSAGE_CACHE.delete(key);
  }
  INCOMING_MESSAGE_CACHE.set(String(messageId), now);
}

function hasIncomingMessageBeenProcessed(messageId) {
  return messageId && INCOMING_MESSAGE_CACHE.has(String(messageId));
}

function normalizeUrl(value) {
  try { return new URL(String(value || '').trim()).toString().replace(/\/$/, ''); } catch { return ''; }
}

function getBaseUrl(config, req) {
  return normalizeUrl(process.env.WEBSITE_URL) || normalizeUrl(config?.channels?.website) || `https://${getSafeHost(req)}`;
}

function buildTextLinks(config, req) {
  const baseUrl = getBaseUrl(config, req);
  const phone = process.env.WHATSAPP_HUMAN_ESCALATION_NUMBER || config?.site?.businessPhoneDisplay || '';
  const whatsappDigits = phone.replace(/[^\d]/g, '');
  return {
    websiteUrl: baseUrl, menuUrl: `${baseUrl}/menu.html`,
    whatsappUrl: whatsappDigits ? `https://wa.me/${whatsappDigits}` : '', phone
  };
}

function buildHumanContactText(links = {}) {
  const lines = ['يا هلا فيكم، يسعدنا خدمتكم 🌿'];
  if (links.phone) lines.push(`للتواصل المباشر مع المطبخ: ${links.phone}`);
  if (links.whatsappUrl) lines.push(`رابط الواتساب المباشر: ${links.whatsappUrl}`);
  return lines.join('\n');
}

function nowIso() { return new Date().toISOString(); }
function money(value) { return `${Number(value || 0).toFixed(3)} د.أ`; }
function shortButton(title, max = 20) { return String(title || '').trim().slice(0, max); }

function normalizeUserText(value = '') {
  return String(value || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/🌿|✅|🚚|👨‍🍳/g, ' ').trim().toLowerCase()
    .replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function labelFromStatus(status) {
  return { awaiting_admin_review: 'بانتظار تأكيد الإدارة', awaiting_customer_edit: 'بانتظار التعديل', approved: 'تم تأكيد الطلب', preparing: 'قيد التحضير', ready: 'جاهز', out_for_delivery: 'قيد التوصيل', delivered: 'تم التسليم', rejected: 'مرفوض', customer_exit: 'مغلق' }[status] || 'قيد المتابعة';
}

function mapPrepStatusToCustomer(status, orderId, notes = '') {
  if (status === 'approved') return `تم تأكيد طلبكم اللي بيفتح النفس ✅\nرقم الطلب: ${orderId}\nرح نجهز لكم أطيب الأكلات بـ "نَفَس ست البيت". الدفع كاش عند الاستلام، ورح نوافيكم بالتحديثات هون.`;
  if (status === 'awaiting_customer_edit') return `يا هلا فيكم، طلبكم يحتاج تعديل بسيط ليكون بأفضل صورة 🌿\n${notes ? `\nملاحظة من المطبخ: ${notes}` : ''}`;
  if (status === 'rejected') return `نعتذر منكم، ما قدرنا نعتمد الطلب الحالي 😔${notes ? `\n\n${notes}` : '\nيا ريت تتواصلوا معنا لترتيب طلب بديل يرضيكم.'}`;
  if (status === 'preparing') return `أكلكم صار على النار 👨‍🍳🔥\nرقم الطلب: ${orderId}\nقيد التحضير بكل حب وعناية.`;
  if (status === 'ready') return `الأكل صار جاهز ومحمر ومقمر ✅\nرقم الطلب: ${orderId}\nبانتظار التوصيل أو الاستلام.`;
  if (status === 'out_for_delivery') return `المندوب بالطريق لكم 🚚\nرقم الطلب: ${orderId}\nجهزوا السفرة، الأكل السخن واصلكم قريب!`;
  if (status === 'delivered') return 'ألف صحة وهنا على قلوبكم ✅\nنتمنى تكون الأكلات بيضت وجهكم وعجبتكم. شاركونا رأيكم ولا تنسونا بطلباتكم الجاية 🌿';
  return `حالة طلبكم الحالية: ${labelFromStatus(status)}\nرقم الطلب: ${orderId}`;
}

function buildLocationText(message) {
  const { latitude, longitude, name, address } = message.location || {};
  const parts = [];
  if (name) parts.push(name);
  if (address) parts.push(address);
  if (latitude && longitude) parts.push(`https://maps.google.com/?q=${latitude},${longitude}`);
  return parts.join(' — ');
}

function readInteractiveSelectionTitle(message) {
  if (message?.type === 'interactive' && message.interactive?.type === 'button_reply') return message.interactive.button_reply?.title || message.interactive.button_reply?.id || '';
  if (message?.type === 'interactive' && message.interactive?.type === 'list_reply') return message.interactive.list_reply?.title || message.interactive.list_reply?.id || '';
  if (message?.type === 'button') return message.button?.text || message.button?.payload || '';
  return '';
}

function buildIncomingMessageLogText(message) {
  if (!message) return '';
  const type = message.type || '';
  if (type === 'text') return String(message.text?.body || '').trim();
  if (type === 'location') return buildLocationText(message);
  if (type === 'interactive' || type === 'button') return readInteractiveSelectionTitle(message) || JSON.stringify(message);
  if (['image', 'video', 'audio', 'document', 'sticker', 'contacts', 'reaction'].includes(type)) return `[${type}]`;
  return JSON.stringify(message);
}

function baseUnitLabel(item) { return getDisplayUnit(item); }

function defaultDraft() {
  return { rootId: null, meatType: null, statusFilter: null, categoryFilter: null, deliveryType: 'delivery', deliveryDayLabel: null, deliveryDayIso: null, deliverySlot: null, sectorKey: null, sectorTitle: null, zoneId: null, zoneName: null, deliveryFeeJod: 0, address: null, paymentMethod: 'cash', notes: null, revisionOrderId: null };
}

function readSessionData(session) {
  const raw = session?.session_data || session?.sessionData || {};
  return { cart: Array.isArray(raw.cart) ? raw.cart : [], pendingItemId: raw.pendingItemId || null, pendingExtras: Array.isArray(raw.pendingExtras) ? raw.pendingExtras : [], awaiting: raw.awaiting || null, lastOrderId: session?.last_order_id || raw.lastOrderId || null, orderDraft: { ...defaultDraft(), ...(raw.orderDraft || {}) } };
}

async function persistSession(rootDir, phone, session, patch = {}) {
  const current = readSessionData(session);
  const mergedData = {
    cart: patch.sessionData?.cart !== undefined ? patch.sessionData.cart : current.cart,
    pendingItemId: patch.sessionData?.pendingItemId !== undefined ? patch.sessionData.pendingItemId : current.pendingItemId,
    pendingExtras: patch.sessionData?.pendingExtras !== undefined ? patch.sessionData.pendingExtras : current.pendingExtras,
    awaiting: patch.sessionData?.awaiting !== undefined ? patch.sessionData.awaiting : current.awaiting,
    lastOrderId: patch.sessionData?.lastOrderId !== undefined ? patch.sessionData.lastOrderId : current.lastOrderId,
    orderDraft: { ...current.orderDraft, ...(patch.sessionData?.orderDraft || {}) }
  };
  return setConversationSession(rootDir, phone, {
    currentState: patch.currentState || session?.current_state || 'welcome',
    preferredLanguage: 'ar', consentStatus: patch.consentStatus || session?.consent_status || 'pending',
    sessionData: mergedData, lastOrderId: mergedData.lastOrderId
  });
}

function resetDraftKeepingSession() { return { cart: [], pendingItemId: null, pendingExtras: [], awaiting: null, orderDraft: defaultDraft() }; }

// --- رسائل وقوائم البوت (Sales UX) ---

function welcomeButtons(returning = false) {
  const body = returning
    ? 'يا هلا وغلا فيكم من جديد بمطبخ اليوم المركزي 🌿\nنورتونا بطلتكم! جاهزين نجهز لكم أطيب الأكلات اللي تبيض الوجه.'
    : 'يا هلا ومرحبا فيكم بمطبخ اليوم المركزي 🌿\nنقدم لكم أكل بيتي أصيل، مطبوخ بحب وبـ "نَفَس ست البيت"، شغل نظيف ومرتب يبيض وجهكم بالعزايم والجمعات.';
  return {
    type: 'button', body: `${body}\n\nكيف بنقدر نخدمكم اليوم؟`,
    buttons: [{ id: BUTTON_IDS.START_ORDER, title: 'اطلب منيو اليوم 🍲' }, { id: BUTTON_IDS.SHOW_MENU, title: 'تصفح الأصناف 📖' }, { id: BUTTON_IDS.HUMAN, title: 'تواصل مع المطبخ 👨‍🍳' }]
  };
}

function consentButtons() {
  return {
    type: 'button',
    body: 'نادي عروض مطبخ اليوم (VIP) 🌿\n\nحابين تكونوا أول من يعرف عن طبخاتنا اليومية وعروضنا الخاصة؟ بنرسل لكم المنيو اليومي عشان ما تحتاروا بطبخة بكرة 🥘',
    buttons: [
      { id: BUTTON_IDS.CONSENT_YES, title: 'أكيد، اشترك بالعروض 🎉' },
      { id: BUTTON_IDS.CONSENT_SERVICE_ONLY, title: 'لا، للطلبات فقط 🚚' }
    ]
  };
}

function mainMenuButtons() {
  return {
    type: 'button', body: 'القائمة الرئيسية 🌿\nتصفحوا براحتكم، وإحنا بالخدمة لأي استفسار:',
    buttons: [{ id: BUTTON_IDS.SHOW_MENU, title: 'تصفح الأصناف 📖' }, { id: BUTTON_IDS.TRACK_ORDER, title: 'وين طلبي؟ 🚚' }, { id: BUTTON_IDS.HUMAN, title: 'مساعدة موظف 📞' }]
  };
}

function paginateRows(rows, page = 0, pageSize = 9, moreIdFactory = () => '') {
  const start = page * pageSize; const subset = rows.slice(start, start + pageSize);
  if (start + pageSize < rows.length) subset.push({ id: moreIdFactory(page + 1), title: 'عرض المزيد ⬇️', description: 'خيارات إضافية' });
  return subset;
}

function listMessage(body, buttonText, title, rows) {
  return { type: 'list', body, buttonText, sections: [{ title, rows }] };
}

function rootList(rootDir, page = 0) {
  const roots = getBotRoots(rootDir);
  const rows = paginateRows(roots.map(root => ({ id: `root:${root.id}`, title: shortButton(root.title), description: `${root.description}` })), page, 9, nextPage => `roots_page:${nextPage}`);
  return listMessage('منيو مطبخ اليوم المركزي 🌿\nتصفحوا الأقسام براحتكم، ولما يعجبكم طبق اضغطوا عليه للطلب مباشرة.', 'تصفح الأقسام 🍽️', 'الأقسام الرئيسية', rows);
}

function categoryListForRoot(rootTitle, rootId, options, page) {
  const rows = paginateRows(options.map(o => ({ id: `category:${rootId}:${slugify(o.value)}`, title: shortButton(o.label), description: `اضغط لعرض أصناف الـ ${o.label}` })), page, 9, nextPage => `category_page:${rootId}:${nextPage}`);
  return listMessage(`اختاروا التصنيف اللي على ذوقكم من قسم ${rootTitle} 🌿`, 'التصنيفات 📋', rootTitle, rows);
}

// 🟢 الإصلاح الجذري لمشكلة الأسعار: التجميع الذكي للأصناف وحساب أقل سعر
function itemListGrouped(rootDir, filters = {}, page = 0) {
  const items = getItemsForRoot(rootDir, filters);
  const groupedMap = new Map();
  
  for (const item of items) {
    const name = String(item.item_name_ar || item.display_name_ar).trim();
    if (!groupedMap.has(name)) {
      groupedMap.set(name, []);
    }
    groupedMap.get(name).push(item);
  }
  
  const groupedArray = Array.from(groupedMap.entries());
  const rows = paginateRows(groupedArray.map(([name, groupItems]) => {
    // حساب أقل سعر متوفر في هذه المجموعة بشكل صحيح
    const minPrice = Math.min(...groupItems.map(i => Number(i.price_1_jod || 0)));
    return {
      id: `base_item:${name}`,
      title: shortButton(name),
      description: `الأسعار تبدأ من ${money(minPrice)}`
    };
  }), page, 9, nextPage => `items_page:${nextPage}`);
  
  return listMessage('تصفحوا أطباقنا البيتية اللي بتفتح النفس 🌿\nولما يعجبكم طبق اضغطوا عليه لترتيب الطلب.', 'تصفح الأطباق 🍲', 'الأطباق المتاحة', rows);
}

function quantityList(item) {
  const rows = [
    { id: `qty:${item.record_id}:1`, title: '1', description: `بـ ${money(item.price_1_jod)}` },
    { id: `qty:${item.record_id}:2`, title: '2', description: `بـ ${money(Number(item.price_1_jod)*2)}` },
    { id: `qty:${item.record_id}:3`, title: '3', description: `بـ ${money(Number(item.price_1_jod)*3)}` },
    { id: `qty:${item.record_id}:4`, title: '4', description: `بـ ${money(Number(item.price_1_jod)*4)}` },
    { id: `qty:${item.record_id}:5`, title: '5', description: `بـ ${money(Number(item.price_1_jod)*5)}` },
    { id: `manual_qty:${item.record_id}`, title: 'كمية مخصصة ✍️', description: 'مثلاً: 1.5، أو نص طلب' }
  ];
  return listMessage(`اختيار بيشهي: ${item.display_name_ar || item.item_name_ar} 🥘\nالسعر: ${money(item.price_1_jod)} لكل ${baseUnitLabel(item)}\n\nكم ${baseUnitLabel(item)} بتحبوا نجهزلكم؟`, 'اختاروا الكمية 🔢', 'الكميات المتاحة', rows);
}

function extrasList(item, extras = []) {
  const rows = extras.map(extra => ({ id: `extra:${item.record_id}:${extra.id}`, title: shortButton(extra.label), description: `بـ ${money(extra.price)} إضافية` }));
  rows.push({ id: BUTTON_IDS.ADD_MORE, title: 'لا شكراً، بدون إضافات', description: 'متابعة السلة' });
  return listMessage(`حابين تضيفوا لمسة زيادة على ${item.item_name_ar || item.display_name_ar}؟ 😋`, 'الإضافات المتاحة 🧅', 'إضافات الصنف', rows);
}

function cartSummary(cart = [], draft = {}) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = Number(draft.deliveryFeeJod || 0);
  const total = subtotal + deliveryFee;
  const lines = cart.map((item, index) => {
    const extrasLabel = item.extras?.length ? ` + ${item.extras.map(e => e.label).join(' + ')}` : '';
    return `${index + 1}. ${item.displayNameAr} × ${item.quantity}${extrasLabel} = ${money(item.lineTotalJod)}`;
  });
  return { subtotal, deliveryFee, total, text: `سلة طلباتكم بتفتح النفس 🌿\n\n${lines.join('\n') || 'السلة فاضية حالياً'}\n\n${deliveryFee ? `رسوم التوصيل: ${money(deliveryFee)}\n` : ''}الإجمالي الحالي: ${money(total)}` };
}

function cartButtons(summaryText) {
  return {
    type: 'button', body: `${summaryText}\n\n💡 نصيحة ست البيت: السفرة ما بتكمل بدون مقبلات وسلطات تفتح الشهية! حابين تضيفوا شيء ولا نعتمد الطلب؟`,
    buttons: [{ id: BUTTON_IDS.CHECKOUT, title: 'تأكيد السلة ✅' }, { id: BUTTON_IDS.ADD_MORE, title: 'إضافة مقبلات/أصناف 🥗' }, { id: BUTTON_IDS.CLEAR_CART, title: 'إلغاء الطلب ❌' }]
  };
}

function dayList() {
  const now = new Date(); const rows = [];
  for (let i = 0; i < 5; i += 1) {
    const date = new Date(now); date.setDate(now.getDate() + i);
    const label = i === 0 ? 'اليوم (حسب التوافر)' : i === 1 ? 'بكرة' : date.toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'numeric' });
    rows.push({ id: `day:${date.toISOString().slice(0, 10)}:${label}`, title: shortButton(label), description: date.toISOString().slice(0, 10) });
  }
  return listMessage('عشان نجهزلكم الأكل طازج وسخن، متى حابين تستلموا الطلب؟ 🌿', 'اختاروا اليوم 📅', 'الأيام المتاحة', rows);
}

function slotList(config) {
  const slots = config?.deliveryTimeSlots || ['10:00 - 11:00 صباحاً', '11:00 - 12:30 ظهراً', '12:30 - 14:00 ظهراً', '14:00 - 15:30 عصراً', '15:30 - 17:00 عصراً', '17:00 - 18:30 مساءً'];
  return listMessage('واختاروا الوقت اللي بيناسبكم لنوصلكم الأكل سخن 🌿', 'اختاروا الوقت ⏰', 'أوقات التوصيل', slots.map(slot => ({ id: `slot:${slot}`, title: shortButton(slot), description: 'موعد التسليم' })));
}

function deliveryTypeButtons() {
  return {
    type: 'button', body: 'بتحبوا نوصلكم الطلب لباب البيت، ولا بتمروا تستلموه من المطبخ؟ 🚚',
    buttons: [{ id: BUTTON_IDS.DELIVERY, title: 'توصيل لباب البيت 🚚' }, { id: BUTTON_IDS.PICKUP, title: 'استلام من المطبخ 🚶' }, { id: BUTTON_IDS.EXIT, title: 'خروج ❌' }]
  };
}

function sectorList(rootDir) {
  const groups = getDeliveryGroupList(rootDir);
  const rows = paginateRows(groups.map(group => ({ id: `sector:${group.key}:0`, title: shortButton(String(group.title || group.group).trim(), 24), description: `${group.count} منطقة` })), 0, 9, nextPage => `sector_page:${nextPage}`);
  return listMessage('عشان نوصلك بأسرع وقت، حدد محافظتك أو منطقتك الرئيسية أولاً 🌿', 'المحافظة/القطاع 🗺️', 'المناطق الرئيسية', rows);
}

function zoneList(rootDir, sectorKey, page = 0) {
  const group = getDeliveryGroupByKey(rootDir, sectorKey);
  const zones = group?.zones || [];
  const rows = paginateRows(zones.map(zone => ({ id: `zone:${zone.zone_id}`, title: shortButton(zone.zone_name_ar, 24), description: `${zone.zone_name_ar} • التوصيل ${money(zone.delivery_fee_jod)}` })), page, 9, nextPage => `sector:${sectorKey}:${nextPage}`);
  return listMessage(`وين بالضبط في ${String(group.title || group.group).trim()}؟ 🌿`, 'المنطقة الفرعية 📍', 'المناطق الفرعية', rows);
}

function paymentButtons() {
  return {
    type: 'button', body: 'طريقة الدفع المعتمدة عندنا حالياً هي الدفع كاش عند الاستلام لراحتكم 💵',
    buttons: [{ id: BUTTON_IDS.PAY_CASH, title: 'الدفع عند الاستلام 💵' }, { id: BUTTON_IDS.HUMAN, title: 'استفسار من المطبخ 👨‍🍳' }]
  };
}

function notesButtons() {
  return {
    type: 'button', body: 'هل عندكم أي ملاحظات خاصة للطبّاخ؟ (مثلاً: بدون ملح، محمر زيادة، الخ..) 👨‍🍳',
    buttons: [{ id: BUTTON_IDS.NOTES_ADD, title: 'نعم، عندي ملاحظة ✍️' }, { id: BUTTON_IDS.NOTES_SKIP, title: 'لا، بدون ملاحظات' }]
  };
}

function customerSummaryButtons(summaryText) {
  return {
    type: 'button', body: summaryText,
    buttons: [{ id: BUTTON_IDS.CUSTOMER_CONFIRM, title: 'تأكيد وإرسال للمطبخ ✅' }, { id: BUTTON_IDS.CUSTOMER_EDIT, title: 'تعديل الطلب ✏️' }, { id: BUTTON_IDS.CUSTOMER_EXIT, title: 'إلغاء الطلب ❌' }]
  };
}

function buildCustomerFinalSummary(cart = [], draft = {}) {
  const summary = cartSummary(cart, draft);
  return [
    'ملخص طلبكم النهائي 🌿\nراجعوا التفاصيل وتأكدوا إنها تمام التمام:\n',
    ...cart.map((item, index) => `${index + 1}. ${item.displayNameAr} × ${item.quantity}${item.extras?.length ? ` + ${item.extras.map(e => e.label).join(' + ')}` : ''} = ${money(item.lineTotalJod)}`),
    '',
    `📅 اليوم: ${draft.deliveryDayLabel || 'غير محدد'}`, `⏰ الوقت: ${draft.deliverySlot || 'غير محدد'}`,
    `🚚 الاستلام: ${draft.deliveryType === 'pickup' ? 'استلام من المطبخ' : 'توصيل'}`,
    draft.zoneName ? `📍 المنطقة: ${draft.zoneName}` : null, draft.address ? `🏠 العنوان: ${draft.address}` : null,
    `💵 الدفع: ${draft.paymentMethod === 'cash' ? 'كاش' : 'غير محدد'}`, draft.notes ? `✍️ ملاحظات: ${draft.notes}` : null,
    '', draft.deliveryType === 'delivery' ? `رسوم التوصيل: ${money(draft.deliveryFeeJod)}` : null, `المجموع الكلي: ${money(summary.total)}`
  ].filter(Boolean).join('\n');
}

// --- الأوامر الإدارية (Admin Logic) ---
function adminDecisionButtons(orderId) {
  return { type: 'button', body: `إدارة الطلب ${orderId}`, buttons: [{ id: `${BUTTON_IDS.ADMIN_APPROVE}:${orderId}`, title: 'موافقة وتأكيد' }, { id: `${BUTTON_IDS.ADMIN_MODIFY}:${orderId}`, title: 'تعديل' }, { id: `${BUTTON_IDS.ADMIN_REJECT}:${orderId}`, title: 'رفض' }] };
}

async function notifyAdminsNewOrder(rootDir, order, config) {
  const items = await getOrderItems(rootDir, order.id);
  let admins = getActiveAdminPhones(rootDir, config);
  
  if (!admins || admins.length === 0) admins = String(process.env.ADMIN_NUMBERS || '').split(',').map(n => normalizePhone(n)).filter(Boolean);
  if (admins.length === 0) admins = [order.phone];

  const summary = [
    'طلب جديد يحتاج تأكيد 🌿', `رقم الطلب: ${order.id}`, `الهاتف: ${order.phone}`,
    order.customer_name ? `الاسم: ${order.customer_name}` : null, '',
    ...items.map((item, index) => `${index + 1}. ${item.display_name_ar || item.displayNameAr} × ${item.quantity} = ${money(item.line_total_jod || item.lineTotalJod)}`),
    '', `الإجمالي: ${money(order.total_jod || order.totalJod)}`,
    order.delivery_slot ? `الموعد: ${order.delivery_slot}` : null, order.delivery_zone_name ? `المنطقة: ${order.delivery_zone_name}` : null,
    order.address_text ? `العنوان: ${order.address_text}` : null, order.order_notes ? `الملاحظات: ${order.order_notes}` : null
  ].filter(Boolean).join('\n');

  let sent = 0; let failed = 0;
  for (const adminPhone of admins) {
    try {
      await sendWhatsAppText(rootDir, adminPhone, summary);
      await sendWhatsAppInteractive(rootDir, adminPhone, adminDecisionButtons(order.id)); 
      sent += 1;
    } catch (e) { failed += 1; }
  }
  return { sent, failed, admins };
}

function normalizeInteractivePayload(interactive) {
  if (interactive.type === 'button') {
    return {
      type: 'button', body: { text: String(interactive.body || '').slice(0, 1024) },
      action: { buttons: (interactive.buttons || []).slice(0, 3).map(b => ({ type: 'reply', reply: { id: String(b.id || '').slice(0, 256), title: shortButton(b.title || '') } })) }
    };
  }
  if (interactive.type === 'list') {
    return {
      type: 'list', body: { text: String(interactive.body || '').slice(0, 1024) },
      action: {
        button: shortButton(interactive.buttonText || 'عرض الخيارات'),
        sections: (interactive.sections || []).slice(0, 10).map(s => ({
          title: shortButton(s.title || 'الخيارات'),
          rows: (s.rows || []).slice(0, 10).map(r => ({ id: String(r.id || '').slice(0, 200), title: shortButton(r.title || '', 24), description: String(r.description || '').slice(0, 72) }))
        }))
      }
    };
  }
  throw new Error(`INTERACTIVE_TYPE_UNSUPPORTED:${interactive.type}`);
}

async function sendWhatsAppPayload(to, payload) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return { skipped: true, reason: 'بيانات WhatsApp API غير مضبوطة.' };

  const requestBody = JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload });
  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Authorization: `Bearer ${accessToken}` }, body: Buffer.from(requestBody, 'utf8')
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) console.error('WHATSAPP_API_ERROR', { status: response.status, data, payload: JSON.parse(requestBody) });
  return { status: response.status, data };
}

async function sendWhatsAppText(rootDir, to, body) {
  const result = await sendWhatsAppPayload(to, { type: 'text', text: { body } });
  try { await saveOutgoingMessage(rootDir, { id: crypto.randomUUID(), to, type: 'text', text: body, payload: result.data || null }); } catch (error) {}
  return result;
}

async function sendWhatsAppInteractive(rootDir, to, interactive) {
  let normalized;
  try { normalized = normalizeInteractivePayload(interactive); } catch (e) { return sendWhatsAppText(rootDir, to, interactive?.body || 'خطأ في القائمة.'); }

  const result = await sendWhatsAppPayload(to, { type: 'interactive', interactive: normalized });
  try {
    const safePayload = JSON.parse(JSON.stringify({ request_interactive: normalized, response: result.data || null, status: result.status || null }));
    await saveOutgoingMessage(rootDir, { id: crypto.randomUUID(), to, type: `interactive_${normalized.type}`, text: normalized.body?.text || '', payload: safePayload });
  } catch (error) { console.error('MESSAGES_LOG_ERROR', error); }
  
  if (!result.status || result.status < 200 || result.status >= 300) return sendWhatsAppText(rootDir, to, interactive?.body || 'اكتب الخيار المطلوب نصاً.');
  return result;
}

function readIncomingSelection(message, rootDir) {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') return message.interactive.button_reply?.id || '';
  if (message.type === 'interactive' && message.interactive?.type === 'list_reply') return message.interactive.list_reply?.id || '';
  if (message.type === 'button') return message.button?.payload || message.button?.text || '';
  const rawText = String(message.text?.body || '').trim();
  if (rootDir && rawText) {
    const directItem = getMenuItemById(rootDir, rawText);
    if (directItem) return `item:${directItem.record_id}`;
  }
  return '';
}

function textIntent(text = '') {
  const n = normalizeUserText(text);
  if (!n) return 'empty';
  if (/^(مرحبا|السلام عليكم|اهلا|هلا|hello)\b/.test(n)) return 'welcome';
  if (/(المنيو|القائمه|الاصناف|عرض المنيو|menu)/.test(n)) return 'menu';
  if (/(اطلب|ابدا الطلب|طلب جديد|اريد اطلب|order)/.test(n)) return 'order';
  if (/(موظف|خدمه العملاء|تواصل مباشر|agent)/.test(n)) return 'human';
  if (TRACK_TERMS.test(text) || /(وين طلبي|طلبي وين)/.test(n)) return 'track';
  return 'text';
}

// === المعالج الرئيسي (Webhook) ===

export async function processWhatsAppWebhook(rootDir, req, res, config) {
  try {
    const body = await parseBody(req);
    const value = body.entry?.[0]?.changes?.[0]?.value || body.value || {};
    const message = value.messages?.[0] || null;

    if (!message) return json(res, 200, { ok: true, ignored: true });
    if (hasIncomingMessageBeenProcessed(message.id)) return json(res, 200, { ok: true, ignored: true, duplicate: true });
    markIncomingMessageProcessed(message.id);

    const from = normalizePhone(message.from || '').replace(/^\+/, '');
    const to = from; 
    const type = message.type;
    const text = type === 'text' ? String(message.text?.body || '').trim() : '';
    const selection = readIncomingSelection(message, rootDir);

    try { await saveIncomingMessage(rootDir, { id: message.id || crypto.randomUUID(), from, type, text: buildIncomingMessageLogText(message), payload: message }); } catch (error) {}

    const adminProfile = isAdminAuthorized(rootDir, from, config) ? getAdminProfile(rootDir, from, config) : null;
    
    // مسار الأوامر الإدارية (تُركت للسرية)
    if (adminProfile && selection.startsWith('admin_')) {
        // يتم التعامل معها في السيرفر
    }

    let session = await getConversationSession(rootDir, from);
    let sessionData = readSessionData(session);
    const customerProfile = await getCustomerProfileSummary(rootDir, from);

    // --- إدخال الكمية يدوياً ---
    if (type === 'text' && sessionData.awaiting === 'manual_qty') {
      const item = getMenuItemById(rootDir, sessionData.pendingItemId);
      if (!item) return json(res, 200, { ok: true, mode: 'manual_qty_err' });
      
      const parsedQty = parseFloat(text);
      const isNumeric = !isNaN(parsedQty) && parsedQty > 0;
      const quantity = isNumeric ? parsedQty : 1; 
      const notes = isNumeric ? null : `الكمية المكتوبة يدوياً: ${text}`;
      const lineBase = Number(item.price_1_jod || 0) * quantity;
      
      const cartItem = { id: item.record_id, displayNameAr: item.display_name_ar || item.item_name_ar, unit_ar: item.unit_ar, price_1_jod: Number(item.price_1_jod || 0), quantity, extras: [], notes, lineTotalJod: lineBase };
      const cart = [...sessionData.cart, cartItem];
      
      session = await persistSession(rootDir, from, session, { currentState: 'reviewing_cart', sessionData: { ...sessionData, cart, awaiting: null } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text)), mode: 'manual_qty_saved' });
    }

    // --- استقبال العميل الجديد وعرض نادي العروض ---
    if (!session) {
      session = await persistSession(rootDir, from, null, { currentState: 'consent_prompt', sessionData: resetDraftKeepingSession() });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, consentButtons()), mode: 'new_welcome' });
    }

    // --- الموافقة على نادي العروض (VIP) ---
    if ([BUTTON_IDS.CONSENT_YES, BUTTON_IDS.CONSENT_SERVICE_ONLY].includes(selection)) {
      const consentStatus = selection === BUTTON_IDS.CONSENT_YES ? 'marketing_opt_in' : 'service_only';
      session = await persistSession(rootDir, from, session, { currentState: 'main_menu', consentStatus });
      await upsertCustomer(rootDir, { phone: from, preferred_language: 'ar', consent_status: consentStatus });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, welcomeButtons(customerProfile.isReturning)), mode: 'welcome_after_consent' });
    }

    if (selection === BUTTON_IDS.EXIT) {
      session = await persistSession(rootDir, from, session, { currentState: 'main_menu', sessionData: resetDraftKeepingSession() });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, mainMenuButtons()), mode: 'exit_to_main' });
    }

    if (selection === BUTTON_IDS.START_ORDER || selection === BUTTON_IDS.SHOW_MENU || textIntent(text) === 'menu' || textIntent(text) === 'order') {
      session = await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: resetDraftKeepingSession() });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)), mode: 'order_start' });
    }

    if (selection.startsWith('roots_page:')) {
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, Number(selection.split(':')[1] || 0))), mode: 'roots_page' });
    }

    if (selection.startsWith('root:')) {
      const rootId = resolveRootId(selection.split(':')[1]);
      session = await persistSession(rootDir, from, session, { currentState: 'root_filters', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, rootId } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, itemListGrouped(rootDir, { rootId }, 0)), mode: 'root_selected' });
    }

    // --- عرض الخيارات الفرعية للصنف بشكل مرتب (مثال: أحجام المنسف) ---
    if (selection.startsWith('base_item:')) {
      const baseName = selection.split(':')[1];
      const allItems = getItemsForRoot(rootDir, sessionData.orderDraft)
        .filter(i => (i.item_name_ar || i.display_name_ar) === baseName)
        // 🟢 فرز الأصناف تصاعدياً حسب السعر
        .sort((a, b) => Number(a.price_1_jod || 0) - Number(b.price_1_jod || 0));
      
      if (allItems.length === 1) {
        const item = allItems[0];
        session = await persistSession(rootDir, from, session, { currentState: 'awaiting_quantity', sessionData: { ...sessionData, pendingItemId: item.record_id, pendingExtras: getItemExtras(rootDir, item), awaiting: 'quantity' } });
        return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, quantityList(item)), mode: 'quantity_prompt' });
      }
      
      const rows = allItems.map(item => ({ id: `item:${item.record_id}`, title: shortButton(item.display_name_ar), description: `السعر: ${money(item.price_1_jod)}` }));
      const delivered = await sendWhatsAppInteractive(rootDir, to, listMessage(`يا سلام على الـ ${baseName}! 😋\nمتوفر بالأحجام التالية، شو بيناسبكم؟`, 'اختاروا الحجم 📏', 'الأحجام المتاحة', rows));
      return json(res, 200, { ok: true, delivered, mode: 'variation_prompt' });
    }

    if (selection.startsWith('items_page:')) {
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, itemListGrouped(rootDir, sessionData.orderDraft, Number(selection.split(':')[1] || 0))), mode: 'items_page' });
    }

    if (selection.startsWith('item:')) {
      const item = getMenuItemById(rootDir, selection.split(':')[1]);
      if (!item) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, 'تعذر العثور على الصنف.'), mode: 'item_missing' });
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_quantity', sessionData: { ...sessionData, pendingItemId: item.record_id, pendingExtras: getItemExtras(rootDir, item), awaiting: 'quantity' } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, quantityList(item)), mode: 'quantity_prompt' });
    }

    if (selection.startsWith('manual_qty:')) {
      const itemId = selection.split(':')[1];
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_manual_quantity', sessionData: { ...sessionData, pendingItemId: itemId, awaiting: 'manual_qty' } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, 'اكتبوا لنا الكمية اللي بتحتاجوها (مثلاً: 1.5 كيلو، أو نص طلب) ✍️'), mode: 'manual_qty_prompt' });
    }

    if (selection.startsWith('qty:')) {
      const [, itemId, quantityValue] = selection.split(':');
      const item = getMenuItemById(rootDir, itemId);
      const quantity = Number(quantityValue || 1);

      if (!item) return json(res, 200, { ok: true, mode: 'quantity_invalid' });

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
      const item = getMenuItemById(rootDir, itemId); const extraItem = getMenuItemById(rootDir, extraId);
      if (!item || !extraItem || !sessionData.cart.length) return json(res, 200, { ok: true, mode: 'extra_missing' });

      const cart = [...sessionData.cart]; const lastIndex = cart.length - 1; const lastItem = { ...cart[lastIndex] };
      const extras = Array.isArray(lastItem.extras) ? [...lastItem.extras] : [];
      extras.push({ id: extraItem.record_id, label: extraItem.display_name_ar || extraItem.item_name_ar, price: Number(extraItem.price_1_jod || 0) });
      lastItem.extras = extras; lastItem.lineTotalJod = Number(lastItem.lineTotalJod || 0) + Number(extraItem.price_1_jod || 0); cart[lastIndex] = lastItem;

      session = await persistSession(rootDir, from, session, { currentState: 'reviewing_cart', sessionData: { ...sessionData, cart, awaiting: null } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, cartButtons(cartSummary(cart, sessionData.orderDraft).text)), mode: 'extra_saved' });
    }

    if (selection === BUTTON_IDS.ADD_MORE) {
      session = await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: { ...sessionData, awaiting: null } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)), mode: 'add_more' });
    }

    if (selection === BUTTON_IDS.CLEAR_CART) {
      session = await persistSession(rootDir, from, session, { currentState: 'main_menu', sessionData: resetDraftKeepingSession() });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, mainMenuButtons()), mode: 'cart_cleared' });
    }

    if (selection === BUTTON_IDS.CHECKOUT) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_day' });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, dayList()), mode: 'day_prompt' });
    }

    if (selection.startsWith('day:')) {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_slot', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, deliveryDayIso: selection.split(':')[1], deliveryDayLabel: selection.split(':')[2] } } });
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
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_payment', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, deliveryType: 'pickup', sectorTitle: 'استلام من المطبخ', address: 'استلام من المطبخ' } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, paymentButtons()), mode: 'pickup_selected' });
    }

    if (selection.startsWith('sector_page:')) {
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, sectorList(rootDir)), mode: 'sector_page' });
    }

    if (selection.startsWith('sector:')) {
      const group = getDeliveryGroupByKey(rootDir, selection.split(':')[1]);
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_zone', sessionData: { ...sessionData, orderDraft: { ...sessionData.orderDraft, sectorKey: selection.split(':')[1], sectorTitle: group.title || group.group } } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, zoneList(rootDir, selection.split(':')[1], 0)), mode: 'zone_list' });
    }

    if (selection.startsWith('zone:')) {
      const zone = getDeliveryZoneById(rootDir, selection.split(':')[1]);
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_address', sessionData: { ...sessionData, awaiting: 'address', orderDraft: { ...sessionData.orderDraft, zoneId: zone.zone_id, zoneName: zone.zone_name_ar, deliveryFeeJod: Number(zone.delivery_fee_jod || 0) } } });
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
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, sessionData.orderDraft))), mode: 'customer_summary' });
    }

    if (selection === BUTTON_IDS.CUSTOMER_EDIT) {
      session = await persistSession(rootDir, from, session, { currentState: 'menu_roots', sessionData: { ...sessionData, pendingItemId: null, pendingExtras: [], awaiting: null } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)), mode: 'edit_items' });
    }

    if (selection === BUTTON_IDS.CUSTOMER_CONFIRM) {
      const outcome = await createOrUpdateOrderFromDraft(rootDir, from, session);
      if (outcome.error) return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, `عذراً 🌿\n${outcome.error}`), mode: 'create_order_error' });

      try { await notifyAdminsNewOrder(rootDir, outcome.order, config); } catch (error) { console.error('ADMIN_NOTIFY_FATAL', error); }
      // 🟢 رسالة الإرسال الاحترافية لتعزيز الثقة و Social Proof
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, to, `تم رفع طلبكم للإدارة لتأكيد الموعد والتوافر ✅\nرقم الطلب: ${outcome.order.id}\nثواني وبنأكد لكم الطلب هون، جهزوا السفرة 🌿`), mode: 'sent_to_admin' });
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
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, customerSummaryButtons(buildCustomerFinalSummary(sessionData.cart, sessionData.orderDraft))), mode: 'notes_saved' });
    }

    const fallbackIntent = textIntent(text);
    if (fallbackIntent === 'welcome') return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, welcomeButtons(customerProfile.isReturning)), mode: 'welcome_repeat' });
    if (fallbackIntent === 'menu') return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, rootList(rootDir, 0)), mode: 'fallback_menu' });
    
    return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, to, mainMenuButtons()), mode: 'fallback_main' });
  } catch (error) {
    console.error('WEBHOOK_FATAL_ERROR', error);
    return json(res, 200, { ok: false, recovered: true, message: error.message });
  }
}
