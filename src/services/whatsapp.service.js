import crypto from 'node:crypto';
import { parseBody, json, normalizePhone } from '../utils/core.js';
import { saveIncomingMessage } from './storage.service.js';

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

function detectIntent(text = '') {
  const input = String(text || '').toLowerCase();
  if (/موظف|human|agent|اتصال|تواصل/.test(input)) return 'human';
  if (/منيو|menu|الأصناف|اسعار|أسعار/.test(input)) return 'menu';
  if (/طلب|اطلب|order/.test(input)) return 'order';
  if (/تتبع|tracking|track/.test(input)) return 'track';
  if (/عرض|عروض|offer/.test(input)) return 'offers';
  return 'welcome';
}

function buildReply(intent, config) {
  const menuUrl = `${config.site.baseUrl}/menu.html`;
  const orderUrl = `${config.site.baseUrl}/order.html`;
  const trackUrl = `${config.site.baseUrl}/track.html`;
  const phone = process.env.WHATSAPP_HUMAN_ESCALATION_NUMBER || config.site.businessPhoneDisplay;

  const replies = {
    human: `يسعدنا خدمتك. يمكنك التواصل مباشرة مع الموظف على الرقم ${phone} أو الطلب من خلال الموقع: ${orderUrl}`,
    menu: `تفضلوا منيو مطبخ اليوم المركزي: ${menuUrl}`,
    order: `يمكنك إرسال طلبك الآن من خلال صفحة الطلب: ${orderUrl}\nمهم: كل طلب يدخل أولًا بحالة قيد المراجعة ولا يُعتمد نهائيًا إلا من الإدارة.`,
    track: `لتتبع الطلبات: ${trackUrl}`,
    offers: `لعرض أحدث العروض والأقسام: ${menuUrl}#offers`,
    welcome: `أهلًا بكم في مطبخ اليوم المركزي.\n- المنيو: ${menuUrl}\n- الطلب: ${orderUrl}\n- التتبع: ${trackUrl}\n- موظف مباشر: ${phone}`
  };
  return replies[intent] || replies.welcome;
}

async function sendWhatsAppText(to, body) {
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
      to,
      type: 'text',
      text: { body }
    })
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
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
  const text = message.text?.body || '';
  const audioId = message.audio?.id || '';

  saveIncomingMessage(rootDir, {
    id: crypto.randomUUID(),
    from,
    type,
    text,
    audioId,
    payload: message,
    receivedAt: new Date().toISOString()
  });

  let reply = '';
  if (type === 'audio') {
    reply = 'شكرًا لرسالتكم الصوتية. تم استلامها وسيتابعها النظام أو أحد أفراد الفريق حسب الحاجة.';
  } else {
    const intent = detectIntent(text);
    reply = buildReply(intent, config);
  }

  const result = await sendWhatsAppText(from.replace(/^\+/, ''), reply);
  return json(res, 200, { ok: true, delivered: result, reply });
}
