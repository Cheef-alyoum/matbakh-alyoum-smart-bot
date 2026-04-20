import crypto from 'node:crypto';
import { parseBody, json, normalizePhone, slugify } from '../utils/core.js';
import { getDeliveryGroupByKey, getDeliveryGroupList, getDeliveryZoneById } from './delivery.service.js';
import { getMenuItemById, getDisplayUnit, getMenuData } from './menu.service.js';
import { getActiveAdminPhones, getAdminProfile, isAdminAuthorized, profileCan } from './admin-role.service.js';
import { createOrder, generateNextOrderCode, getConversationSession, getCustomerProfileSummary, getLatestOpenOrderByPhone, getOrderById, getOrderItems, saveIncomingMessage, saveOutgoingMessage, setConversationSession, updateOrderStatus, upsertCustomer } from './storage.service.js';

// --- معرفات الأزرار ---
const BUTTON_IDS = {
  START_ORDER: 'start_order', SHOW_MENU_IMG: 'show_menu_img', SHOW_MENU: 'show_menu', HUMAN: 'human_agent',
  ORDER_TODAY: 'order_today', ORDER_FUTURE: 'order_future',
  CAT_MAHASHI: 'cat_mahashi', CAT_CHICKEN: 'cat_chicken', CAT_MEAT_ROM: 'cat_meat_rom', CAT_MEAT_BAL: 'cat_meat_bal', CAT_SALADS: 'cat_salads',
  ADD_MORE: 'cart_add_more', CHECKOUT: 'cart_checkout', CANCEL_ORDER: 'cancel_order',
  ADMIN_APPROVE: 'admin_approve', ADMIN_MODIFY: 'admin_modify', ADMIN_REJECT: 'admin_reject',
  ADMIN_PREPARING: 'admin_prep', ADMIN_READY: 'admin_ready', ADMIN_OUT: 'admin_out', ADMIN_DELIVERED: 'admin_del', ADMIN_FAILED: 'admin_failed'
};

const TRACK_TERMS = /(حاله|حالة|متابعه|متابعة|track|tracking|status|طلبي|الطلب|وين طلبي|وين الطلب|طلبي وين)/i;
const INCOMING_MESSAGE_CACHE = new Map();
const INCOMING_MESSAGE_TTL_MS = 10 * 60 * 1000;

function getSafeHost(req) { return req?.headers?.host || process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:10000'; }
function nowIso() { return new Date().toISOString(); }
function money(value) { return `${Number(value || 0).toFixed(3)} د.أ`; }
function shortButton(title, max = 20) { return String(title || '').trim().slice(0, max); }
function baseUnitLabel(item) { return getDisplayUnit(item); }

export function whatsappVerify(req, res) {
  const url = new URL(req?.url || '/api/webhooks/whatsapp', `http://${getSafeHost(req)}`);
  if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === (process.env.WHATSAPP_VERIFY_TOKEN || '')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(url.searchParams.get('hub.challenge'));
  }
  return json(res, 403, { ok: false, message: 'فشل التحقق من Webhook.' });
}

function isPast6PM() {
  const ammanTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Amman", hour12: false, hour: 'numeric' });
  return parseInt(ammanTime) >= 18;
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

function buildTextMenu() {
  return `🍽️ *منيو مطبخ اليوم المركزي* 🍽️
نطبخ بحب.. ونَفَس ست البيت 🌿

⭐ *الأطباق الأكثر مبيعاً:* (مقلوبة، محاشي، مسخن، مفتول)

🍗 *أطباق الدجاج* *الأسعار:* نص دجاجة: 8 د.أ | دجاجة: 15 د.أ | دجاجتين: 25 د.أ | 3 دجاجات: 35 د.أ
🎁 *ضيافة المطبخ:* علبة (خيار بلبن/دقوس/صوص) مجاناً مع كل نص دجاجة.

🥩 *أطباق اللحوم (بلدي وروماني)*
*الأسعار:* لحم روماني: 20 د.أ/كيلو | لحم بلدي: 25 د.أ/كيلو
🎁 *ضيافة المطبخ:* علبة خيار بلبن مجاناً مع كل نص كيلو.

🥬 *المحاشي* 🎁 *ضيافة المطبخ:* علبة خيار بلبن مجاناً مع كل نص كيلو.
- ورق عنب: 13 د.أ/كغم | يالنجي: 12 د.أ/كغم | ملفوف وكوسا: 8 د.أ/كغم

🍛 *الطبخات البيتية* (16 د.أ للطلب)
(ملوخية، كفتة، باميا، فاصوليا، شيخ المخشي، شيشبرك)

🥗 *سلطات ومقبلات*
- خيار بلبن، عربية، فتوش، جرجير: 2 د.أ
- تبولة، معكرونة، بوملي: 4 د.أ

للبدء بالطلب، اضغطوا على "اطلب الآن" بالأسفل 👇`;
}

function getFreebiesText(item, qty) {
  const name = String(item.displayNameAr || item.item_name_ar || '').toLowerCase();
  const portions = Math.floor(Number(qty) / 0.5); 
  if (portions < 1 && !name.includes('منسف')) return '';
  if (name.includes('كبسة')) return `🎁 ضيافة: ${portions} علبة دقوس 🌶️`;
  if (name.includes('منسف')) return `🎁 ضيافة: تشريبة جميد أصيل 🍲`;
  if (name.includes('مفتول')) return `🎁 ضيافة: ${portions} علبة صوص 🥣`;
  if (name.includes('مقلوبة') || name.includes('مسخن') || name.includes('عنب') || name.includes('كوسا') || name.includes('ملفوف') || name.includes('بيتنجان') || name.includes('يالنجي') || name.includes('فريكة') || name.includes('قدرة') || name.includes('برياني') || name.includes('اوزي') || name.includes('لحم')) {
    return `🎁 ضيافة: ${portions} علبة سلطة خيار بلبن 🥗`;
  }
  return '';
}

function welcomeButtons(returning = false) {
  return {
    type: 'button',
    body: (returning ? 'يا هلا وغلا فيكم من جديد بمطبخ اليوم المركزي 🌿\nنورتونا بطلتكم! ' : 'يا هلا ومرحبا فيكم بمطبخ اليوم المركزي 🌿\nنقدم لكم أكل بيتي أصيل، مطبوخ بحب وبـ "نَفَس ست البيت". ') + 'كيف بنقدر نخدمكم اليوم؟',
    buttons: [
      { id: BUTTON_IDS.START_ORDER, title: 'اطلب الآن 🍲' },
      { id: BUTTON_IDS.SHOW_MENU_IMG, title: 'تصفح المنيو 📖' },
      { id: BUTTON_IDS.HUMAN, title: 'مساعدة موظف 👨‍🍳' }
    ]
  };
}

function orderTimeButtons() {
  return {
    type: 'button',
    body: 'يا هلا! بتشرفونا 🌿\nحابين الطلب يكون لليوم، ولا لبكرة والأيام الجاية؟\n\n*(ملاحظة: نستقبل طلبات نفس اليوم حتى الساعة 6 مساءً فقط)*.',
    buttons: [{ id: BUTTON_IDS.ORDER_TODAY, title: 'الطلب لليوم ⏰' }, { id: BUTTON_IDS.ORDER_FUTURE, title: 'لبكرة / أيام قادمة 📅' }]
  };
}

function mainCategoriesList() {
  return {
    type: 'list', body: 'شو بتشتهوا اليوم من مطبخنا؟ 🌿', buttonText: 'تصفح الأقسام',
    sections: [{ title: 'الأقسام الرئيسية', rows: [
      { id: BUTTON_IDS.CAT_MAHASHI, title: 'المحاشي (الأكثر طلباً) 🥬', description: 'دوالي، ملفوف، كوسا...' },
      { id: BUTTON_IDS.CAT_CHICKEN, title: 'أطباق الدجاج 🍗', description: 'مقلوبة، مسخن، مفتول، منسف...' },
      { id: BUTTON_IDS.CAT_MEAT_BAL, title: 'لحوم بلدية 🥩', description: 'خرفان كاملة، مناسف، أوزي (بلدي)' },
      { id: BUTTON_IDS.CAT_MEAT_ROM, title: 'لحوم روماني 🍖', description: 'مناسف، قدرة، فريكة (روماني)' },
      { id: BUTTON_IDS.CAT_SALADS, title: 'سلطات ومقبلات 🥗', description: 'خيار بلبن، فتوش، تبولة...' }
    ]}]
  };
}

function vegOptionsButtons(itemId) {
  return { type: 'button', body: 'المقلوبة عندنا حكاية! 😋\nشو بتفضلوها تكون؟', buttons: [{ id: `opt_veg:${itemId}:زهرة`, title: 'زهرة' }, { id: `opt_veg:${itemId}:باذنجان`, title: 'باذنجان' }, { id: `opt_veg:${itemId}:مكس`, title: 'مكس (زهرة وباذنجان)' }] };
}

function sauceOptionsButtons(itemId) {
  return { type: 'button', body: 'المفتول بده صوص يكمل طعمه! 😋\nشو بتفضلوا نوع الصوص؟', buttons: [{ id: `opt_sauce:${itemId}:بندورة`, title: 'صوص بندورة 🍅' }, { id: `opt_sauce:${itemId}:اوريجنال`, title: 'صوص أبيض' }] };
}

function chickenQuantityList(item, selectedOption = '') {
  const optText = selectedOption ? ` (${selectedOption})` : '';
  const rows = [
    { id: `qty_chk:${item.record_id}:0.5:8`, title: 'نصف دجاجة', description: '8 د.أ (شامل الضيافة)' },
    { id: `qty_chk:${item.record_id}:1:15`, title: 'دجاجة كاملة', description: '15 د.أ (شامل الضيافة)' },
    { id: `qty_chk:${item.record_id}:2:25`, title: 'دجاجتين', description: '25 د.أ (شامل الضيافة)' },
    { id: `qty_chk:${item.record_id}:3:35`, title: '3 دجاجات', description: '35 د.أ (شامل الضيافة)' },
    { id: `manual_qty:${item.record_id}`, title: 'إدخال يدوي ✍️', description: 'مثال: 1.5، أو نص طلب' }
  ];
  return { type: 'list', body: `يا سلام على ${item.display_name_ar}${optText}! 🥘\nكم الكمية اللي بتناسبكم؟`, buttonText: 'اختاروا الكمية', sections: [{ title: 'الأحجام والأسعار', rows }] };
}

function meatQuantityList(item) {
  const isBaladi = item.record_id.includes('BAL') || String(item.category_ar).includes('بلدي');
  const pricePerKg = isBaladi ? 25 : 20;
  const rows = [
    { id: `qty_met:${item.record_id}:0.5:${pricePerKg * 0.5}`, title: 'نصف كيلو', description: `${pricePerKg * 0.5} د.أ (شامل الضيافة)` },
    { id: `qty_met:${item.record_id}:1:${pricePerKg}`, title: 'كيلو كامل', description: `${pricePerKg} د.أ (شامل الضيافة)` },
    { id: `qty_met:${item.record_id}:2:${pricePerKg * 2}`, title: '2 كيلو', description: `${pricePerKg * 2} د.أ (شامل الضيافة)` },
    { id: `manual_qty_met:${item.record_id}`, title: 'إدخال يدوي ✍️', description: 'مثال: 1.5 كيلو' }
  ];
  return { type: 'list', body: `اختياركم نخب! ${item.display_name_ar} 🥩\nكم كيلو بتحبوا نجهزلكم؟`, buttonText: 'اختاروا الوزن', sections: [{ title: 'الأوزان والأسعار', rows }] };
}

function cartSummary(cart = []) {
  const subtotal = cart.reduce((sum, item) => sum + Number(item.lineTotalJod || 0), 0);
  const lines = cart.map((item, index) => {
    const freebies = getFreebiesText(item, item.quantity);
    return `${index + 1}. ${item.displayNameAr} (كمية: ${item.quantity}) = ${money(item.lineTotalJod)}\n${freebies ? `   ${freebies}` : ''}`;
  });
  return { subtotal, text: `سلة طلباتكم بتفتح النفس 🌿\n\n${lines.join('\n\n') || 'السلة فاضية'}\n\nالإجمالي الحالي: ${money(subtotal)}` };
}

function cartButtons(summaryText) {
  return {
    type: 'button', body: `${summaryText}\n\n💡 نصيحة: السفرة ما بتكمل بدون مقبلات وسلطات إضافية! حابين تضيفوا شيء ولا نكمل الطلب؟`,
    buttons: [{ id: BUTTON_IDS.CHECKOUT, title: 'اعتماد ومتابعة ✅' }, { id: BUTTON_IDS.ADD_MORE, title: 'إضافة أصناف 🥗' }, { id: BUTTON_IDS.CANCEL_ORDER, title: 'إلغاء الطلب ❌' }]
  };
}

function adminDecisionButtons(orderId, from) {
  return { type: 'button', body: `قرار الإدارة لطلب ${orderId}`, buttons: [{ id: `admin_approve:${orderId}:${from}`, title: 'اعتماد الطلب ✅' }, { id: `admin_reject:${orderId}:${from}`, title: 'رفض ❌' }] };
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
        button: shortButton(interactive.buttonText || 'عرض الخيارات', 20),
        sections: (interactive.sections || []).slice(0, 10).map(s => ({
          title: shortButton(s.title || 'الخيارات', 24),
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
  if (!phoneNumberId || !accessToken) return { skipped: true };
  const requestBody = JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload });
  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: requestBody });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) console.error('WHATSAPP_API_ERROR', { status: response.status, data, payload: JSON.parse(requestBody) });
  return { status: response.status, data };
}

async function sendWhatsAppText(rootDir, to, body) {
  const res = await sendWhatsAppPayload(to, { type: 'text', text: { body } });
  try { await saveOutgoingMessage(rootDir, { id: crypto.randomUUID(), to, type: 'text', text: body, payload: res.data || null }); } catch(e){}
  return res;
}

async function sendWhatsAppInteractive(rootDir, to, interactive) {
  let normalized;
  try { normalized = normalizeInteractivePayload(interactive); } catch (e) { return sendWhatsAppText(rootDir, to, interactive?.body || 'خطأ في القائمة.'); }
  
  const res = await sendWhatsAppPayload(to, { type: 'interactive', interactive: normalized });
  try { await saveOutgoingMessage(rootDir, { id: crypto.randomUUID(), to, type: `interactive_${normalized.type}`, text: normalized.body?.text || 'أزرار', payload: res.data || null }); } catch(e){}
  return res;
}

export async function processWhatsAppWebhook(rootDir, req, res, config) {
  try {
    const body = await parseBody(req);
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || null;
    if (!message) return json(res, 200, { ok: true });
    if (hasIncomingMessageBeenProcessed(message.id)) return json(res, 200, { ok: true });
    markIncomingMessageProcessed(message.id);

    const from = normalizePhone(message.from || '').replace(/^\+/, '');
    const to = from; 
    const type = message.type;
    const text = message.type === 'text' ? String(message.text?.body || '').trim() : '';
    
    let selection = '';
    if (message.type === 'interactive' && message.interactive?.type === 'button_reply') selection = message.interactive.button_reply?.id;
    if (message.type === 'interactive' && message.interactive?.type === 'list_reply') selection = message.interactive.list_reply?.id;

    try { await saveIncomingMessage(rootDir, { id: message.id, from, type: message.type, text: text, payload: message }); } catch (e) {}

    let session = await getConversationSession(rootDir, from);
    let sessionData = session?.session_data || { cart: [], awaiting: null, orderDraft: {} };

    // الترحيب
    if (!session || text.match(/^(مرحبا|السلام عليكم|هلا)/i)) {
      session = await setConversationSession(rootDir, from, { current_state: 'welcome', session_data: { cart: [], orderDraft: {} } });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, welcomeButtons()) });
    }

    // عرض المنيو
    if (selection === BUTTON_IDS.SHOW_MENU_IMG || selection === BUTTON_IDS.SHOW_MENU || text.includes('منيو')) {
      await sendWhatsAppText(rootDir, from, buildTextMenu());
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, welcomeButtons(true)) });
    }

    // بدء الطلب
    if (selection === BUTTON_IDS.START_ORDER || text.includes('اطلب') || text.includes('طلب')) {
      sessionData = { cart: [], orderDraft: {} };
      await setConversationSession(rootDir, from, { current_state: 'order_time', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, orderTimeButtons()) });
    }

    if (selection === BUTTON_IDS.ORDER_TODAY) {
      if (isPast6PM()) {
        await sendWhatsAppText(rootDir, from, "يا ريت تعذرونا 🌿\nمطبخنا سكر استقبال طلبات لليوم (آخر موعد 6 المساء لضمان الجودة). بنتشرف نجهزلكم طلبكم لبكرة، اختاروا 'لبكرة / أيام قادمة' لنرتبلكم أطيب سفرة 🥘.");
        return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, orderTimeButtons()) });
      }
      sessionData.orderDraft.day = 'اليوم';
      await setConversationSession(rootDir, from, { current_state: 'browsing_cats', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, mainCategoriesList()) });
    }

    if (selection === BUTTON_IDS.ORDER_FUTURE) {
      sessionData.orderDraft.day = 'مستقبلي';
      await setConversationSession(rootDir, from, { current_state: 'browsing_cats', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, mainCategoriesList()) });
    }

    // تصفح الأقسام (تحديث الفلتر)
    if ([BUTTON_IDS.CAT_CHICKEN, BUTTON_IDS.CAT_MEAT_BAL, BUTTON_IDS.CAT_MEAT_ROM, BUTTON_IDS.CAT_SALADS, BUTTON_IDS.CAT_MAHASHI].includes(selection)) {
      const allItems = await getMenuData(rootDir).filter(i => i.menu_root !== 'modifiers'); 
      let filteredItems = []; let listTitle = '';

      if (selection === BUTTON_IDS.CAT_CHICKEN) { filteredItems = allItems.filter(i => i.menu_root === 'chicken'); listTitle = 'أطباق الدجاج'; }
      if (selection === BUTTON_IDS.CAT_MEAT_BAL) { filteredItems = allItems.filter(i => i.menu_root === 'meat_baladi'); listTitle = 'لحم بلدي'; }
      if (selection === BUTTON_IDS.CAT_MEAT_ROM) { filteredItems = allItems.filter(i => i.menu_root === 'meat_romani'); listTitle = 'لحم روماني'; }
      if (selection === BUTTON_IDS.CAT_MAHASHI) { filteredItems = allItems.filter(i => i.menu_root === 'mahashi'); listTitle = 'المحاشي'; }
      if (selection === BUTTON_IDS.CAT_SALADS) { filteredItems = allItems.filter(i => i.menu_root === 'salads'); listTitle = 'سلطات'; }

      await setConversationSession(rootDir, from, { current_state: 'selecting_item', session_data: sessionData });
      
      const rows = filteredItems.map(i => {
        const isBestSeller = ['مقلوبة', 'مسخن', 'مفتول', 'عنب', 'دوالي', 'ملفوف', 'كوسا'].some(b => String(i.item_name_ar).includes(b));
        const priceText = i.price_1_jod ? `يبدأ من ${money(i.price_1_jod)}` : 'اضغط لمعرفة الأحجام';
        return { id: `base_item:${i.record_id}`, title: shortButton(isBestSeller ? `⭐ ${i.display_name_ar}` : i.display_name_ar, 24), description: priceText };
      });

      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, { type: 'list', body: `تصفحوا ${listTitle} براحتكم 🌿`, buttonText: 'الخيارات', sections: [{ title: listTitle, rows: rows.slice(0, 10) }] }) });
    }

    if (selection.startsWith('base_item:')) {
      const itemId = selection.split(':')[1];
      const allItems = await getMenuData(rootDir);
      const item = allItems.find(i => i.record_id === itemId);
      
      if (item) {
        sessionData.pendingItemId = item.record_id;
        await setConversationSession(rootDir, from, { current_state: 'item_options', session_data: sessionData });

        if (String(item.display_name_ar).includes('مقلوبة')) return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, vegOptionsButtons(item.record_id)) });
        if (String(item.display_name_ar).includes('مفتول')) return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, sauceOptionsButtons(item.record_id)) });
        
        if (item.menu_root === 'chicken' || item.menu_root === 'mahashi') return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, chickenQuantityList(item)) });
        if (item.menu_root.includes('meat')) return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, meatQuantityList(item)) });
        
        sessionData.awaiting = 'manual_input';
        await setConversationSession(rootDir, from, { current_state: 'awaiting_manual', session_data: sessionData });
        return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, from, `يا هلا، اكتبوا لنا الكمية اللي بتحتاجوها من (${item.display_name_ar}) ✍️`) });
      }
    }

    if (selection.startsWith('opt_veg:') || selection.startsWith('opt_sauce:')) {
      const [, , itemId, optionText] = selection.split(':');
      const allItems = await getMenuData(rootDir);
      const item = allItems.find(i => i.record_id === itemId);
      sessionData.orderDraft.selectedOption = optionText;
      await setConversationSession(rootDir, from, { current_state: 'selecting_qty', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, chickenQuantityList(item, optionText)) });
    }

    if (selection.startsWith('qty_chk:') || selection.startsWith('qty_met:')) {
      const [, itemId, qty, price] = selection.split(':');
      const allItems = await getMenuData(rootDir);
      const item = allItems.find(i => i.record_id === itemId);
      const optText = sessionData.orderDraft.selectedOption ? ` (${sessionData.orderDraft.selectedOption})` : '';

      sessionData.cart.push({
        id: item.record_id, displayNameAr: item.display_name_ar + optText,
        quantity: Number(qty), lineTotalJod: Number(price)
      });
      await setConversationSession(rootDir, from, { current_state: 'reviewing_cart', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, cartButtons(cartSummary(sessionData.cart).text)) });
    }

    if (selection.startsWith('manual_qty')) {
      const itemId = selection.split(':')[1];
      sessionData.pendingItemId = itemId;
      sessionData.awaiting = 'manual_input';
      await setConversationSession(rootDir, from, { current_state: 'awaiting_manual', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, from, 'يا هلا، اكتبوا لنا الكمية اللي بتحتاجوها (مثلاً: 1.5، أو نصف) ✍️\nورح نحسبلكم السعر والضيافة مباشرة.') });
    }

    if (sessionData.awaiting === 'manual_input' && type === 'text') {
      const allItems = await getMenuData(rootDir);
      const item = allItems.find(i => i.record_id === sessionData.pendingItemId);
      if (!item) return json(res, 200, { ok: true });

      const textClean = text.replace(/نصف|نص/g, '0.5').replace(/ربع/g, '0.25').trim();
      let parsedQty = parseFloat(textClean);
      if (isNaN(parsedQty) || parsedQty <= 0) parsedQty = 1; 

      const isMeat = item.menu_root.includes('meat');
      let basePrice = 15; 
      if (isMeat) basePrice = item.menu_root.includes('baladi') ? 25 : 20;
      if (item.menu_root === 'mahashi') basePrice = item.price_1_jod || 10; 
      if (item.menu_root === 'salads') basePrice = item.price_1_jod || 2;
      
      const lineBase = basePrice * parsedQty;
      const optText = sessionData.orderDraft.selectedOption ? ` (${sessionData.orderDraft.selectedOption})` : '';

      sessionData.cart.push({
        id: item.record_id, displayNameAr: item.display_name_ar + optText,
        quantity: parsedQty, lineTotalJod: lineBase
      });
      sessionData.awaiting = null;
      await setConversationSession(rootDir, from, { current_state: 'reviewing_cart', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, cartButtons(cartSummary(sessionData.cart).text)) });
    }

    if (selection === BUTTON_IDS.ADD_MORE) {
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, mainCategoriesList()) });
    }

    if (selection === BUTTON_IDS.CANCEL_ORDER) {
      sessionData = { cart: [], orderDraft: {} };
      await setConversationSession(rootDir, from, { current_state: 'welcome', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, welcomeButtons(true)) });
    }

    if (selection === BUTTON_IDS.CHECKOUT) {
      sessionData.awaiting = 'address_or_location';
      await setConversationSession(rootDir, from, { current_state: 'awaiting_address', session_data: sessionData });
      return json(res, 200, { ok: true, delivered: await sendWhatsAppText(rootDir, from, 'الطلب صار جاهز للاعتماد 🌿\nيا ريت تشاركونا "اللوكيشن" (Location) 📍\nأو تكتبوا لنا العنوان بالتفصيل 🏠.') });
    }

    if (sessionData.awaiting === 'address_or_location' && (type === 'location' || type === 'text')) {
      const address = type === 'location' ? buildLocationText(message) : text;
      const total = sessionData.cart.reduce((sum, item) => sum + Number(item.lineTotalJod), 0);
      const orderId = `MAE${Math.floor(1000 + Math.random() * 9000)}`; 
      
      const adminMessage = `🚨 *طلب جديد يحتاج تأكيد* 🌿\nرقم الطلب: ${orderId}\nهاتف العميل: ${from}\n\n*الأصناف:*\n` + 
        sessionData.cart.map((i, idx) => {
          const f = getFreebiesText(i, i.quantity);
          return `${idx + 1}. ${i.displayNameAr} (كمية: ${i.quantity}) = ${money(i.lineTotalJod)}\n${f ? `   ${f}` : ''}`;
        }).join('\n') + `\n\n*الإجمالي:* ${money(total)}\n*العنوان:* ${address}\n\nيرجى اتخاذ الإجراء المناسب:`;

      await sendWhatsAppText(rootDir, from, `استلمنا طلبكم وهو الآن عند الإدارة والمطبخ للمعالجة 🌿\nرقم طلبكم للتتبع: ${orderId}\nخليكم قراب من التلفون لنوصلكم التأكيد النهائي بمجرد مراجعة جدول المطبخ 👨‍🍳.`);

      const admins = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [from]; 
      for (const admin of admins) {
        await sendWhatsAppText(rootDir, admin, adminMessage);
        await sendWhatsAppInteractive(rootDir, admin, adminDecisionButtons(orderId, from));
      }

      await setConversationSession(rootDir, from, { current_state: 'order_finished', session_data: { cart: [], orderDraft: {} } });
      return json(res, 200, { ok: true });
    }

    if (selection && selection.startsWith('admin_')) {
      const [action, orderId, customerPhone] = selection.split(':');
      if (action === 'admin_approve') {
        await sendWhatsAppText(rootDir, customerPhone, `توكلنا على الله، تم اعتماد طلبكم ${orderId} 👨‍🍳🔥\nيتم الآن التجهيز.`);
        await sendWhatsAppInteractive(rootDir, from, { type: 'button', body: `تم تأكيد ${orderId}. تحديث الحالة للعميل:`, buttons: [{ id: `admin_prep:${orderId}:${customerPhone}`, title: 'بدء التحضير 🍳' }, { id: `admin_ready:${orderId}:${customerPhone}`, title: 'الطلب جاهز 📦' }] });
      }
      else if (action === 'admin_reject') {
        await sendWhatsAppText(rootDir, customerPhone, `نعتذر منكم جداً 🌿\nما قدرنا نعتمد طلبكم رقم ${orderId} حالياً بسبب ضغط المطبخ. بنتشرف بخدمتكم في أوقات ثانية.`);
        await sendWhatsAppText(rootDir, from, `تم رفض الطلب وإبلاغ العميل.`);
      }
      else if (action === 'admin_prep') {
        await sendWhatsAppText(rootDir, customerPhone, `أكلكم صار على النار 👨‍🍳🔥\nالطلب ${orderId} قيد التحضير بكل حب وعناية.`);
        await sendWhatsAppInteractive(rootDir, from, { type: 'button', body: `الطلب ${orderId} قيد التحضير. الخطوة القادمة:`, buttons: [{ id: `admin_out:${orderId}:${customerPhone}`, title: 'خرج للتوصيل 🚚' }] });
      }
      else if (action === 'admin_out') {
        await sendWhatsAppText(rootDir, customerPhone, `المندوب بالطريق لكم 🚚\nطلبكم ${orderId} طلع من المطبخ، الأكل السخن واصلكم قريب!`);
        await sendWhatsAppInteractive(rootDir, from, { type: 'button', body: `الطلب ${orderId} بالطريق. التحديث النهائي:`, buttons: [{ id: `admin_del:${orderId}:${customerPhone}`, title: 'تم التسليم ✅' }, { id: `admin_failed:${orderId}:${customerPhone}`, title: 'عالق/لم يستلم ⚠️' }] });
      }
      else if (action === 'admin_del') {
        await sendWhatsAppText(rootDir, customerPhone, `ألف صحة وهنا على قلوبكم ✅\nنتمنى تكون الأكلات بيضت وجهكم. شاركونا رأيكم ولا تنسونا بطلباتكم الجاية 🌿`);
        await sendWhatsAppText(rootDir, from, `تم إغلاق الطلب ${orderId} بنجاح.`);
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 200, { ok: true, delivered: await sendWhatsAppInteractive(rootDir, from, welcomeButtons()) });
    
  } catch (error) {
    console.error('WEBHOOK_FATAL_ERROR', error);
    return json(res, 200, { ok: false, message: error.message });
  }
}
