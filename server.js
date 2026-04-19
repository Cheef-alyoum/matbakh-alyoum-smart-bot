import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// استدعاء الوظائف الأساسية من الملفات الأخرى
import {
  loadAppConfig,
  isWithinOrderWindow,
  normalizePhone,
  json,
  text,
  sendFile,
  readJsonFile,
  parseBody
} from './src/utils/core.js';
import { getMenuData, getMenuSummary, getMetaCatalog, searchMenu, getSections } from './src/services/menu.service.js';
import { buildHomepageData, buildSeoConfig } from './src/services/site.service.js';
import { getDeliveryZoneById } from './src/services/delivery.service.js';
import { sendMetaEvent } from './src/services/meta-capi.service.js';
import { whatsappVerify, processWhatsAppWebhook } from './src/services/whatsapp.service.js';
import {
  createOrder,
  getOrderById,
  findOrdersByPhone,
  updateOrderStatus,
  createLead,
  generateNextOrderCode,
  getMarketingReport
} from './src/services/storage.service.js';

// إعداد المسارات الأساسية
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');

// تحميل الإعدادات ومفاتيح الأمان
const appConfig = loadAppConfig(path.join(rootDir, 'config.app.json'));
const adminApiToken = String(process.env.ADMIN_API_TOKEN || '').trim();

// الحالات المعتمدة للطلبات (State Machine)
const allowedOrderStatuses =
  Array.isArray(appConfig?.operations?.orderStatuses) && appConfig.operations.orderStatuses.length
    ? appConfig.operations.orderStatuses
    : [
        'awaiting_admin_review',
        'awaiting_customer_edit',
        'approved',
        'preparing',
        'ready',
        'out_for_delivery',
        'delivered',
        'rejected',
        'customer_exit'
      ];

// --- دوال المساعدة والحماية (Helpers & Security) ---

function sendSafe404(res) {
  const notFoundPath = path.join(publicDir, '404.html');
  try {
    if (fs.existsSync(notFoundPath)) {
      const html = fs.readFileSync(notFoundPath, 'utf8');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
  } catch (error) {
    console.error('404_PAGE_READ_ERROR', error);
  }
  
  // صفحة 404 افتراضية في حال غياب الملف لضمان عدم تعطل السيرفر
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(`
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>404 - الصفحة غير موجودة</title>
    <style>body{font-family:Arial;text-align:center;padding:50px;background:#faf7f2;color:#2b2b2b;}</style></head>
    <body><h2>عذراً، الصفحة غير موجودة.</h2><p>يرجى العودة للصفحة الرئيسية أو التواصل عبر واتساب.</p></body></html>
  `);
}

function getSafeHost(req) {
  return req?.headers?.host || process.env.RENDER_EXTERNAL_HOSTNAME || `0.0.0.0:${process.env.PORT || 10000}`;
}

function getBaseSiteUrl() {
  return process.env.WEBSITE_URL || appConfig?.channels?.website || appConfig?.site?.baseUrl || '';
}

function buildExternalUrl(targetPath = '/') {
  const baseUrl = getBaseSiteUrl();
  if (!baseUrl) return '';
  try {
    return new URL(targetPath, baseUrl).toString();
  } catch {
    return `${baseUrl.replace(/\/$/, '')}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
  }
}

function redirect(res, targetUrl, statusCode = 302) {
  res.writeHead(statusCode, { Location: targetUrl });
  res.end();
}

function getPublicChannels() {
  return {
    website: appConfig?.channels?.website || getBaseSiteUrl() || '',
    menu: appConfig?.channels?.menu || buildExternalUrl('/menu.html'),
    order: appConfig?.channels?.order || buildExternalUrl('/order.html'),
    tracking: appConfig?.channels?.tracking || buildExternalUrl('/track.html'),
    whatsappClick: appConfig?.channels?.whatsappClick || '',
    facebook: appConfig?.channels?.facebook || '',
    instagram: appConfig?.channels?.instagram || '',
    snapchat: appConfig?.channels?.snapchat || '',
    youtubeHandle: appConfig?.channels?.youtubeHandle || '',
    email: appConfig?.channels?.email || appConfig?.site?.email || ''
  };
}

function getRequestClientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').trim();
  if (forwarded) return forwarded.split(',')[0].trim();
  return String(req?.headers?.['cf-connecting-ip'] || req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || '').replace(/^::ffff:/, '').trim();
}

// تجهيز بيانات ميتا بكفاءة عالية للتتبع الدقيق
function normalizeMetaPayload(rawMeta = {}, req) {
  const meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? rawMeta : {};
  return {
    landingPage: String(meta.landingPage || '').trim() || undefined,
    eventSourceUrl: String(meta.eventSourceUrl || '').trim() || undefined,
    fbc: String(meta.fbc || '').trim() || undefined,
    fbp: String(meta.fbp || '').trim() || undefined,
    fbclid: String(meta.fbclid || '').trim() || undefined,
    utmSource: String(meta.utmSource || meta.utm_source || '').trim() || undefined,
    utmMedium: String(meta.utmMedium || meta.utm_medium || '').trim() || undefined,
    utmCampaign: String(meta.utmCampaign || meta.utm_campaign || '').trim() || undefined,
    platformHint: String(meta.platformHint || meta.platform_hint || '').trim() || (meta.utmSource || (meta.fbclid || meta.fbc ? 'meta' : undefined)),
    client_ip_address: getRequestClientIp(req) || undefined,
    client_user_agent: String(req?.headers?.['user-agent'] || '').trim() || undefined
  };
}

function getAdminAuthState(req) {
  if (!adminApiToken) return { ok: true, enforced: false };
  const receivedToken = String(req?.headers?.['x-admin-token'] || req?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return { ok: receivedToken === adminApiToken, enforced: true };
}

// --- الخادم الأساسي (The Core Server) ---

const server = http.createServer(async (req, res) => {
  try {
    const safeHost = getSafeHost(req);
    const url = new URL(req?.url || '/', `http://${safeHost}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';
    const channels = getPublicChannels();

    // تسجيل سريع لطلبات الواتساب الواردة
    if (pathname === '/api/webhooks/whatsapp') {
      console.info('HTTP_WEBHOOK_REQUEST', JSON.stringify({ method, time: new Date().toISOString() }));
    }

    // نقطة فحص صحة الخادم (Health Check)
    if (pathname === '/health' || pathname === '/healthz') {
      return json(res, 200, { ok: true, service: 'matbakh-alyoum-smart-bot', status: 'healthy', uptime_seconds: Math.round(process.uptime()) });
    }

    // توجيه الروابط العامة إلى القنوات المخصصة
    if (method === 'GET' && ['/menu.html', '/order.html', '/track.html'].includes(pathname)) {
      const mappedTarget = pathname === '/menu.html' ? channels.menu : pathname === '/order.html' ? channels.order : channels.tracking;
      if (mappedTarget) return redirect(res, mappedTarget, 302);
    }

    // ------------------------------------------------------------------
    // مسارات الواتساب وميتا (العصب الرئيسي للمبيعات)
    // ------------------------------------------------------------------

    // 1. استقبال الويب هوك من ميتا للتحقق
    if (pathname === '/api/webhooks/whatsapp' && method === 'GET') {
      return whatsappVerify(req, res);
    }

    // 2. معالجة الرسائل الواردة من العملاء عبر واتساب
    if (pathname === '/api/webhooks/whatsapp' && method === 'POST') {
      return processWhatsAppWebhook(rootDir, req, res, appConfig);
    }

    // 3. تحديث حالة الطلبات وإرسال إشارات للمبيعات لـ Meta CAPI
    if (pathname === '/api/orders/status' && method === 'POST') {
      const authState = getAdminAuthState(req);
      if (!authState.ok) return json(res, 401, { ok: false, message: 'غير مصرح لك بتحديث حالة الطلب.' });

      const body = await parseBody(req);
      const { orderId, status } = body;
      
      if (!allowedOrderStatuses.includes(status)) {
          return json(res, 400, { ok: false, message: 'حالة الطلب غير معتمدة.' });
      }

      const updated = await updateOrderStatus(rootDir, orderId, status, body.statusLabelAr || status, {
        approvedByPhone: body.approvedByPhone || body.adminPhone,
        approvedAt: body.approvedAt,
        adminNotes: body.adminNotes
      });

      if (!updated) return json(res, 404, { ok: false, message: 'الطلب غير موجود.' });

      // تفعيل التسويق العكسي: إرسال أحداث "موافقة" أو "تسليم" إلى ميتا
      if (['approved', 'delivered'].includes(status)) {
        const isApproved = status === 'approved';
        const statusMeta = normalizeMetaPayload(updated.meta || body.meta || {}, req);

        await sendMetaEvent(appConfig, {
          event_name: isApproved ? 'QualifiedLead' : 'Purchase',
          action_source: 'system_generated',
          event_source_url: statusMeta.eventSourceUrl || buildExternalUrl('/track.html'),
          event_id: `${status}-${updated.id}`,
          user_data: {
            phone: updated.phone,
            external_id: updated.id,
            fbc: statusMeta.fbc,
            fbp: statusMeta.fbp,
            client_ip_address: statusMeta.client_ip_address,
            client_user_agent: statusMeta.client_user_agent
          },
          custom_data: {
            currency: 'JOD',
            value: Number(updated.totalJod || updated.total_jod || 0) || undefined,
            content_name: isApproved ? 'order_approved' : 'order_delivered',
            content_category: 'kitchen_order',
            order_id: updated.id,
            crm_stage: isApproved ? 'qualified' : 'delivered'
          }
        });
      }

      return json(res, 200, { ok: true, order: updated });
    }

    // ------------------------------------------------------------------
    // تقديم الملفات الثابتة (Static Files) كاحتياطي
    // ------------------------------------------------------------------
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(publicDir)) return text(res, 403, 'Forbidden');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    
    if (fs.existsSync(filePath)) {
      const ext =
