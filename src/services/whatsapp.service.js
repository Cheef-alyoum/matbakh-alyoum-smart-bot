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
const TRACK_TERMS = /(ط­ط§ظ„ط©|ظ…طھط§ط¨ط¹ط©|ظˆظٹظ†|ط¬ط§ظ‡ط²|ظˆطµظ„|ط·ظ„ط¨ظٹ|tracking|track|status)/i;

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

  return json(res, 403, { ok: false, message: 'ظپط´ظ„ ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† Webhook.' });
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
  return `${Number(value || 0).toFixed(3)} ط¯.ط£`;
}

function labelFromStatus(status) {
  return {
    awaiting_admin_review: 'ط¨ط§ظ†طھط¸ط§ط± ط§ط¹طھظ…ط§ط¯ ط§ظ„ط¥ط¯ط§ط±ط©',
    awaiting_customer_edit: 'ط¨ط§ظ†طھط¸ط§ط± طھط¹ط¯ظٹظ„ظƒ',
    approved: 'طھظ… ط§ط¹طھظ…ط§ط¯ ط§ظ„ط·ظ„ط¨',
    preparing: 'ظ‚ظٹط¯ ط§ظ„طھط­ط¶ظٹط±',
    ready: 'ط·ظ„ط¨ظƒ ط¬ط§ظ‡ط²',
    out_for_delivery: 'ظ‚ظٹط¯ ط§ظ„طھظˆطµظٹظ„',
    delivered: 'طھظ… ط§ظ„طھط³ظ„ظٹظ…',
    rejected: 'ظ„ظ… ظٹطھظ… ط§ط¹طھظ…ط§ط¯ ط§ظ„ط·ظ„ط¨',
    customer_exit: 'طھظ… ط¥ط؛ظ„ط§ظ‚ ط§ظ„ط·ظ„ط¨'
  }[status] || 'ظ‚ظٹط¯ ط§ظ„ظ…طھط§ط¨ط¹ط©';
}

function mapPrepStatusToCustomer(status, orderId, notes = '') {
  if (status === 'approved') {
    return `طھظ… ط§ط¹طھظ…ط§ط¯ ط·ظ„ط¨ظƒ âœ…\nط±ظ‚ظ… ط§ظ„ط·ظ„ط¨: ${orderId}\nط·ط±ظٹظ‚ط© ط§ظ„ط¯ظپط¹: ط§ظ„ط¯ظپط¹ ط¹ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ… - ظƒط§ط´\nط³ظ†ظˆط§ظپظٹظƒ ط¨طھط­ط¯ظٹط«ط§طھ ط§ظ„ط·ظ„ط¨ ط­طھظ‰ ط§ظ„طھط³ظ„ظٹظ….`;
  }
  if (status === 'awaiting_customer_edit') {
    return `ط·ظ„ط¨ظƒ ظٹط­طھط§ط¬ طھط¹ط¯ظٹظ„ظ‹ط§ ط¨ط³ظٹط·ظ‹ط§ ظ‚ط¨ظ„ ط§ظ„ط§ط¹طھظ…ط§ط¯ ًںŒ؟\nط³ظ†ط±طھط¨ ظ…ط¹ظƒ ط§ظ„طھط¹ط¯ظٹظ„ ط§ظ„ط¢ظ† ط­طھظ‰ ظ†ط«ط¨ظ‘طھظ‡ ط¨ط§ظ„ط´ظƒظ„ ط§ظ„طµط­ظٹط­.${notes ? `\n\nظ…ظ„ط§ط­ط¸ط© ط§ظ„ط¥ط¯ط§ط±ط©: ${notes}` : ''}`;
  }
  if (status === 'rejected') {
    return `ظ†ط¹طھط°ط± ظ…ظ†ظƒطŒ ظ„ظ… ظٹطھظ… ط§ط¹طھظ…ط§ط¯ ط§ظ„ط·ظ„ط¨ ط§ظ„ط­ط§ظ„ظٹ. ط¥ط°ط§ ط±ط؛ط¨طھ ظ†ط¹ظٹط¯ طھط±طھظٹط¨ظ‡ ظ…ط¹ظƒ ط£ظˆ ظ†ط­ظˆظ„ظƒ ظ…ط¨ط§ط´ط±ط© ظ„ظ…ظˆط¸ظپ.${notes ? `\n\n${notes}` : ''}`;
  }
  if (status === 'preparing') return `ط·ظ„ط¨ظƒ ط§ظ„ط¢ظ† ظ‚ظٹط¯ ط§ظ„طھط­ط¶ظٹط± ًں‘¨â€چًںچ³\nط±ظ‚ظ… ط§ظ„ط·ظ„ط¨: ${orderId}`;
  if (status === 'ready') return `ط·ظ„ط¨ظƒ ط£طµط¨ط­ ط¬ط§ظ‡ط²ظ‹ط§ âœ…\nط±ظ‚ظ… ط§ظ„ط·ظ„ط¨: ${orderId}`;
  if (status === 'out_for_delivery') return `ط·ظ„ط¨ظƒ ظ‚ظٹط¯ ط§ظ„طھظˆطµظٹظ„ ط§ظ„ط¢ظ† ًںڑڑ\nط±ظ‚ظ… ط§ظ„ط·ظ„ط¨: ${orderId}`;
  if (status === 'delivered') return `طھظ… طھط³ظ„ظٹظ… ط·ظ„ط¨ظƒ ط¨ظ†ط¬ط§ط­ âœ…\nظ†طھظ…ظ†ظ‰ ظ„ظƒ ظˆط¬ط¨ط© ظ‡ظ†ظٹظ‘ط© ظˆظ†ط³ط¹ط¯ ط¨طھظ‚ظٹظٹظ…ظƒ ط¨ط¹ط¯ ط§ظ„طھط¬ط±ط¨ط©.`;
  return `ط­ط§ظ„ط© ط·ظ„ط¨ظƒ ط§ظ„ط­ط§ظ„ظٹط©: ${labelFromStatus(status)}\nط±ظ‚ظ… ط§ظ„ط·ظ„ط¨: ${orderId}`;
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
  const simple = text.replace(/ًںŒ؟|âœ…|ًںڑڑ|ًں‘¨â€چًںچ³/g, '').trim();
  const map = {
    'ط§ظ„ط¹ط±ط¨ظٹط©': BUTTON_IDS.AR,
    'english': BUTTON_IDS.EN,
    'ط£ظˆط§ظپظ‚': BUTTON_IDS.CONSENT_YES,
    'ط®ط¯ظ…ط© ظپظ‚ط·': BUTTON_IDS.CONSENT_SERVICE_ONLY,
    'ظ„ط§ ط£ظˆط§ظپظ‚': BUTTON_IDS.CONSENT_NO,
    'ط§ط·ظ„ط¨': BUTTON_IDS.START_ORDER,
    'ط§ط¨ط¯ط£ ط§ظ„ط·ظ„ط¨': BUTTON_IDS.START_ORDER,
    'ط§ظ„ظ…ظ†ظٹظˆ': BUTTON_IDS.SHOW_MENU,
    'طھطھط¨ط¹': BUTTON_IDS.TRACK_ORDER,
    'ظ…ظˆط¸ظپ': BUTTON_IDS.HUMAN,
    'ظ…ظˆط¸ظپ ظ…ط¨ط§ط´ط±': BUTTON_IDS.HUMAN,
    'ط¥ط¶ط§ظپط©': BUTTON_IDS.ADD_MORE,
    'ظ…طھط§ط¨ط¹ط©': BUTTON_IDS.CHECKOUT,
    'ط¥ظ„ط؛ط§ط،': BUTTON_IDS.CLEAR_CART,
    'طھظˆطµظٹظ„': BUTTON_IDS.DELIVERY,
    'ط§ط³طھظ„ط§ظ…': BUTTON_IDS.PICKUP,
    'ظƒط§ط´': BUTTON_IDS.PAY_CASH,
    'ظ…ظ„ط§ط­ط¸ط§طھ': BUTTON_IDS.NOTES_ADD,
    'ط¨ط¯ظˆظ† ظ…ظ„ط§ط­ط¸ط§طھ': BUTTON_IDS.NOTES_SKIP,
    'طھط£ظƒظٹط¯': BUTTON_IDS.CUSTOMER_CONFIRM,
    'طھط¹ط¯ظٹظ„': BUTTON_IDS.CUSTOMER_EDIT,
    'ط®ط±ظˆط¬': BUTTON_IDS.CUSTOMER_EXIT,
    'ط§ظ„ط£طµظ†ط§ظپ': BUTTON_IDS.EDIT_ITEMS,
    'ط§ظ„ظ…ظˆط¹ط¯': BUTTON_IDS.EDIT_SCHEDULE,
    'ط§ظ„ظ…ظ†ط·ظ‚ط©': BUTTON_IDS.EDIT_ZONE,
    'ط§ظ„ظ…ظ„ط§ط­ط¸ط§طھ': BUTTON_IDS.EDIT_NOTES
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
  return parts.join(' â€” ');
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
    ? 'ظٹط³ط¹ط¯ظ†ط§ طھظˆط§طµظ„ظƒ ظ…ط¹ظ†ط§ ظ…ظ† ط¬ط¯ظٹط¯ ًںŒ؟\nظ†ط±طھط¨ ظ„ظƒ ط·ظ„ط¨ظƒ ط¨ط³ط±ط¹ط© ظˆظ†ط­ظپط¸ ظ„ظƒ ط§ظ„ظ…طھط§ط¨ط¹ط© ظ…ظ† ط±ظ‚ظ…ظƒ ظ…ط¨ط§ط´ط±ط©. ط§ط®طھط± ط§ظ„ظ„ط؛ط© ط£ظˆ ط§ط·ظ„ط¨ ظ…ظˆط¸ظپظ‹ط§.'
    : 'ط£ظ‡ظ„ظ‹ط§ ظˆط³ظ‡ظ„ظ‹ط§ ط¨ظƒ ظپظٹ ظ…ط·ط¨ط® ط§ظ„ظٹظˆظ… ط§ظ„ظ…ط±ظƒط²ظٹ ًںŒ؟\nط£ظƒظ„ط§طھ ط¨ظٹطھظٹط© ظ…ط­ظ„ظٹط© ط¨ط·ط¹ظ… ط£طµظٹظ„ ظˆط¬ظˆط¯ط© طھظ„ظٹظ‚ ط¨ط°ظˆظ‚ظƒ. ط§ط®طھط± ط§ظ„ظ„ط؛ط© ط£ظˆ ط§ط·ظ„ط¨ ط§ظ„ظ…ط³ط§ط¹ط¯ط© ظ…ظ† ظ…ظˆط¸ظپ ظ…ط¨ط§ط´ط±.';
  if (language === 'en') {
    return {
      type: 'button',
      body: { text: 'Welcome to Matbakh Al Youm. Choose your language or contact a staff member directly.' },
      action: { buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.AR, title: shortButton('ط§ظ„ط¹ط±ط¨ظٹط©') } },
        { type: 'reply', reply: { id: BUTTON_IDS.EN, title: shortButton('English') } },
        { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('Staff') } }
      ] }
    };
  }
  return {
    type: 'button',
    body: { text: body },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.AR, title: shortButton('ط§ظ„ط¹ط±ط¨ظٹط©') } },
      { type: 'reply', reply: { id: BUTTON_IDS.EN, title: shortButton('English') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('ظ…ظˆط¸ظپ') } }
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
    body: { text: 'ظ‚ط¨ظ„ ط§ظ„ظ…طھط§ط¨ط¹ط© ًںŒ؟\nظ†ط³طھط®ط¯ظ… ط¨ظٹط§ظ†ط§طھ ط§ظ„ظ…ط­ط§ط¯ط«ط© ظ„طھط­ط³ظٹظ† ط§ظ„ط®ط¯ظ…ط© ظˆطھظ†ط¸ظٹظ… ط§ظ„ط·ظ„ط¨ط§طھ ط¶ظ…ظ† ط­ط¯ظˆط¯ ط§ظ„ط¹ظ…ظ„. ظ‡ظ„ طھظˆط§ظپظ‚ظˆظ† ط¹ظ„ظ‰ ط§ط³طھظ‚ط¨ط§ظ„ ط§ظ„ط¹ط±ظˆط¶ ظˆط§ظ„طھط­ط¯ظٹط«ط§طھ ط§ظ„ظ…ط±طھط¨ط·ط© ط¨ط§ظ„ط®ط¯ظ…ط©طں' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_YES, title: shortButton('ط£ظˆط§ظپظ‚') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_SERVICE_ONLY, title: shortButton('ط®ط¯ظ…ط© ظپظ‚ط·') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_NO, title: shortButton('ظ„ط§ ط£ظˆط§ظپظ‚') } }
    ] }
  };
}

function mainMenuButtons() {
  return {
    type: 'button',
    body: { text: 'ظƒظٹظپ ظٹظ…ظƒظ†ظ†ط§ ط®ط¯ظ…طھظƒ ط§ظ„ظٹظˆظ…طں ط§ط®طھط± ط§ظ„ظ…ط³ط§ط± ط§ظ„ظ…ظ†ط§ط³ط¨ ظˆط³ظ†ظƒظ…ظ„ ظ…ط¹ظƒ ط®ط·ظˆط© ط¨ط®ط·ظˆط© ًںŒ؟' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.START_ORDER, title: shortButton('ط§ط·ظ„ط¨') } },
      { type: 'reply', reply: { id: BUTTON_IDS.TRACK_ORDER, title: shortButton('طھطھط¨ط¹') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('ظ…ظˆط¸ظپ') } }
    ] }
  };
}

function rootList(rootDir) {
  const rows = getBotRoots(rootDir).slice(0, 10).map(root => ({
    id: `root:${root.id}`,
    title: shortButton(root.title),
    description: `${root.count} ط®ظٹط§ط±`
  }));
  return {
    type: 'list',
    body: { text: 'ط§ط®طھط± ط§ظ„ظ‚ط³ظ… ط§ظ„ط±ط¦ظٹط³ظٹ ط£ظˆظ„ظ‹ط§طŒ ظˆط¨ط¹ط¯ظ‡ط§ ظ†ط±طھط¨ ظ„ظƒ ط§ظ„ظ†ظˆط¹ ظˆط§ظ„طµظ†ظپ ظˆط§ظ„ظƒظ…ظٹط© ط¨ط´ظƒظ„ ط§ط­طھط±ط§ظپظٹ ًںŒ؟' },
    action: {
      button: 'ط§ظ„ط£ظ‚ط³ط§ظ…',
      sections: [{ title: 'ظ…ظ†ظٹظˆ ظ…ط·ط¨ط® ط§ظ„ظٹظˆظ…', rows }]
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
    return simpleChoiceList('ط§ط®طھط± ظ†ظˆط¹ ط§ظ„ظ„ط­ظ… ط£ظˆظ„ظ‹ط§ ًںŒ؟', 'ط§ط®طھط±', 'ظ†ظˆط¹ ط§ظ„ظ„ط­ظ…', [
      { id: 'type:ط¨ظ„ط¯ظٹ', title: 'ط¨ظ„ط¯ظٹ', description: 'ط£ط·ط¨ط§ظ‚ ط§ظ„ظ„ط­ظˆظ… ط§ظ„ط¨ظ„ط¯ظٹ' },
      { id: 'type:ط±ظˆظ…ط§ظ†ظٹ', title: 'ط±ظˆظ…ط§ظ†ظٹ', description: 'ط£ط·ط¨ط§ظ‚ ط§ظ„ظ„ط­ظˆظ… ط§ظ„ط±ظˆظ…ط§ظ†ظٹ' }
    ]);
  }
  if (rootId === 'catering') {
    return simpleChoiceList('ط§ط®طھط± ظپط¦ط© ط§ظ„ظˆظ„ظٹظ…ط© ط£ظˆظ„ظ‹ط§ ًںŒ؟', 'ط§ظ„ظپط¦ط§طھ', 'ط§ظ„ظˆظ„ط§ط¦ظ…', [
      { id: 'category:ط®ط§ط±ظˆظپ ظƒط§ظ…ظ„', title: 'ط®ط§ط±ظˆظپ ظƒط§ظ…ظ„', description: 'ظˆظ„ط§ط¦ظ… ظƒط§ظ…ظ„ط©' },
      { id: 'category:ظ†طµظپ ط®ط§ط±ظˆظپ', title: 'ظ†طµظپ ط®ط§ط±ظˆظپ', description: 'ظ†طµظپ ط°ط¨ظٹط­ط©' },
      { id: 'category:ط¶ظ„ط¹ط©', title: 'ط¶ظ„ط¹ط©', description: 'ظ…ط­ط§ط´ظٹ ط§ظ„ط¶ظ„ط¹ط©' }
    ]);
  }
  return null;
}

function statusRowsFromItems(items) {
  const map = new Map([
    ['ready', { title: 'ظ…ط·ط¨ظˆط®', description: 'ط¬ط§ظ‡ط² ظ„ظ„ط£ظƒظ„' }],
    ['raw', { title: 'ط¬ط§ظ‡ط² ظ„ظ„ط·ط¨ط®', description: 'طھط­ط¶ظٹط± ظ…ظ†ط²ظ„ظٹ' }],
    ['frozen', { title: 'ظ…ظپط±ط²', description: 'ط­ظپط¸ ط¨ط§ظ„طھط¬ظ…ظٹط¯' }],
    ['made_to_order', { title: 'ط­ط³ط¨ ط§ظ„ط·ظ„ط¨', description: 'ظٹظڈط­ط¶ظ‘ط± ظ„ظƒ' }],
    ['bundle', { title: 'ط§ظ„ط¹ط±ظˆط¶', description: 'ظˆط¬ط¨ط§طھ ظ…ط¬ظ…ط¹ط©' }]
  ]);
  return [...new Set(items.map(item => item.status).filter(Boolean))]
    .filter(status => map.has(status))
    .map(status => ({ id: `status:${status}`, title: shortButton(map.get(status).title), description: map.get(status).description }));
}

function buildStatusList(items, prompt = 'ط§ط®طھط± ظ†ظˆط¹ ط§ظ„طھط¬ظ‡ظٹط² ط§ظ„ظ…ظ†ط§ط³ط¨ ًںŒ؟') {
  const rows = statusRowsFromItems(items);
  if (rows.length <= 1) return null;
  return simpleChoiceList(prompt, 'ط§ظ„طھط¬ظ‡ظٹط²', 'ظ†ظˆط¹ ط§ظ„طھط¬ظ‡ظٹط²', rows);
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
    description: `${money(item.price_1_jod)} â€” ${String(item.unit_ar || '').slice(0, 20)}`
  }));
  if (items.length > (page + 1) * pageSize) {
    rows.push({ id: `items_page:${page + 1}`, title: 'ظ…ط²ظٹط¯', description: `طµظپط­ط© ${page + 2}` });
  }
  return simpleChoiceList('ط§ط®طھط± ط§ظ„طµظ†ظپ ط§ظ„ظ…ظ†ط§ط³ط¨ ظ…ظ† ط§ظ„ط®ظٹط§ط±ط§طھ ط§ظ„طھط§ظ„ظٹط© ًںŒ؟', 'ط§ظ„ط£طµظ†ط§ظپ', 'ط§ظ„ط£طµظ†ط§ظپ ط§ظ„ظ…طھط§ط­ط©', rows);
}

function quantityList(item) {
  const rows = [1, 2, 3, 4, 5].map(q => ({
    id: `qty:${q}`,
    title: `${q}`,
    description: `${q} أ— ${String(item.unit_ar || 'ظˆط­ط¯ط©').slice(0, 14)}`
  }));
  rows.push({ id: 'qty:text', title: 'ظƒظ…ظٹط© ط£ط®ط±ظ‰', description: 'ط£ط±ط³ظ„ ط§ظ„ط±ظ‚ظ… ظٹط¯ظˆظٹظ‹ط§' });
  return simpleChoiceList(`ط§ط®طھط± ط§ظ„ظƒظ…ظٹط© ط§ظ„ظ…ط·ظ„ظˆط¨ط© ظ…ظ† ${item.display_name_ar || item.item_name_ar}.\nط§ظ„ط³ط¹ط± ظ„ظ„ظˆط­ط¯ط©: ${money(item.price_1_jod)}`, 'ط§ظ„ظƒظ…ظٹط©', 'ط§ط®طھظٹط§ط± ط§ظ„ظƒظ…ظٹط©', rows);
}

function extrasButtons(item, extras) {
  const buttons = extras.slice(0, 2).map(extra => ({
    type: 'reply',
    reply: { id: `extra:${extra.record_id}`, title: shortButton(extra.display_name_ar || extra.item_name_ar) }
  }));
  buttons.push({ type: 'reply', reply: { id: 'extra:skip', title: shortButton('ط¨ط¯ظˆظ† ط¥ط¶ط§ظپط©') } });
  return {
    type: 'button',
    body: { text: `ظ‡ظ„ طھط±ط؛ط¨ ط¨ط¥ط¶ط§ظپط© ط´ظٹط، ط¹ظ„ظ‰ ${item.display_name_ar || item.item_name_ar}طں` },
    action: { buttons }
  };
}

function cartSummary(cart, draft) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = Number(draft.deliveryFeeJod || 0);
  const lines = cart.map((item, index) => `${index + 1}. ${item.displayNameAr} أ— ${item.quantity} = ${money(item.lineTotalJod)}`);
  return {
    subtotal,
    total: subtotal + deliveryFee,
    text: `ظ…ظ„ط®طµ ط§ظ„ط·ظ„ط¨ ط­طھظ‰ ط§ظ„ط¢ظ† ًںŒ؟\n\n${lines.join('\n')}\n\nط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ط­ط§ظ„ظٹ: ${money(subtotal)}`
  };
}

function cartButtons(summaryText) {
  return {
    type: 'button',
    body: { text: `${summaryText}\n\nط§ط®طھط± ط§ظ„ط¥ط¬ط±ط§ط، ط§ظ„طھط§ظ„ظٹ:` },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.ADD_MORE, title: shortButton('ط¥ط¶ط§ظپط©') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CHECKOUT, title: shortButton('ظ…طھط§ط¨ط¹ط©') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CLEAR_CART, title: shortButton('ط¥ظ„ط؛ط§ط،') } }
    ] }
  };
}

function buildDeliveryTypeButtons() {
  return {
    type: 'button',
    body: { text: 'ط§ط®طھط± ط·ط±ظٹظ‚ط© ط§ظ„ط§ط³طھظ„ط§ظ… ط§ظ„ظ…ظ†ط§ط³ط¨ط© ظ„ط·ظ„ط¨ظƒ ًںŒ؟' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.DELIVERY, title: shortButton('طھظˆطµظٹظ„') } },
      { type: 'reply', reply: { id: BUTTON_IDS.PICKUP, title: shortButton('ط§ط³طھظ„ط§ظ…') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EDIT, title: shortButton('طھط¹ط¯ظٹظ„') } }
    ] }
  };
}

function buildDayOptions(config) {
  const formatter = new Intl.DateTimeFormat('ar-JO-u-ca-gregory', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: config.timezone || 'Asia/Amman' });
  return [0, 1, 2].map(offset => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const dateIso = date.toISOString().slice(0, 10);
    const label = offset === 0 ? 'ط§ظ„ظٹظˆظ…' : offset === 1 ? 'ط؛ط¯ظ‹ط§' : formatter.format(date);
    return { id: `day:${offset}`, title: label, description: dateIso, dateIso, label };
  });
}

function dayList(config) {
  const rows = buildDayOptions(config).map(option => ({ id: option.id, title: shortButton(option.title), description: option.description }));
  return simpleChoiceList('ط§ط®طھط± ظٹظˆظ… ط§ظ„طھط³ظ„ظٹظ… ط£ظˆظ„ظ‹ط§ ًںŒ؟', 'ط§ظ„ظٹظˆظ…', 'ط£ظٹط§ظ… ط§ظ„طھط³ظ„ظٹظ…', rows);
}

function slotList(config) {
  const rows = (config.deliveryTimeSlots || []).slice(0, 10).map((slot, index) => ({
    id: `slot:${index}`,
    title: shortButton(slot),
    description: 'ظ…ظˆط¹ط¯ ط§ظ„طھظˆطµظٹظ„'
  }));
  return simpleChoiceList('ط§ط®طھط± ط§ظ„ط³ط§ط¹ط© ط§ظ„ظ…ظ†ط§ط³ط¨ط© ظ„ط·ظ„ط¨ظƒ ًںŒ؟', 'ط§ظ„ط³ط§ط¹ط©', 'ط£ظˆظ‚ط§طھ ط§ظ„طھظˆطµظٹظ„', rows);
}

function sectorList(rootDir) {
  const rows = getDeliveryGroupList(rootDir).slice(0, 10).map(group => ({
    id: `sector:${group.key}:0`,
    title: shortButton(group.title),
    description: `${group.count} ظ…ظ†ط·ظ‚ط©`
  }));
  return simpleChoiceList('ط§ط®طھط± ط§ظ„ظ…ط­ط§ظپط¸ط©/ط§ظ„ظ‚ط·ط§ط¹ ط£ظˆظ„ظ‹ط§ ًںŒ؟', 'ط§ظ„ظ…ظ†ط§ط·ظ‚', 'ط§ظ„ظ‚ط·ط§ط¹ط§طھ', rows);
}

function zoneList(rootDir, sectorKey, page = 0) {
  const group = getDeliveryGroupByKey(rootDir, sectorKey);
  if (!group) return { type: 'text', text: 'ظ„ظ… ظ†طھظ…ظƒظ† ظ…ظ† ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ‚ط·ط§ط¹ ط§ظ„ظ…ط·ظ„ظˆط¨. ط£ط¹ط¯ ط§ط®طھظٹط§ط± ط§ظ„ظ…ظ†ط·ظ‚ط© ظ…ط±ط© ط£ط®ط±ظ‰.' };
  const pageSize = 9;
  const zones = group.zones || [];
  const chunk = zones.slice(page * pageSize, page * pageSize + pageSize);
  const rows = chunk.map(zone => ({
    id: `zone:${zone.zone_id}`,
    title: shortButton(zone.zone_name_ar),
    description: `${money(zone.delivery_fee_jod)} طھظˆطµظٹظ„`
  }));
  if (zones.length > (page + 1) * pageSize) {
    rows.push({ id: `sector:${sectorKey}:${page + 1}`, title: 'ظ…ط²ظٹط¯', description: `طµظپط­ط© ${page + 2}` });
  }
  return simpleChoiceList(`ط§ط®طھط± ط§ظ„ظ…ظ†ط·ظ‚ط© ط¯ط§ط®ظ„ ${group.group} ًںŒ؟`, 'ط§ظ„ظ…ظ†ط§ط·ظ‚', group.group, rows);
}

function paymentButtons() {
  return {
    type: 'button',
    body: { text: 'ط·ط±ظٹظ‚ط© ط§ظ„ط¯ظپط¹ ط§ظ„ظ…ط¹طھظ…ط¯ط© ط­ط§ظ„ظٹظ‹ط§: ط§ظ„ط¯ظپط¹ ط¹ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ… ظƒط§ط´. ظ‡ظ„ ظ†ظƒظ…ظ„طں' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.PAY_CASH, title: shortButton('ظƒط§ط´') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EDIT, title: shortButton('طھط¹ط¯ظٹظ„') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('ظ…ظˆط¸ظپ') } }
    ] }
  };
}

function notesButtons() {
  return {
    type: 'button',
    body: { text: 'ط¥ط°ط§ ط¹ظ†ط¯ظƒ ط£ظٹ ظ…ظ„ط§ط­ط¸ط© ط¥ط¶ط§ظپظٹط© ط¹ظ„ظ‰ ط§ظ„ط·ظ„ط¨ ط£ط®ط¨ط±ظ†ط§ ط§ظ„ط¢ظ† ًںŒ؟' },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.NOTES_ADD, title: shortButton('ظ…ظ„ط§ط­ط¸ط§طھ') } },
      { type: 'reply', reply: { id: BUTTON_IDS.NOTES_SKIP, title: shortButton('ط¨ط¯ظˆظ† ظ…ظ„ط§ط­ط¸ط§طھ') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EDIT, title: shortButton('طھط¹ط¯ظٹظ„') } }
    ] }
  };
}

function editList() {
  return simpleChoiceList('ط§ط®طھط± ط§ظ„ط¬ط²ط، ط§ظ„ط°ظٹ طھط±ظٹط¯ طھط¹ط¯ظٹظ„ظ‡ ظپظٹ ط§ظ„ط·ظ„ط¨ ًںŒ؟', 'طھط¹ط¯ظٹظ„', 'طھط¹ط¯ظٹظ„ ط§ظ„ط·ظ„ط¨', [
    { id: BUTTON_IDS.EDIT_ITEMS, title: 'ط§ظ„ط£طµظ†ط§ظپ', description: 'ط¥ط¶ط§ظپط© ط£ظˆ طھط¹ط¯ظٹظ„ ط§ظ„ط³ظ„ط©' },
    { id: BUTTON_IDS.EDIT_SCHEDULE, title: 'ط§ظ„ظ…ظˆط¹ط¯', description: 'ط§ظ„ظٹظˆظ… ظˆط§ظ„ط³ط§ط¹ط©' },
    { id: BUTTON_IDS.EDIT_ZONE, title: 'ط§ظ„ظ…ظ†ط·ظ‚ط©', description: 'ط§ظ„ظ‚ط·ط§ط¹ ظˆط§ظ„ط¹ظ†ظˆط§ظ†' },
    { id: BUTTON_IDS.EDIT_NOTES, title: 'ط§ظ„ظ…ظ„ط§ط­ط¸ط§طھ', description: 'طھط¹ط¯ظٹظ„ ط§ظ„ظ…ظ„ط§ط­ط¸ط§طھ' }
  ]);
}

function buildCustomerFinalSummary(cart, draft) {
  const summary = cartSummary(cart, draft);
  const deliveryTypeLabel = draft.deliveryType === 'pickup' ? 'ط§ط³طھظ„ط§ظ… ظ…ظ† ط§ظ„ظ…ط·ط¨ط®' : 'طھظˆطµظٹظ„';
  return [
    'ط±ط§ط¬ط¹ ط·ظ„ط¨ظƒ ط§ظ„ظ†ظ‡ط§ط¦ظٹ ًںŒ؟',
    '',
    ...cart.map((item, index) => `${index + 1}. ${item.displayNameAr} أ— ${item.quantity} = ${money(item.lineTotalJod)}`),
    '',
    `ط§ظ„ط§ط³طھظ„ط§ظ…: ${deliveryTypeLabel}`,
    draft.deliveryDayLabel ? `ط§ظ„ظٹظˆظ…: ${draft.deliveryDayLabel}` : null,
    draft.deliverySlot ? `ط§ظ„ط³ط§ط¹ط©: ${draft.deliverySlot}` : null,
    draft.sectorTitle ? `ط§ظ„ظ‚ط·ط§ط¹: ${draft.sectorTitle}` : null,
    draft.zoneName ? `ط§ظ„ظ…ظ†ط·ظ‚ط©: ${draft.zoneName}` : null,
    draft.address ? `ط§ظ„ط¹ظ†ظˆط§ظ†: ${draft.address}` : null,
    `ط§ظ„ط¯ظپط¹: ط§ظ„ط¯ظپط¹ ط¹ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ… - ظƒط§ط´`,
    `ط±ط³ظˆظ… ط§ظ„طھظˆطµظٹظ„: ${money(draft.deliveryFeeJod || 0)}`,
    `ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ: ${money(summary.total)}`,
    draft.notes ? `ظ…ظ„ط§ط­ط¸ط§طھ: ${draft.notes}` : 'ظ…ظ„ط§ط­ط¸ط§طھ: ط¨ط¯ظˆظ† ظ…ظ„ط§ط­ط¸ط§طھ',
    '',
    'ط¥ط°ط§ ظƒط§ظ†طھ ط§ظ„ط¨ظٹط§ظ†ط§طھ طµط­ظٹط­ط© ط§ط®طھط±: طھط£ظƒظٹط¯'
  ].filter(Boolean).join('\n');
}

function customerSummaryButtons(summaryText) {
  return {
    type: 'button',
    body: { text: summaryText },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_CONFIRM, title: shortButton('طھط£ظƒظٹط¯') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EDIT, title: shortButton('طھط¹ط¯ظٹظ„') } },
      { type: 'reply', reply: { id: BUTTON_IDS.CUSTOMER_EXIT, title: shortButton('ط®ط±ظˆط¬') } }
    ] }
  };
}

function buildOrderSummary(order) {
  const lines = (order.items || []).map((item, index) => `${index + 1}. ${item.displayNameAr || item.display_name_ar} أ— ${item.quantity} = ${money(item.lineTotalJod || item.line_total_jod || item.total)}`);
  return [
    `ط±ظ‚ظ… ط§ظ„ط·ظ„ط¨: ${order.id}`,
    `ط§ظ„ظ‡ط§طھظپ: ${order.phone}`,
    `ط§ظ„ط§ط³طھظ„ط§ظ…: ${order.deliveryType === 'pickup' || order.delivery_type === 'pickup' ? 'ط§ط³طھظ„ط§ظ…' : 'طھظˆطµظٹظ„'}`,
    order.deliveryDay || order.delivery_day ? `ط§ظ„ظٹظˆظ…: ${order.deliveryDay || order.delivery_day}` : null,
    order.deliverySlot || order.delivery_slot ? `ط§ظ„ط³ط§ط¹ط©: ${order.deliverySlot || order.delivery_slot}` : null,
    order.deliverySector || order.delivery_sector ? `ط§ظ„ظ‚ط·ط§ط¹: ${order.deliverySector || order.delivery_sector}` : null,
    order.deliveryZoneName || order.delivery_zone_name ? `ط§ظ„ظ…ظ†ط·ظ‚ط©: ${order.deliveryZoneName || order.delivery_zone_name}` : null,
    order.address || order.address_text ? `ط§ظ„ط¹ظ†ظˆط§ظ†: ${order.address || order.address_text}` : null,
    `ط§ظ„ط¯ظپط¹: ط§ظ„ط¯ظپط¹ ط¹ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ… - ظƒط§ط´`,
    order.notes || order.order_notes ? `ظ…ظ„ط§ط­ط¸ط§طھ: ${order.notes || order.order_notes}` : 'ظ…ظ„ط§ط­ط¸ط§طھ: ط¨ط¯ظˆظ† ظ…ظ„ط§ط­ط¸ط§طھ',
    '--- ط§ظ„ط£طµظ†ط§ظپ ---',
    ...lines,
    `ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ: ${money(order.totalJod || order.total_jod)}`
  ].filter(Boolean).join('\n');
}

function adminActionButtons(orderId, stage = 'new') {
  if (stage === 'new') {
    return {
      type: 'button',
      body: { text: `ط§ط®طھط± ط¥ط¬ط±ط§ط، ط§ظ„ط¥ط¯ط§ط±ط© ظ„ظ„ط·ظ„ط¨ ${orderId}` },
      action: { buttons: [
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_APPROVE}:${orderId}`, title: shortButton('ظ…ظˆط§ظپظ‚ط©') } },
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_MODIFY}:${orderId}`, title: shortButton('طھط¹ط¯ظٹظ„') } },
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_REJECT}:${orderId}`, title: shortButton('ط±ظپط¶') } }
      ] }
    };
  }
  if (stage === 'approved') {
    return {
      type: 'button',
      body: { text: `ط­ط¯ظ‘ط« ط­ط§ظ„ط© ط§ظ„ط·ظ„ط¨ ${orderId}` },
      action: { buttons: [
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_PREPARING}:${orderId}`, title: shortButton('طھط­ط¶ظٹط±') } },
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_READY}:${orderId}`, title: shortButton('ط¬ط§ظ‡ط²') } },
        { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_OUT}:${orderId}`, title: shortButton('طھظˆطµظٹظ„') } }
      ] }
    };
  }
  return {
    type: 'button',
    body: { text: `ط¥ط؛ظ„ط§ظ‚ ط­ط§ظ„ط© ط§ظ„ط·ظ„ط¨ ${orderId}` },
    action: { buttons: [
      { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_DELIVERED}:${orderId}`, title: shortButton('طھظ… ط§ظ„طھط³ظ„ظٹظ…') } },
      { type: 'reply', reply: { id: `admin:${BUTTON_IDS.ADMIN_READY}:${orderId}`, title: shortButton('ط¬ط§ظ‡ط²') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('ظ…ظˆط¸ظپ') } }
    ] }
  };
}

async function sendWhatsAppPayload(to, payload) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return { skipped: true, reason: 'ط¨ظٹط§ظ†ط§طھ WhatsApp API ط؛ظٹط± ظ…ط¶ط¨ظˆط·ط©.' };
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
  return sendWhatsAppText(rootDir, to, `ظٹط³ط¹ط¯ظ†ط§ ط®ط¯ظ…طھظƒ ًںŒ؟ ظٹظ…ظƒظ†ظƒ ط§ظ„طھظˆط§طµظ„ ظ…ط¨ط§ط´ط±ط© ظ…ط¹ ط§ظ„ظ…ظˆط¸ظپ ط¹ظ„ظ‰ ط§ظ„ط±ظ‚ظ… ${phone} ط£ظˆ ظ…طھط§ط¨ط¹ط© ط§ظ„ط·ظ„ط¨ ظ…ط¹ظ†ط§ ظ‡ظ†ط§.`);
}

async function notifyAdminsNewOrder(rootDir, order, config) {
  const admins = getAdminNumbers(config);
  const uniqueAdmins = [...new Set(admins)];
  if (!uniqueAdmins.length) return;
  const body = `ط·ظ„ط¨ ط¬ط¯ظٹط¯ ظٹط­طھط§ط¬ ظ…ط±ط§ط¬ط¹ط© ًں””\n\n${buildOrderSummary(order)}`;
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
  if (!cart.length) return { error: 'ظ„ط§ ظٹظ…ظƒظ† ط¥ط±ط³ط§ظ„ ط·ظ„ط¨ ظپط§ط±ط؛. ط£ط¶ظپ طµظ†ظپظ‹ط§ ظˆط§ط­ط¯ظ‹ط§ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„.' };
  if (!draft.deliveryDayLabel || !draft.deliverySlot) return { error: 'ظ†ط­طھط§ط¬ ظٹظˆظ… ط§ظ„طھط³ظ„ظٹظ… ظˆط§ظ„ط³ط§ط¹ط© ظ‚ط¨ظ„ ط§ظ„ط¥ط±ط³ط§ظ„.' };
  if (draft.deliveryType === 'delivery' && (!draft.zoneId || !draft.address)) return { error: 'ظ†ط­طھط§ط¬ ط§ظ„ظ…ظ†ط·ظ‚ط© ظˆط§ظ„ط¹ظ†ظˆط§ظ† ظ‚ط¨ظ„ ط§ظ„ط¥ط±ط³ط§ظ„.' };

  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const deliveryFee = draft.deliveryType === 'pickup' ? 0 : Number(draft.deliveryFeeJod || 0);
  const total = subtotal + deliveryFee;
  const customerProfile = await getCustomerProfileSummary(rootDir, phone);
  const customerTags = customerProfile.isReturning ? ['ط¹ظ…ظٹظ„ ظ…طھظƒط±ط±'] : ['ط¹ظ…ظٹظ„ ط¬ط¯ظٹط¯'];

  const baseOrder = {
    id: draft.revisionOrderId || await generateNextOrderCode(rootDir),
    customerName: customerProfile.customer?.full_name || 'ط¹ظ…ظٹظ„ ظ…ط·ط¨ط® ط§ظ„ظٹظˆظ…',
    phone,
    items: cart,
    notes: draft.notes || null,
    address: draft.deliveryType === 'pickup' ? 'ط§ط³طھظ„ط§ظ… ظ…ظ† ط§ظ„ظ…ط·ط¨ط®' : draft.address,
    deliveryType: draft.deliveryType,
    deliveryDay: draft.deliveryDayLabel,
    deliverySlot: draft.deliverySlot,
    deliverySector: draft.sectorTitle,
    deliveryZoneId: draft.zoneId,
    deliveryZoneName: draft.zoneName,
    paymentMethod: draft.paymentMethod || 'cash',
    paymentStatus: 'pending',
    status: 'awaiting_admin_review',
    statusLabelAr: 'ط¨ط§ظ†طھط¸ط§ط± ط§ط¹طھظ…ط§ط¯ ط§ظ„ط¥ط¯ط§ط±ط©',
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
  if (/ظ…ط±ط­ط¨ط§|ط£ظ‡ظ„ط§|ط§ظ‡ظ„ط§|ط§ظ„ط³ظ„ط§ظ… ط¹ظ„ظٹظƒظ…|hello|hi/i.test(text)) return 'welcome';
  if (/ظ…ظˆط¸ظپ|ط§طھطµط§ظ„|طھظˆط§طµظ„|human|agent/i.test(text)) return BUTTON_IDS.HUMAN;
  if (/طھطھط¨ط¹|track|status|ط­ط§ظ„ط©|ط·ظ„ط¨ظٹ|ط¬ط§ظ‡ط²|ظˆظٹظ†/i.test(text)) return BUTTON_IDS.TRACK_ORDER;
  if (/ظ…ظ†ظٹظˆ|menu|ط§ط·ظ„ط¨|ط·ظ„ط¨/i.test(text)) return BUTTON_IDS.START_ORDER;
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
        ? pending.map(order => `â€¢ ${order.id} â€” ${order.customer_name || order.phone} â€” ${money(order.total_jod || order.totalJod)}`).join('\n')
        : 'ظ„ط§ طھظˆط¬ط¯ ط·ظ„ط¨ط§طھ ط¨ط§ظ†طھط¸ط§ط± ط§ط¹طھظ…ط§ط¯ ط§ظ„ط¥ط¯ط§ط±ط© ط­ط§ظ„ظٹظ‹ط§.';
      await sendWhatsAppText(rootDir, to, body);
      return { handled: true };
    }
    if (/^\/view\b/i.test(text)) {
      const orderIdText = String(text).trim().split(/\s+/)[1];
      const order = await getOrderById(rootDir, orderIdText);
      const items = order ? await getOrderItems(rootDir, orderIdText) : [];
      await sendWhatsAppText(rootDir, to, order ? buildOrderSummary({ ...order, items: items.map(item => ({ ...item, displayNameAr: item.display_name_ar, lineTotalJod: item.line_total_jod })) }) : 'ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ظ‡ط°ط§ ط§ظ„ط·ظ„ط¨.');
      return { handled: true };
    }
    if (/^\/help/i.test(text)) {
      await sendWhatsAppText(rootDir, to, 'ط£ظˆط§ظ…ط± ط§ظ„ط¥ط¯ط§ط±ط© ط§ظ„ظ…طھط§ط­ط©:\n/pending\n/view ORDER_ID\n/approve ORDER_ID\n/modify ORDER_ID\n/reject ORDER_ID\n/prep ORDER_ID\n/ready ORDER_ID\n/out ORDER_ID\n/delivered ORDER_ID');
      return { handled: true };
    }
    return { handled: false };
  }

  const order = await getOrderById(rootDir, orderId);
  if (!order) {
    await sendWhatsAppText(rootDir, to, 'ظ„ظ… ظ†طھظ…ظƒظ† ظ…ظ† ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط±ظ‚ظ… ط§ظ„ط·ظ„ط¨ ط§ظ„ظ…ط·ظ„ظˆط¨.');
    return { handled: true };
  }
  const orderItems = await getOrderItems(rootDir, orderId);

  const map = {
    [BUTTON_IDS.ADMIN_APPROVE]: { status: 'approved', label: 'طھظ… ط§ط¹طھظ…ط§ط¯ ط§ظ„ط·ظ„ط¨' },
    [BUTTON_IDS.ADMIN_MODIFY]: { status: 'awaiting_customer_edit', label: 'ط¨ط§ظ†طھط¸ط§ط± طھط¹ط¯ظٹظ„ ط§ظ„ط¹ظ…ظٹظ„' },
    [BUTTON_IDS.ADMIN_REJECT]: { status: 'rejected', label: 'ظ„ظ… ظٹطھظ… ط§ط¹طھظ…ط§ط¯ ط§ظ„ط·ظ„ط¨' },
    [BUTTON_IDS.ADMIN_PREPARING]: { status: 'preparing', label: 'ظ‚ظٹط¯ ط§ظ„طھط­ط¶ظٹط±' },
    [BUTTON_IDS.ADMIN_READY]: { status: 'ready', label: 'ط¬ط§ظ‡ط²' },
    [BUTTON_IDS.ADMIN_OUT]: { status: 'out_for_delivery', label: 'ظ‚ظٹط¯ ط§ظ„طھظˆطµظٹظ„' },
    [BUTTON_IDS.ADMIN_DELIVERED]: { status: 'delivered', label: 'طھظ… ط§ظ„طھط³ظ„ظٹظ…' }
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
    await sendWhatsAppText(rootDir, to, `طھظ… طھط­ظˆظٹظ„ ط§ظ„ط·ظ„ط¨ ${order.id} ط¥ظ„ظ‰ ظ…ط³ط§ط± ط§ظ„طھط¹ط¯ظٹظ„ ظ…ظ† ط§ظ„ط¹ظ…ظٹظ„.`);
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
  await sendWhatsAppText(rootDir, to, `طھظ… طھط­ط¯ظٹط« ط§ظ„ط·ظ„ط¨ ${order.id} ط¥ظ„ظ‰ ط­ط§ظ„ط©: ${target.label}`);
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
  const body = `ظ„ط¯ظٹظƒ ط·ظ„ط¨ ظ‚ط§ط¦ظ… ط¨ط§ظ„ظپط¹ظ„ ًںŒ؟\nط±ظ‚ظ… ط§ظ„ط·ظ„ط¨: ${order.id}\nط­ط§ظ„طھظ‡ ط§ظ„ط­ط§ظ„ظٹط©: ${labelFromStatus(order.status)}\nط£ظƒظ…ظ„ ظ…طھط§ط¨ط¹ط© ظ‡ط°ط§ ط§ظ„ط·ظ„ط¨ ط£ظˆظ„ظ‹ط§طŒ ظˆط¥ط°ط§ ط±ط؛ط¨طھ ط³ظ†ط¹ط±ط¶ ط­ط§ظ„طھظ‡ ط§ظ„ط¢ظ†.`;
  return sendWhatsAppInteractive(rootDir, to, {
    type: 'button',
    body: { text: body },
    action: { buttons: [
      { type: 'reply', reply: { id: BUTTON_IDS.TRACK_ORDER, title: shortButton('طھطھط¨ط¹') } },
      { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: shortButton('ظ…ظˆط¸ظپ') } },
      { type: 'reply', reply: { id: BUTTON_IDS.EXIT, title: shortButton('ط®ط±ظˆط¬') } }
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
    const to = normalizePhone(message.from || '').replace(/^\+/, '');
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

  if (selection === BUTTON_IDS.AR || /^ط§ظ„ط¹ط±ط¨ظٹط©$/i.test(text)) {
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
    const result = await sendWhatsAppText(rootDir, to, orders.length ? orders.slice(0, 5).map(order => `â€¢ ${order.id} â€” ${labelFromStatus(order.status)}`).join('\n') : 'ظ„ط§ ظٹظˆط¬ط¯ ط·ظ„ط¨ط§طھ ط³ط§ط¨ظ‚ط© ظ…ط±طھط¨ط·ط© ط¨ظ‡ط°ط§ ط§ظ„ط±ظ‚ظ… ط­ط§ظ„ظٹظ‹ط§.');
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
    const statusList = buildStatusList(items, 'ط§ط®طھط± ظ†ظˆط¹ ط§ظ„طھط¬ظ‡ظٹط² ط§ظ„ظ…ظ†ط§ط³ط¨ ظ„ظ‡ط°ط§ ط§ظ„ظ‚ط³ظ… ًںŒ؟');
    session = await persistSession(rootDir, from, session, { currentState: statusList ? 'awaiting_status' : 'awaiting_item', sessionData: { orderDraft: draft, itemPage: 0 } });
    const result = await sendWhatsAppInteractive(rootDir, to, statusList || itemList(rootDir, draft, 0));
    return json(res, 200, { ok: true, delivered: result, mode: 'type_selected' });
  }

  if (selection.startsWith('category:')) {
    const value = selection.split(':').slice(1).join(':');
    const draft = { ...sessionData.orderDraft, categoryFilter: value };
    if (draft.rootId === 'catering') {
      session = await persistSession(rootDir, from, session, { currentState: 'awaiting_type', sessionData: { orderDraft: draft } });
      const result = await sendWhatsAppInteractive(rootDir, to, simpleChoiceList('ط§ط®طھط± ظ†ظˆط¹ ط§ظ„ط°ط¨ظٹط­ط© ًںŒ؟', 'ط§ظ„ظ†ظˆط¹', 'ظ†ظˆط¹ ط§ظ„ط°ط¨ظٹط­ط©', [
        { id: 'type:ط¨ظ„ط¯ظٹ', title: 'ط¨ظ„ط¯ظٹ', description: value },
        { id: 'type:ظ…ط³طھظˆط±ط¯', title: 'ظ…ط³طھظˆط±ط¯', description: value }
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
      const result = await sendWhatsAppText(rootDir, to, 'طھط¹ط°ط± ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ظ‡ط°ط§ ط§ظ„طµظ†ظپ. ط§ط®طھط± ظ…ظ† ط§ظ„ظ‚ط§ط¦ظ…ط© ظ…ط±ط© ط£ط®ط±ظ‰.');
      return json(res, 200, { ok: true, delivered: result, mode: 'item_missing' });
    }
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_quantity', sessionData: { pendingItemId: itemId, awaiting: 'quantity' } });
    const result = await sendWhatsAppInteractive(rootDir, to, quantityList(item));
    return json(res, 200, { ok: true, delivered: result, mode: 'quantity_prompt' });
  }

  if (selection === 'qty:text') {
    session = await persistSession(rootDir, from, session, { currentState: 'awaiting_quantity_text', sessionData: { awaiting: 'quantity_text' } });
    const result = await sendWhatsAppText(rootDir, to, 'ط£ط±ط³ظ„ ط±ظ‚ظ… ط§ظ„ظƒظ…ظٹط© ط§ظ„طھظٹ طھط±ظٹط¯ظ‡ط§ ط§ظ„ط¢ظ†طŒ ظ…ط«ظ„ 2 ط£ظˆ 5.');
    return json(res, 200, { ok: true, delivered: result, mode: 'quantity_text_prompt' });
  }

  if (selection.startsWith('qty:')) {
    const quantity = Number(selection.split(':')[1] || 1);
    const item = getMenuItemById(rootDir, sessionData.pendingItemId);
    if (!item) {
      const result = await sendWhatsAppText(rootDir, to, 'طھط¹ط°ط± طھط­ط¯ظٹط¯ ط§ظ„طµظ†ظپ ط§ظ„ط­ط§ظ„ظٹ. ط³ظ†ط¹ظٹط¯ظƒ ط¥ظ„ظ‰ ط§ظ„ظ…ظ†ظٹظˆ.');
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
          notes: 'ط¥ط¶ط§ظپط©'
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
      await updateOrderStatus(rootDir, openOrder.id, 'customer_exit', 'ط£ط؛ظ„ظ‚ظ‡ ط§ظ„ط¹ظ…ظٹظ„');
      await sendWhatsAppText(rootDir, to, `طھظ… ط¥ط؛ظ„ط§ظ‚ ط·ظ„ط¨ظƒ ط§ظ„ط­ط§ظ„ظٹ ${openOrder.id}. ط¥ط°ط§ ط±ط؛ط¨طھ ظ†ط¨ط¯ط£ ظ…ظ† ط¬ط¯ظٹط¯ ظپظٹ ط£ظٹ ظˆظ‚طھ.`);
    } else {
      await sendWhatsAppText(rootDir, to, 'طھظ… ط¥ط؛ظ„ط§ظ‚ ط§ظ„ط·ظ„ط¨ ط§ظ„ط­ط§ظ„ظٹ. ط¹ظ†ط¯ظ…ط§ طھظƒظˆظ† ط¬ط§ظ‡ط²ظ‹ط§ ظ†ط¨ط¯ط£ ظ…ظ† ط¬ط¯ظٹط¯ ط¨ظƒظ„ ط³ط±ظˆط± ًںŒ؟');
    }
    session = await persistSession(rootDir, from, session, { currentState: 'main_menu', lastOrderId: null, sessionData: { cart: [], awaiting: null, pendingItemId: null, itemPage: 0, orderDraft: defaultDraft(), lastOrderId: null } });
    await sendWhatsAppInteractive(rootDir, to, mainMenuButtons());
    return json(res, 200, { ok: true, mode: 'flow_exit' });
  }

  if (selection === BUTTON_IDS.CHECKOUT) {
    if (!(sessionData.cart || []).length) {
      const result = await sendWhatsAppText(rootDir, to, 'ط§ظ„ط³ظ„ط© ظپط§ط±ط؛ط© ط­ط§ظ„ظٹظ‹ط§. ط£ط¶ظپ طµظ†ظپظ‹ط§ ط£ظˆظ„ظ‹ط§.');
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
      const result = await sendWhatsAppText(rootDir, to, 'طھط¹ط°ط± طھط­ط¯ظٹط¯ ط§ظ„ظٹظˆظ…. ط£ط¹ط¯ ط§ظ„ظ…ط­ط§ظˆظ„ط©.');
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
      const result = await sendWhatsAppText(rootDir, to, 'طھط¹ط°ط± ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ظ‡ط°ط§ ط§ظ„ظ‚ط·ط§ط¹. ط§ط®طھط± ظ…ظ† ط¬ط¯ظٹط¯.');
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
      const result = await sendWhatsAppText(rootDir, to, 'طھط¹ط°ط± طھط­ط¯ظٹط¯ ط§ظ„ظ…ظ†ط·ظ‚ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©. ط£ط¹ط¯ ط§ظ„ط§ط®طھظٹط§ط±.');
      return json(res, 200, { ok: true, delivered: result, mode: 'zone_error' });
    }
    session = await persistSession(rootDir, from, session, {
      currentState: 'awaiting_address',
      sessionData: {
        orderDraft: {
          zoneId: zone.zone_id,
          zoneName: zone.zone_name_ar,
          sectorTitle: `${zone.zone_type} â€” ${zone.sector_or_governorate}`,
          deliveryFeeJod: Number(zone.delivery_fee_jod || 0)
        },
        awaiting: 'address',
        lastPrompt: 'address'
      }
    });
    const result = await sendWhatsAppText(rootDir, to, `طھظ… ط§ط®طھظٹط§ط± ظ…ظ†ط·ظ‚ط© ${zone.zone_name_ar} ظˆط±ط³ظˆظ… ط§ظ„طھظˆطµظٹظ„ ${money(zone.delivery_fee_jod)} ًںŒ؟\nط£ط±ط³ظ„ ط§ظ„ط¹ظ†ظˆط§ظ† ط¨ط§ظ„طھظپطµظٹظ„ ط£ظˆ ط´ط§ط±ظƒ ط§ظ„ظ…ظˆظ‚ط¹ ط§ظ„ط¢ظ†.`);
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
    const result = await sendWhatsAppText(rootDir, to, 'ط§ظƒطھط¨ ط§ظ„ظ…ظ„ط§ط­ط¸ط© ط§ظ„طھظٹ طھط±ظٹط¯ ط¥ط¶ط§ظپطھظ‡ط§ ط¹ظ„ظ‰ ط§ظ„ط·ظ„ط¨ ط§ظ„ط¢ظ†.');
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
    const result = await sendWhatsAppText(rootDir, to, `طھظ… ط§ط³طھظ„ط§ظ… ط·ظ„ط¨ظƒ ظˆط¥ط±ط³ط§ظ„ظ‡ ظ„ظ„ط¥ط¯ط§ط±ط© ظ„ظ„ظ…ط±ط§ط¬ط¹ط© âœ…\nط±ظ‚ظ… ط§ظ„ظ…طھط§ط¨ط¹ط© ط§ظ„ط¯ط§ط®ظ„ظٹ: ${outcome.order.id}\nط³ظ†ط«ط¨طھ ط§ظ„ط·ظ„ط¨ ط¨ط¹ط¯ ط§ط¹طھظ…ط§ط¯ ط§ظ„ط¥ط¯ط§ط±ط© ظˆظ†ط±ط³ظ„ ظ„ظƒ ط§ظ„ط­ط§ظ„ط© ظ…ط¨ط§ط´ط±ط© ظ‡ظ†ط§.`);
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
      const result = await sendWhatsAppText(rootDir, to, 'ط£ط±ط³ظ„ ط±ظ‚ظ… ظƒظ…ظٹط© طµط­ظٹط­ظ‹ط§ ظ…ط«ظ„ 2 ط£ظˆ 5.');
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
          text: { body: 'ظˆطµظ„طھظ†ط§ ط±ط³ط§ظ„طھظƒ ًںŒ؟ ط­ط¯ط« طھط£ط®ظٹط± ط¨ط³ظٹط· ظپظٹ ط§ظ„ظ…ط¹ط§ظ„ط¬ط© ظˆط³ظ†ط¹ظˆط¯ ظ„ظƒ ط­ط§ظ„ظ‹ط§.' }
        });
      }
    } catch (fallbackError) {
      console.error('WEBHOOK_FALLBACK_SEND_ERROR', fallbackError);
    }
    return json(res, 200, { ok: false, recovered: true, message: error.message });
  }
}



