import crypto from 'node:crypto';
import { parseBody, json, normalizePhone, slugify } from '../utils/core.js';
import { getMenuItemById, getSections } from './menu.service.js';
import {
  createOrder,
  findOrdersByPhone,
  getConversationSession,
  getOrderById,
  getOrderItems,
  getOrdersByStatus,
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
  SHOW_MENU: 'show_menu',
  TRACK_ORDER: 'track_order',
  CART_ADD_MORE: 'cart_add_more',
  CART_SUBMIT: 'cart_submit',
  CART_CLEAR: 'cart_clear',
  DELIVERY: 'delivery_delivery',
  PICKUP: 'delivery_pickup',
  BACK_MAIN: 'back_main',
  PAY_CASH: 'pay_cash',
  PAY_TRANSFER: 'pay_transfer',
  NOTES_SKIP: 'notes_skip',
  NOTES_ADD: 'notes_add'
};

const ADMIN_COMMANDS = {
  '/approve': { status: 'approved', label: 'تم اعتماد الطلب' },
  '/reject': { status: 'rejected', label: 'تم رفض الطلب' },
  '/ready': { status: 'ready', label: 'طلبكم جاهز' },
  '/out': { status: 'out_for_delivery', label: 'خرج الطلب للتوصيل' },
  '/delivered': { status: 'delivered', label: 'تم تسليم الطلب' }
};

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

function getAdminNumbers() {
  const raw = process.env.ADMIN_NUMBERS || '';
  return raw
    .split(/[;,\s]+/)
    .map(part => normalizePhone(part))
    .filter(Boolean)
    .map(part => part.replace(/^\+/, ''));
}

function isAdminPhone(phone) {
  const normalized = normalizePhone(phone).replace(/^\+/, '');
  return getAdminNumbers().includes(normalized);
}

function detectIntent(text = '') {
  const input = String(text || '').toLowerCase();
  if (/موظف|human|agent|اتصال|تواصل/.test(input)) return BUTTON_IDS.HUMAN;
  if (/منيو|menu|الأصناف|اسعار|أسعار/.test(input)) return BUTTON_IDS.SHOW_MENU;
  if (/تتبع|tracking|track/.test(input)) return BUTTON_IDS.TRACK_ORDER;
  if (/طلب|اطلب|order/.test(input)) return BUTTON_IDS.START_ORDER;
  if (/مرحبا|اهلا|أهلا|hello|hi|السلام عليكم/.test(input)) return 'welcome';
  return '';
}

function readSessionData(session) {
  const raw = session?.session_data || session?.sessionData || {};
  return {
    cart: Array.isArray(raw.cart) ? raw.cart : [],
    selectedSection: raw.selectedSection || null,
    itemPage: Number(raw.itemPage || 0),
    pendingItemId: raw.pendingItemId || null,
    orderDraft: raw.orderDraft || {},
    awaiting: raw.awaiting || null,
    lastOrderId: session?.last_order_id || raw.lastOrderId || null
  };
}

async function persistSession(rootDir, phone, session, patch = {}) {
  const currentData = readSessionData(session);
  const mergedData = {
    ...currentData,
    ...(patch.sessionData || {}),
    orderDraft: {
      ...(currentData.orderDraft || {}),
      ...((patch.sessionData || {}).orderDraft || {})
    }
  };
  return setConversationSession(rootDir, phone, {
    currentState: patch.currentState || patch.current_state || session?.current_state || 'welcome',
    preferredLanguage: patch.preferredLanguage || patch.preferred_language || session?.preferred_language || 'ar',
    consentStatus: patch.consentStatus || patch.consent_status || session?.consent_status || 'pending',
    lastMenuSection: patch.lastMenuSection || patch.last_menu_section || mergedData.selectedSection || session?.last_menu_section || null,
    lastOrderId: patch.lastOrderId || patch.last_order_id || mergedData.lastOrderId || session?.last_order_id || null,
    sessionData: mergedData
  });
}

function welcomeButtons(language = 'ar') {
  if (language === 'en') {
    return {
      type: 'button',
      body: { text: 'Welcome to Matbakh Al Youm Central Kitchen. Please choose your language or contact a staff member directly.' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: BUTTON_IDS.AR, title: 'العربية' } },
          { type: 'reply', reply: { id: BUTTON_IDS.EN, title: 'English' } },
          { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: 'Call staff' } }
        ]
      }
    };
  }
  return {
    type: 'button',
    body: { text: 'أهلًا بكم في مطبخ اليوم المركزي. اختر اللغة أو اطلب المساعدة من موظف مباشر.' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.AR, title: 'العربية' } },
        { type: 'reply', reply: { id: BUTTON_IDS.EN, title: 'English' } },
        { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: 'موظف مباشر' } }
      ]
    }
  };
}

function consentButtons(language = 'ar') {
  if (language === 'en') {
    return {
      type: 'button',
      body: { text: 'Before we continue: we use conversation data to improve service and organize orders. Orders are not finally approved until management approval. Do you agree to receive offers and service updates?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_YES, title: 'Agree' } },
          { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_SERVICE_ONLY, title: 'Service only' } },
          { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_NO, title: 'Decline' } }
        ]
      }
    };
  }
  return {
    type: 'button',
    body: { text: 'قبل المتابعة: نستخدم بيانات المحادثة لتحسين الخدمة وتنظيم الطلبات. الطلب لا يعد معتمدًا نهائيًا إلا بعد موافقة الإدارة. هل توافقون على استقبال العروض والتحديثات المرتبطة بالخدمة؟' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_YES, title: 'أوافق' } },
        { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_SERVICE_ONLY, title: 'خدمة فقط' } },
        { type: 'reply', reply: { id: BUTTON_IDS.CONSENT_NO, title: 'لا أوافق' } }
      ]
    }
  };
}

function mainMenuButtons(language = 'ar') {
  if (language === 'en') {
    return {
      type: 'button',
      body: { text: 'How can we serve you today?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: BUTTON_IDS.START_ORDER, title: 'Start order' } },
          { type: 'reply', reply: { id: BUTTON_IDS.SHOW_MENU, title: 'Menu' } },
          { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: 'Staff' } }
        ]
      }
    };
  }
  return {
    type: 'button',
    body: { text: 'كيف يمكننا خدمتك اليوم؟' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.START_ORDER, title: 'ابدأ الطلب' } },
        { type: 'reply', reply: { id: BUTTON_IDS.SHOW_MENU, title: 'المنيو' } },
        { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: 'موظف مباشر' } }
      ]
    }
  };
}

function buildSectionList(rootDir, mode = 'order') {
  const sections = getSections(rootDir)
    .slice(0, 10)
    .map(section => ({
      id: `section:${section.slug}:0:${mode}`,
      title: section.section_ar.slice(0, 24),
      description: `${section.count} صنف`
    }));

  return {
    type: 'list',
    body: { text: mode === 'order' ? 'اختر القسم الذي تريد الطلب منه.' : 'تفضلوا باختيار قسم المنيو المطلوب.' },
    action: {
      button: mode === 'order' ? 'ابدأ الأقسام' : 'عرض الأقسام',
      sections: [
        {
          title: 'أقسام مطبخ اليوم',
          rows: sections
        }
      ]
    }
  };
}

function getSectionPageRows(rootDir, sectionSlug, page = 0) {
  const section = getSections(rootDir).find(item => item.slug === slugify(sectionSlug));
  if (!section) return null;
  const pageSize = 9;
  const start = page * pageSize;
  const chunk = section.items.slice(start, start + pageSize);
  const rows = chunk.map(item => ({
    id: `item:${item.record_id}`,
    title: String(item.display_name_ar || item.item_name_ar).slice(0, 24),
    description: `${Number(item.price_1_jod).toFixed(3)} د.أ — ${String(item.unit_ar || '').slice(0, 18)}`
  }));
  if (section.items.length > start + pageSize) {
    rows.push({
      id: `section:${section.slug}:${page + 1}:order`,
      title: 'المزيد من الأصناف',
      description: `صفحة ${page + 2}`
    });
  }
  return { section, rows, page };
}

function buildItemsList(rootDir, sectionSlug, page = 0) {
  const result = getSectionPageRows(rootDir, sectionSlug, page);
  if (!result) {
    return { type: 'text', text: 'لم نتمكن من العثور على هذا القسم. أرسل كلمة منيو لإعادة عرض الأقسام.' };
  }
  return {
    type: 'list',
    body: { text: `اختر الصنف المطلوب من قسم ${result.section.section_ar}.` },
    action: {
      button: 'عرض الأصناف',
      sections: [
        {
          title: result.section.section_ar,
          rows: result.rows
        }
      ]
    }
  };
}

function buildQuantityList(item) {
  const rows = Array.from({ length: 9 }, (_, index) => index + 1).map(quantity => ({
    id: `qty:${item.record_id}:${quantity}`,
    title: `${quantity}`,
    description: `${quantity} × ${item.unit_ar} — ${(Number(item.price_1_jod) * quantity).toFixed(3)} د.أ`
  }));
  rows.push({ id: `qtymore:${item.record_id}`, title: 'كمية أخرى', description: 'أرسل الكمية يدويًا' });
  return {
    type: 'list',
    body: { text: `اختر الكمية المطلوبة من ${item.display_name_ar}.
السعر للوحدة: ${Number(item.price_1_jod).toFixed(3)} د.أ` },
    action: {
      button: 'اختيار الكمية',
      sections: [
        {
          title: 'الكمية',
          rows
        }
      ]
    }
  };
}

function buildDeliveryButtons() {
  return {
    type: 'button',
    body: { text: 'اختر طريقة الاستلام.' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.DELIVERY, title: 'توصيل' } },
        { type: 'reply', reply: { id: BUTTON_IDS.PICKUP, title: 'استلام' } },
        { type: 'reply', reply: { id: BUTTON_IDS.BACK_MAIN, title: 'القائمة' } }
      ]
    }
  };
}

function buildSlotList(config, deliveryType = 'delivery') {
  const rows = (config.deliveryTimeSlots || []).slice(0, 10).map((slot, index) => ({
    id: `slot:${index}`,
    title: slot.slice(0, 24),
    description: deliveryType === 'delivery' ? 'موعد التوصيل' : 'موعد الاستلام'
  }));
  return {
    type: 'list',
    body: { text: deliveryType === 'delivery' ? 'اختر نافذة التوصيل المناسبة.' : 'اختر وقت الاستلام المناسب.' },
    action: {
      button: 'أوقات التوصيل',
      sections: [
        {
          title: 'الأوقات المتاحة',
          rows
        }
      ]
    }
  };
}

function buildPaymentButtons() {
  return {
    type: 'button',
    body: { text: 'اختر طريقة الدفع.' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.PAY_CASH, title: 'نقدًا' } },
        { type: 'reply', reply: { id: BUTTON_IDS.PAY_TRANSFER, title: 'تحويل' } },
        { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: 'موظف مباشر' } }
      ]
    }
  };
}

function buildNotesButtons() {
  return {
    type: 'button',
    body: { text: 'هل توجد ملاحظات إضافية على الطلب؟' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.NOTES_SKIP, title: 'بدون ملاحظات' } },
        { type: 'reply', reply: { id: BUTTON_IDS.NOTES_ADD, title: 'أضف ملاحظة' } },
        { type: 'reply', reply: { id: BUTTON_IDS.HUMAN, title: 'موظف مباشر' } }
      ]
    }
  };
}

function buildCartButtons(cartText) {
  return {
    type: 'button',
    body: { text: cartText },
    action: {
      buttons: [
        { type: 'reply', reply: { id: BUTTON_IDS.CART_ADD_MORE, title: 'أضف صنف' } },
        { type: 'reply', reply: { id: BUTTON_IDS.CART_SUBMIT, title: 'إرسال الطلب' } },
        { type: 'reply', reply: { id: BUTTON_IDS.CART_CLEAR, title: 'إلغاء السلة' } }
      ]
    }
  };
}

function money(value) {
  return `${Number(value || 0).toFixed(3)} د.أ`;
}

function summarizeCart(cart = []) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const lines = cart.map((item, index) => `${index + 1}. ${item.displayNameAr} × ${item.quantity} = ${money(item.lineTotalJod)}`);
  return {
    subtotal,
    text: `تمت إضافة الصنف إلى السلة ✅

${lines.join('\n')}

المجموع الحالي: ${money(subtotal)}`
  };
}

function buildOrderSummary(order) {
  const lines = (order.items || []).map((item, index) => `${index + 1}. ${item.displayNameAr || item.display_name_ar} × ${item.quantity} = ${money(item.lineTotalJod || item.line_total_jod || item.total)}`);
  return [
    `رقم الطلب: ${order.id}`,
    `العميل: ${order.customerName || order.customer_name || 'عميل مطبخ اليوم'}`,
    `الهاتف: ${order.phone}`,
    `الاستلام: ${order.deliveryType === 'pickup' ? 'استلام' : 'توصيل'}`,
    `الوقت: ${order.deliverySlot || '-'}`,
    `الدفع: ${order.paymentMethod === 'transfer' ? 'تحويل' : 'نقدًا'}`,
    order.address ? `العنوان: ${order.address}` : null,
    order.notes ? `ملاحظات: ${order.notes}` : null,
    '--- الأصناف ---',
    ...lines,
    `الإجمالي: ${money(order.totalJod || order.total_jod)}`
  ].filter(Boolean).join('\n');
}

function customerStatusMessage(statusLabelAr, orderId, adminNotes = '') {
  const lines = [`تحديث على طلبكم ${orderId}: ${statusLabelAr}.`];
  if (adminNotes) lines.push(`ملاحظة الإدارة: ${adminNotes}`);
  lines.push('للإستفسار أو التعديل، أرسلوا رسالة مباشرة هنا أو اختاروا موظف مباشر.');
  return lines.join('\n');
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
  const result = await sendWhatsAppPayload(to, {
    type: 'text',
    text: { body }
  });
  await saveOutgoingMessage(rootDir, {
    id: crypto.randomUUID(),
    to,
    type: 'text',
    text: body,
    payload: result.data,
    createdAt: new Date().toISOString()
  });
  return result;
}

async function sendWhatsAppInteractive(rootDir, to, interactive) {
  const result = await sendWhatsAppPayload(to, {
    type: 'interactive',
    interactive
  });
  await saveOutgoingMessage(rootDir, {
    id: crypto.randomUUID(),
    to,
    type: `interactive_${interactive.type}`,
    text: interactive.body?.text || '',
    payload: result.data,
    createdAt: new Date().toISOString()
  });
  return result;
}

async function replyHuman(rootDir, to, config, req) {
  const { phone } = buildTextLinks(config, req);
  return sendWhatsAppText(rootDir, to, `يسعدنا خدمتك. يمكنك التواصل مباشرة مع الموظف على الرقم ${phone} أو الاستمرار داخل البوت.`);
}

function readIncomingSelection(message) {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    return message.interactive.button_reply?.id || '';
  }
  if (message.type === 'interactive' && message.interactive?.type === 'list_reply') {
    return message.interactive.list_reply?.id || '';
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

async function notifyAdminsNewOrder(rootDir, order) {
  const admins = getAdminNumbers();
  if (!admins.length) return;
  const body = `طلب جديد يحتاج مراجعة 🔔\n\n${buildOrderSummary(order)}\n\nأوامر الإدارة:\n/approve ${order.id}\n/reject ${order.id} سبب\n/ready ${order.id}\n/out ${order.id}\n/delivered ${order.id}`;
  for (const admin of admins) {
    await sendWhatsAppText(rootDir, admin, body);
  }
}

async function finalizeOrder(rootDir, phone, session, config) {
  const data = readSessionData(session);
  const cart = data.cart || [];
  if (!cart.length) {
    return { error: 'السلة فارغة حاليًا. اختر ابدأ الطلب لإضافة أصناف.' };
  }
  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const orderId = `MY-${Date.now()}`;
  const order = {
    id: orderId,
    customerName: 'عميل مطبخ اليوم',
    phone,
    items: cart,
    notes: data.orderDraft?.notes || '',
    address: data.orderDraft?.address || '',
    deliverySlot: data.orderDraft?.deliverySlot || '',
    deliveryType: data.orderDraft?.deliveryType || 'delivery',
    paymentMethod: data.orderDraft?.paymentMethod || 'cash',
    status: 'under_review',
    statusLabelAr: 'قيد المراجعة',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subtotalJod: subtotal,
    deliveryFeeJod: 0,
    totalJod: subtotal,
    preferredLanguage: session?.preferred_language || 'ar',
    consentStatus: session?.consent_status || 'service_only'
  };
  const created = await createOrder(rootDir, order);
  await persistSession(rootDir, phone, session, {
    currentState: 'main_menu',
    lastOrderId: orderId,
    sessionData: {
      cart: [],
      selectedSection: null,
      itemPage: 0,
      pendingItemId: null,
      awaiting: null,
      orderDraft: {},
      lastOrderId: orderId
    }
  });
  await notifyAdminsNewOrder(rootDir, order);
  return { order: created };
}

async function processAdminCommand(rootDir, from, text) {
  const trimmed = String(text || '').trim();
  const [command, orderId, ...rest] = trimmed.split(/\s+/);
  if (command === '/help') {
    return sendWhatsAppText(rootDir, from, 'أوامر الإدارة:\n/pending\n/approve ORDER_ID\n/reject ORDER_ID سبب\n/ready ORDER_ID\n/out ORDER_ID\n/delivered ORDER_ID');
  }
  if (command === '/pending') {
    const orders = await getOrdersByStatus(rootDir, 'under_review', 10);
    if (!orders.length) return sendWhatsAppText(rootDir, from, 'لا توجد طلبات قيد المراجعة حاليًا.');
    const body = orders.map(order => `• ${order.id} — ${order.phone} — ${money(order.total_jod || order.totalJod)} — ${order.delivery_slot || '-'}`).join('\n');
    return sendWhatsAppText(rootDir, from, `الطلبات قيد المراجعة:\n${body}`);
  }
  if (command === '/view' && orderId) {
    const order = await getOrderById(rootDir, orderId);
    if (!order) return sendWhatsAppText(rootDir, from, `الطلب ${orderId} غير موجود.`);
    const items = await getOrderItems(rootDir, orderId);
    return sendWhatsAppText(rootDir, from, buildOrderSummary({
      ...order,
      items: items.map(item => ({
        ...item,
        displayNameAr: item.display_name_ar,
        lineTotalJod: item.line_total_jod
      }))
    }));
  }
  if (ADMIN_COMMANDS[command] && orderId) {
    const order = await getOrderById(rootDir, orderId);
    if (!order) return sendWhatsAppText(rootDir, from, `الطلب ${orderId} غير موجود.`);
    const meta = ADMIN_COMMANDS[command];
    const adminNotes = rest.join(' ').trim();
    const updated = await updateOrderStatus(rootDir, orderId, meta.status, meta.label, {
      adminNotes,
      approvedByPhone: from,
      approvedAt: new Date().toISOString()
    });
    await sendWhatsAppText(rootDir, normalizePhone(order.phone).replace(/^\+/, ''), customerStatusMessage(meta.label, orderId, adminNotes));
    return sendWhatsAppText(rootDir, from, `تم تحديث ${orderId} إلى: ${meta.label}`);
  }
  return sendWhatsAppText(rootDir, from, 'أمر غير معروف. أرسل /help لعرض أوامر الإدارة.');
}

export async function processWhatsAppWebhook(req, res, config, rootDir) {
  const body = await parseBody(req);
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];

  if (!message) {
    return json(res, 200, { ok: true, message: 'No message payload.' });
  }

  const from = normalizePhone(message.from || '');
  const to = from.replace(/^\+/, '');
  const type = message.type || 'unknown';
  const text = message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || buildLocationText(message) || '';
  const audioId = message.audio?.id || '';

  await saveIncomingMessage(rootDir, {
    id: crypto.randomUUID(),
    from,
    type,
    text,
    audioId,
    payload: message,
    receivedAt: new Date().toISOString()
  });

  if (type === 'audio') {
    const result = await sendWhatsAppText(rootDir, to, 'شكرًا لرسالتكم الصوتية. تم استلامها وسيتابعها النظام أو أحد أفراد الفريق حسب الحاجة.');
    return json(res, 200, { ok: true, delivered: result, mode: 'audio_ack' });
  }

  if (isAdminPhone(from) && type === 'text' && String(text).trim().startsWith('/')) {
    const result = await processAdminCommand(rootDir, to, text);
    return json(res, 200, { ok: true, delivered: result, mode: 'admin_command' });
  }

  const selection = readIncomingSelection(message);
  const session = await getConversationSession(rootDir, from);
  const currentLanguage = session?.preferred_language || 'ar';
  const sessionData = readSessionData(session);

  if (selection === BUTTON_IDS.AR || selection === BUTTON_IDS.EN) {
    const preferredLanguage = selection === BUTTON_IDS.EN ? 'en' : 'ar';
    await upsertCustomer(rootDir, { phone: from, preferredLanguage, consentStatus: session?.consent_status || 'pending' });
    await persistSession(rootDir, from, session, { preferredLanguage, consentStatus: session?.consent_status || 'pending', currentState: 'awaiting_consent' });
    const result = await sendWhatsAppInteractive(rootDir, to, consentButtons(preferredLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'consent_buttons' });
  }

  if ([BUTTON_IDS.CONSENT_YES, BUTTON_IDS.CONSENT_SERVICE_ONLY, BUTTON_IDS.CONSENT_NO].includes(selection)) {
    const consentStatus = selection === BUTTON_IDS.CONSENT_YES ? 'marketing_opt_in' : selection === BUTTON_IDS.CONSENT_SERVICE_ONLY ? 'service_only' : 'declined';
    const preferredLanguage = currentLanguage || 'ar';
    await upsertCustomer(rootDir, { phone: from, preferredLanguage, consentStatus });
    await persistSession(rootDir, from, session, { preferredLanguage, consentStatus, currentState: 'main_menu' });
    const result = await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(preferredLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'main_menu_buttons' });
  }

  if (selection === BUTTON_IDS.HUMAN) {
    const result = await replyHuman(rootDir, to, config, req);
    return json(res, 200, { ok: true, delivered: result, mode: 'human' });
  }

  if (selection === BUTTON_IDS.BACK_MAIN) {
    await persistSession(rootDir, from, session, { currentState: 'main_menu' });
    const result = await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(currentLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'back_main' });
  }

  if (selection === BUTTON_IDS.START_ORDER || selection === BUTTON_IDS.SHOW_MENU || selection === BUTTON_IDS.CART_ADD_MORE) {
    await persistSession(rootDir, from, session, { currentState: 'menu_sections' });
    const mode = selection === BUTTON_IDS.SHOW_MENU ? 'menu' : 'order';
    const result = await sendWhatsAppInteractive(rootDir, to, buildSectionList(rootDir, mode));
    return json(res, 200, { ok: true, delivered: result, mode: 'sections_list' });
  }

  if (selection === BUTTON_IDS.TRACK_ORDER) {
    const orders = await findOrdersByPhone(rootDir, from);
    if (orders.length) {
      const body = orders.slice(0, 5).map(order => `• ${order.id} — ${order.status_label_ar || order.statusLabelAr || order.status}`).join('\n');
      const result = await sendWhatsAppText(rootDir, to, `آخر الطلبات المرتبطة بهذا الرقم:\n${body}`);
      return json(res, 200, { ok: true, delivered: result, mode: 'track_recent' });
    }
    await persistSession(rootDir, from, session, { currentState: 'awaiting_track_id', sessionData: { awaiting: 'track_id' } });
    const result = await sendWhatsAppText(rootDir, to, 'أرسل رقم الطلب مثل MY-1234567890 لمتابعة حالته.');
    return json(res, 200, { ok: true, delivered: result, mode: 'track_prompt' });
  }

  if (selection.startsWith('section:')) {
    const [, sectionSlug = '', page = '0'] = selection.split(':');
    const sectionPage = Number(page || 0);
    await persistSession(rootDir, from, session, {
      currentState: 'menu_items',
      lastMenuSection: sectionSlug,
      sessionData: { selectedSection: sectionSlug, itemPage: sectionPage }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildItemsList(rootDir, sectionSlug, sectionPage));
    return json(res, 200, { ok: true, delivered: result, mode: 'items_list' });
  }

  if (selection.startsWith('item:')) {
    const itemId = selection.split(':')[1] || '';
    const item = getMenuItemById(rootDir, itemId);
    if (!item) {
      const result = await sendWhatsAppText(rootDir, to, 'تعذر الوصول إلى الصنف المطلوب. اختر القسم من جديد.');
      return json(res, 200, { ok: true, delivered: result, mode: 'item_missing' });
    }
    await persistSession(rootDir, from, session, {
      currentState: 'awaiting_quantity',
      sessionData: { pendingItemId: itemId, awaiting: 'quantity' }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildQuantityList(item));
    return json(res, 200, { ok: true, delivered: result, mode: 'quantity_list' });
  }

  if (selection.startsWith('qtymore:')) {
    const itemId = selection.split(':')[1] || '';
    await persistSession(rootDir, from, session, {
      currentState: 'awaiting_quantity_text',
      sessionData: { pendingItemId: itemId, awaiting: 'quantity_text' }
    });
    const item = getMenuItemById(rootDir, itemId);
    const result = await sendWhatsAppText(rootDir, to, `أرسل الكمية المطلوبة من ${item?.display_name_ar || 'الصنف'} بالأرقام فقط.`);
    return json(res, 200, { ok: true, delivered: result, mode: 'quantity_text_prompt' });
  }

  if (selection.startsWith('qty:')) {
    const [, itemId = '', qtyValue = '1'] = selection.split(':');
    const quantity = Number(qtyValue || 1);
    const item = getMenuItemById(rootDir, itemId);
    if (!item || !quantity || quantity < 1) {
      const result = await sendWhatsAppText(rootDir, to, 'تعذر إضافة هذا الصنف. جرّب مرة أخرى.');
      return json(res, 200, { ok: true, delivered: result, mode: 'qty_error' });
    }
    const newItem = {
      id: item.record_id,
      displayNameAr: item.display_name_ar || item.item_name_ar,
      unit_ar: item.unit_ar,
      price_1_jod: Number(item.price_1_jod || 0),
      quantity,
      lineTotalJod: Number(item.price_1_jod || 0) * quantity
    };
    const cart = [...(sessionData.cart || []), newItem];
    const summary = summarizeCart(cart);
    await persistSession(rootDir, from, session, {
      currentState: 'reviewing_cart',
      lastMenuSection: item.section_ar,
      sessionData: {
        cart,
        selectedSection: sessionData.selectedSection,
        pendingItemId: null,
        awaiting: null
      }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildCartButtons(summary.text));
    return json(res, 200, { ok: true, delivered: result, mode: 'cart_review' });
  }

  if (selection === BUTTON_IDS.CART_CLEAR) {
    await persistSession(rootDir, from, session, {
      currentState: 'main_menu',
      sessionData: { cart: [], selectedSection: null, itemPage: 0, pendingItemId: null, awaiting: null, orderDraft: {} }
    });
    const result = await sendWhatsAppText(rootDir, to, 'تم إلغاء السلة الحالية.');
    await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(currentLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'cart_cleared' });
  }

  if (selection === BUTTON_IDS.CART_SUBMIT) {
    if (!(sessionData.cart || []).length) {
      const result = await sendWhatsAppText(rootDir, to, 'السلة فارغة حاليًا. اختر ابدأ الطلب لإضافة أصناف.');
      return json(res, 200, { ok: true, delivered: result, mode: 'cart_empty' });
    }
    await persistSession(rootDir, from, session, { currentState: 'awaiting_delivery_type' });
    const result = await sendWhatsAppInteractive(rootDir, to, buildDeliveryButtons());
    return json(res, 200, { ok: true, delivered: result, mode: 'delivery_type' });
  }

  if (selection === BUTTON_IDS.DELIVERY || selection === BUTTON_IDS.PICKUP) {
    const deliveryType = selection === BUTTON_IDS.PICKUP ? 'pickup' : 'delivery';
    await persistSession(rootDir, from, session, {
      currentState: 'awaiting_delivery_slot',
      sessionData: { orderDraft: { deliveryType } }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildSlotList(config, deliveryType));
    return json(res, 200, { ok: true, delivered: result, mode: 'delivery_slot' });
  }

  if (selection.startsWith('slot:')) {
    const slotIndex = Number(selection.split(':')[1] || 0);
    const deliverySlot = (config.deliveryTimeSlots || [])[slotIndex] || null;
    const deliveryType = sessionData.orderDraft?.deliveryType || 'delivery';
    if (!deliverySlot) {
      const result = await sendWhatsAppText(rootDir, to, 'تعذر تحديد الموعد، اختر مرة أخرى.');
      return json(res, 200, { ok: true, delivered: result, mode: 'slot_error' });
    }
    if (deliveryType === 'delivery') {
      await persistSession(rootDir, from, session, {
        currentState: 'awaiting_address',
        sessionData: { orderDraft: { deliverySlot }, awaiting: 'address' }
      });
      const result = await sendWhatsAppText(rootDir, to, 'أرسل عنوان التوصيل بالتفصيل أو شارك الموقع الآن.');
      return json(res, 200, { ok: true, delivered: result, mode: 'address_prompt' });
    }
    await persistSession(rootDir, from, session, {
      currentState: 'awaiting_payment_method',
      sessionData: { orderDraft: { deliverySlot, address: 'استلام من المطبخ' }, awaiting: 'payment_method' }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildPaymentButtons());
    return json(res, 200, { ok: true, delivered: result, mode: 'payment_prompt_after_pickup' });
  }

  if (selection === BUTTON_IDS.PAY_CASH || selection === BUTTON_IDS.PAY_TRANSFER) {
    const paymentMethod = selection === BUTTON_IDS.PAY_TRANSFER ? 'transfer' : 'cash';
    await persistSession(rootDir, from, session, {
      currentState: 'awaiting_notes_choice',
      sessionData: { orderDraft: { paymentMethod }, awaiting: 'notes_choice' }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildNotesButtons());
    return json(res, 200, { ok: true, delivered: result, mode: 'notes_choice' });
  }

  if (selection === BUTTON_IDS.NOTES_ADD) {
    await persistSession(rootDir, from, session, { currentState: 'awaiting_notes_text', sessionData: { awaiting: 'notes_text' } });
    const result = await sendWhatsAppText(rootDir, to, 'أرسل الملاحظات الإضافية على الطلب الآن.');
    return json(res, 200, { ok: true, delivered: result, mode: 'notes_text' });
  }

  if (selection === BUTTON_IDS.NOTES_SKIP) {
    const finalize = await finalizeOrder(rootDir, from, session, config);
    if (finalize.error) {
      const result = await sendWhatsAppText(rootDir, to, finalize.error);
      return json(res, 200, { ok: true, delivered: result, mode: 'finalize_error' });
    }
    const result = await sendWhatsAppText(rootDir, to, `تم استلام طلبكم بنجاح ✅\nرقم الطلب: ${finalize.order.id}\nالحالة الحالية: قيد المراجعة\n\nلن يتم اعتماد الطلب نهائيًا إلا من الإدارة.`);
    await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(currentLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'order_created' });
  }

  if (type === 'location' && sessionData.awaiting === 'address') {
    const locationText = buildLocationText(message);
    await persistSession(rootDir, from, session, {
      currentState: 'awaiting_payment_method',
      sessionData: { orderDraft: { address: locationText }, awaiting: 'payment_method' }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildPaymentButtons());
    return json(res, 200, { ok: true, delivered: result, mode: 'location_saved' });
  }

  if (type === 'text' && sessionData.awaiting === 'quantity_text') {
    const quantity = Number(String(text).trim());
    const item = getMenuItemById(rootDir, sessionData.pendingItemId);
    if (!quantity || quantity < 1 || !item) {
      const result = await sendWhatsAppText(rootDir, to, 'أرسل رقمًا صحيحًا للكمية، مثل 2 أو 5.');
      return json(res, 200, { ok: true, delivered: result, mode: 'quantity_text_invalid' });
    }
    const newItem = {
      id: item.record_id,
      displayNameAr: item.display_name_ar || item.item_name_ar,
      unit_ar: item.unit_ar,
      price_1_jod: Number(item.price_1_jod || 0),
      quantity,
      lineTotalJod: Number(item.price_1_jod || 0) * quantity
    };
    const cart = [...(sessionData.cart || []), newItem];
    const summary = summarizeCart(cart);
    await persistSession(rootDir, from, session, {
      currentState: 'reviewing_cart',
      sessionData: { cart, pendingItemId: null, awaiting: null }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildCartButtons(summary.text));
    return json(res, 200, { ok: true, delivered: result, mode: 'quantity_text_added' });
  }

  if (type === 'text' && sessionData.awaiting === 'address') {
    await persistSession(rootDir, from, session, {
      currentState: 'awaiting_payment_method',
      sessionData: { orderDraft: { address: text }, awaiting: 'payment_method' }
    });
    const result = await sendWhatsAppInteractive(rootDir, to, buildPaymentButtons());
    return json(res, 200, { ok: true, delivered: result, mode: 'address_saved' });
  }

  if (type === 'text' && sessionData.awaiting === 'notes_text') {
    const nextSession = await persistSession(rootDir, from, session, {
      currentState: 'finalizing_order',
      sessionData: { orderDraft: { notes: text }, awaiting: null }
    });
    const finalize = await finalizeOrder(rootDir, from, nextSession, config);
    if (finalize.error) {
      const result = await sendWhatsAppText(rootDir, to, finalize.error);
      return json(res, 200, { ok: true, delivered: result, mode: 'notes_finalize_error' });
    }
    const result = await sendWhatsAppText(rootDir, to, `تم استلام طلبكم بنجاح ✅\nرقم الطلب: ${finalize.order.id}\nالحالة الحالية: قيد المراجعة\n\nلن يتم اعتماد الطلب نهائيًا إلا من الإدارة.`);
    await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(currentLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'notes_order_created' });
  }

  if (type === 'text' && sessionData.awaiting === 'track_id') {
    const orderId = String(text).trim();
    const order = await getOrderById(rootDir, orderId);
    const bodyText = order ? `حالة الطلب ${order.id}: ${order.status_label_ar || order.statusLabelAr || order.status}` : 'لم نتمكن من العثور على الطلب. تحقق من الرقم وأعد الإرسال.';
    const result = await sendWhatsAppText(rootDir, to, bodyText);
    await persistSession(rootDir, from, session, { currentState: 'main_menu', sessionData: { awaiting: null } });
    return json(res, 200, { ok: true, delivered: result, mode: 'track_lookup' });
  }

  if (!session) {
    await persistSession(rootDir, from, session, { preferredLanguage: 'ar', consentStatus: 'pending', currentState: 'welcome' });
    const result = await sendWhatsAppInteractive(rootDir, to, welcomeButtons('ar'));
    return json(res, 200, { ok: true, delivered: result, mode: 'welcome_buttons' });
  }

  const fallbackIntent = detectIntent(text);
  if (fallbackIntent === BUTTON_IDS.SHOW_MENU || fallbackIntent === BUTTON_IDS.START_ORDER) {
    await persistSession(rootDir, from, session, { currentState: 'menu_sections' });
    const mode = fallbackIntent === BUTTON_IDS.SHOW_MENU ? 'menu' : 'order';
    const result = await sendWhatsAppInteractive(rootDir, to, buildSectionList(rootDir, mode));
    return json(res, 200, { ok: true, delivered: result, mode: 'sections_from_text' });
  }
  if (fallbackIntent === BUTTON_IDS.TRACK_ORDER) {
    const orders = await findOrdersByPhone(rootDir, from);
    const bodyText = orders.length ? orders.slice(0, 5).map(order => `• ${order.id} — ${order.status_label_ar || order.statusLabelAr || order.status}`).join('\n') : 'لا توجد طلبات مرتبطة بهذا الرقم حاليًا.';
    const result = await sendWhatsAppText(rootDir, to, bodyText);
    return json(res, 200, { ok: true, delivered: result, mode: 'track_from_text' });
  }
  if (fallbackIntent === BUTTON_IDS.HUMAN) {
    const result = await replyHuman(rootDir, to, config, req);
    return json(res, 200, { ok: true, delivered: result, mode: 'human_from_text' });
  }
  if (fallbackIntent === 'welcome') {
    const result = await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(currentLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'main_menu_from_text' });
  }

  const result = await sendWhatsAppInteractive(rootDir, to, mainMenuButtons(currentLanguage));
  return json(res, 200, { ok: true, delivered: result, mode: 'fallback_main_menu' });
}
