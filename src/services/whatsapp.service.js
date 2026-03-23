import crypto from 'node:crypto';
import { parseBody, json, normalizePhone, slugify } from '../utils/core.js';
import { getSections } from './menu.service.js';
import { getConversationSession, saveIncomingMessage, saveOutgoingMessage, setConversationSession, upsertCustomer } from './storage.service.js';

const BUTTON_IDS = {
  AR: 'lang_ar',
  EN: 'lang_en',
  HUMAN: 'human_agent',
  CONSENT_YES: 'consent_marketing_opt_in',
  CONSENT_SERVICE_ONLY: 'consent_service_only',
  CONSENT_NO: 'consent_no',
  START_ORDER: 'start_order',
  SHOW_MENU: 'show_menu',
  TRACK_ORDER: 'track_order'
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

function detectIntent(text = '') {
  const input = String(text || '').toLowerCase();
  if (/موظف|human|agent|اتصال|تواصل/.test(input)) return BUTTON_IDS.HUMAN;
  if (/منيو|menu|الأصناف|اسعار|أسعار/.test(input)) return BUTTON_IDS.SHOW_MENU;
  if (/تتبع|tracking|track/.test(input)) return BUTTON_IDS.TRACK_ORDER;
  if (/طلب|اطلب|order/.test(input)) return BUTTON_IDS.START_ORDER;
  if (/مرحبا|اهلا|أهلا|hello|hi|السلام عليكم/.test(input)) return 'welcome';
  return 'welcome';
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

function buildMenuList(rootDir, config, req) {
  const sections = getSections(rootDir)
    .slice(0, 10)
    .map(section => ({
      id: `section:${slugify(section.section_ar)}`,
      title: section.section_ar.slice(0, 24),
      description: `${section.count} صنف`
    }));

  return {
    type: 'list',
    body: { text: 'تفضلوا باختيار قسم المنيو المطلوب.' },
    action: {
      button: 'عرض الأقسام',
      sections: [
        {
          title: 'أقسام مطبخ اليوم',
          rows: sections
        }
      ]
    }
  };
}

function findSectionReply(rootDir, sectionSlug, config, req) {
  const sections = getSections(rootDir);
  const selected = sections.find(section => slugify(section.section_ar) === sectionSlug);
  const { orderUrl } = buildTextLinks(config, req);
  if (!selected) {
    return {
      type: 'text',
      text: 'لم نتمكن من العثور على هذا القسم. أرسل كلمة منيو لإعادة عرض الأقسام.'
    };
  }
  const lines = selected.items.slice(0, 8).map(item => `• ${item.display_name_ar || item.item_name_ar} — ${Number(item.price_1_jod).toFixed(3)} د.أ`);
  return {
    type: 'text',
    text: `قسم ${selected.section_ar}\n${lines.join('\n')}\n\nللطلب المباشر: ${orderUrl}\nيمكنك أيضًا كتابة اسم الصنف أو الضغط على ابدأ الطلب.`
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
  const { orderUrl, phone } = buildTextLinks(config, req);
  return sendWhatsAppText(rootDir, to, `يسعدنا خدمتك. يمكنك التواصل مباشرة مع الموظف على الرقم ${phone} أو البدء بالطلب من خلال: ${orderUrl}`);
}

function readIncomingSelection(message) {
  if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
    return message.interactive.button_reply?.id || '';
  }
  if (message.type === 'interactive' && message.interactive?.type === 'list_reply') {
    return message.interactive.list_reply?.id || '';
  }
  if (message.type === 'text') {
    return detectIntent(message.text?.body || '');
  }
  return '';
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
  const type = message.type || 'unknown';
  const text = message.text?.body || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
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

  const selection = readIncomingSelection(message);
  const session = await getConversationSession(rootDir, from);
  const currentLanguage = session?.preferred_language || 'ar';

  if (type === 'audio') {
    const result = await sendWhatsAppText(rootDir, from.replace(/^\+/, ''), 'شكرًا لرسالتكم الصوتية. تم استلامها وسيتابعها النظام أو أحد أفراد الفريق حسب الحاجة.');
    return json(res, 200, { ok: true, delivered: result, mode: 'audio_ack' });
  }

  if (selection === BUTTON_IDS.AR || selection === BUTTON_IDS.EN) {
    const preferredLanguage = selection === BUTTON_IDS.EN ? 'en' : 'ar';
    await upsertCustomer(rootDir, { phone: from, preferredLanguage, consentStatus: session?.consent_status || 'pending' });
    await setConversationSession(rootDir, from, { preferredLanguage, consentStatus: session?.consent_status || 'pending', currentState: 'awaiting_consent' });
    const result = await sendWhatsAppInteractive(rootDir, from.replace(/^\+/, ''), consentButtons(preferredLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'consent_buttons' });
  }

  if ([BUTTON_IDS.CONSENT_YES, BUTTON_IDS.CONSENT_SERVICE_ONLY, BUTTON_IDS.CONSENT_NO].includes(selection)) {
    const consentStatus = selection === BUTTON_IDS.CONSENT_YES ? 'marketing_opt_in' : selection === BUTTON_IDS.CONSENT_SERVICE_ONLY ? 'service_only' : 'declined';
    const preferredLanguage = currentLanguage || 'ar';
    await upsertCustomer(rootDir, { phone: from, preferredLanguage, consentStatus });
    await setConversationSession(rootDir, from, { preferredLanguage, consentStatus, currentState: 'main_menu' });
    const result = await sendWhatsAppInteractive(rootDir, from.replace(/^\+/, ''), mainMenuButtons(preferredLanguage));
    return json(res, 200, { ok: true, delivered: result, mode: 'main_menu_buttons' });
  }

  if (selection === BUTTON_IDS.HUMAN) {
    const result = await replyHuman(rootDir, from.replace(/^\+/, ''), config, req);
    return json(res, 200, { ok: true, delivered: result, mode: 'human' });
  }

  if (selection === BUTTON_IDS.START_ORDER) {
    const { orderUrl } = buildTextLinks(config, req);
    const result = await sendWhatsAppText(rootDir, from.replace(/^\+/, ''), `يمكنك إرسال طلبك الآن من خلال صفحة الطلب: ${orderUrl}\nمهم: كل طلب يدخل أولًا بحالة قيد المراجعة ولا يُعتمد نهائيًا إلا من الإدارة.`);
    return json(res, 200, { ok: true, delivered: result, mode: 'start_order' });
  }

  if (selection === BUTTON_IDS.TRACK_ORDER) {
    const { trackUrl } = buildTextLinks(config, req);
    const result = await sendWhatsAppText(rootDir, from.replace(/^\+/, ''), `لتتبع الطلبات: ${trackUrl}`);
    return json(res, 200, { ok: true, delivered: result, mode: 'track' });
  }

  if (selection === BUTTON_IDS.SHOW_MENU) {
    await setConversationSession(rootDir, from, { preferredLanguage: currentLanguage, consentStatus: session?.consent_status || 'pending', currentState: 'menu_sections' });
    const result = await sendWhatsAppInteractive(rootDir, from.replace(/^\+/, ''), buildMenuList(rootDir, config, req));
    return json(res, 200, { ok: true, delivered: result, mode: 'menu_list' });
  }

  if (selection.startsWith('section:')) {
    const sectionSlug = selection.split(':')[1] || '';
    await setConversationSession(rootDir, from, { preferredLanguage: currentLanguage, consentStatus: session?.consent_status || 'pending', currentState: 'menu_section_detail', lastMenuSection: sectionSlug });
    const sectionReply = findSectionReply(rootDir, sectionSlug, config, req);
    const result = await sendWhatsAppText(rootDir, from.replace(/^\+/, ''), sectionReply.text);
    return json(res, 200, { ok: true, delivered: result, mode: 'menu_section_detail' });
  }

  if (!session) {
    await setConversationSession(rootDir, from, { preferredLanguage: 'ar', consentStatus: 'pending', currentState: 'welcome' });
    const result = await sendWhatsAppInteractive(rootDir, from.replace(/^\+/, ''), welcomeButtons('ar'));
    return json(res, 200, { ok: true, delivered: result, mode: 'welcome_buttons' });
  }

  const fallbackIntent = detectIntent(text);
  if (fallbackIntent === BUTTON_IDS.SHOW_MENU) {
    const result = await sendWhatsAppInteractive(rootDir, from.replace(/^\+/, ''), buildMenuList(rootDir, config, req));
    return json(res, 200, { ok: true, delivered: result, mode: 'menu_list_from_text' });
  }
  if (fallbackIntent === BUTTON_IDS.START_ORDER) {
    const { orderUrl } = buildTextLinks(config, req);
    const result = await sendWhatsAppText(rootDir, from.replace(/^\+/, ''), `يمكنك إرسال طلبك الآن من خلال صفحة الطلب: ${orderUrl}`);
    return json(res, 200, { ok: true, delivered: result, mode: 'start_order_from_text' });
  }
  if (fallbackIntent === BUTTON_IDS.TRACK_ORDER) {
    const { trackUrl } = buildTextLinks(config, req);
    const result = await sendWhatsAppText(rootDir, from.replace(/^\+/, ''), `لتتبع الطلبات: ${trackUrl}`);
    return json(res, 200, { ok: true, delivered: result, mode: 'track_from_text' });
  }
  if (fallbackIntent === BUTTON_IDS.HUMAN) {
    const result = await replyHuman(rootDir, from.replace(/^\+/, ''), config, req);
    return json(res, 200, { ok: true, delivered: result, mode: 'human_from_text' });
  }

  const result = await sendWhatsAppInteractive(rootDir, from.replace(/^\+/, ''), mainMenuButtons(currentLanguage));
  return json(res, 200, { ok: true, delivered: result, mode: 'fallback_main_menu' });
}
