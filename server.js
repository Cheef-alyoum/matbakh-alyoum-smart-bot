import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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
import { sendMetaEvent, buildMetaRequestContext } from './src/services/meta-capi.service.js';
import { whatsappVerify, processWhatsAppWebhook } from './src/services/whatsapp.service.js';
import {
  createOrder,
  getOrderById,
  findOrdersByPhone,
  updateOrderStatus,
  createLead,
  generateNextOrderCode
} from './src/services/storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');
const appConfig = loadAppConfig(path.join(rootDir, 'config.app.json'));

function getOrderTotal(order = {}) {
  return Number(order.total_jod || order.totalJod || 0);
}

function getOrderDeliveryType(order = {}) {
  return order.delivery_type || order.deliveryType || undefined;
}

function getOrderPaymentMethod(order = {}) {
  return order.payment_method || order.paymentMethod || undefined;
}

async function safeSendMetaEvent(config, payload) {
  const result = await sendMetaEvent(config, payload);

  if (result?.skipped) {
    console.info('META_EVENT_SKIPPED', JSON.stringify({
      eventName: payload?.event_name,
      reason: result.reason,
      eventId: payload?.event_id,
      orderId: payload?.custom_data?.order_id,
      externalId: payload?.user_data?.external_id
    }));
    return result;
  }

  if (result?.ok === false) {
    console.error('META_EVENT_FAILED', JSON.stringify({
      eventName: payload?.event_name,
      status: result.status,
      error: result.error,
      response: result.data || null,
      eventId: payload?.event_id,
      orderId: payload?.custom_data?.order_id,
      externalId: payload?.user_data?.external_id
    }));
    return result;
  }

  console.info('META_EVENT_SENT', JSON.stringify({
    eventName: payload?.event_name,
    status: result?.status,
    eventId: payload?.event_id,
    orderId: payload?.custom_data?.order_id,
    externalId: payload?.user_data?.external_id
  }));

  return result;
}

const server = http.createServer(async (req, res) => {
  try {
    const safeHost = req?.headers?.host || process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000';
    const url = new URL(req?.url || '/', `http://${safeHost}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    if (pathname === '/api/webhooks/whatsapp') {
      console.info('HTTP_WEBHOOK_REQUEST', JSON.stringify({ method, pathname, time: new Date().toISOString() }));
    }

    if (pathname === '/api/status') {
      return json(res, 200, {
        ok: true,
        ...appConfig,
        api: {
          status: '/api/status',
          menu: '/api/menu',
          sections: '/api/menu/sections',
          search: '/api/menu/search?q=',
          order: '/api/orders',
          track: '/api/orders/track',
          lead: '/api/leads',
          deliveryZones: '/api/delivery/zones',
          whatsappWebhook: '/api/webhooks/whatsapp'
        }
      });
    }

    if (pathname === '/api/site/seo') {
      return json(res, 200, buildSeoConfig(appConfig));
    }

    if (pathname === '/api/site/homepage') {
      return json(res, 200, buildHomepageData(appConfig));
    }

    if (pathname === '/api/menu' && method === 'GET') {
      return json(res, 200, { ok: true, items: getMenuData(rootDir) });
    }

    if (pathname === '/api/menu/sections' && method === 'GET') {
      return json(res, 200, { ok: true, sections: getSections(rootDir), summary: getMenuSummary(rootDir) });
    }

    if (pathname === '/api/menu/search' && method === 'GET') {
      const q = url.searchParams.get('q') || '';
      return json(res, 200, { ok: true, q, items: searchMenu(rootDir, q) });
    }

    if (pathname === '/api/meta/catalog' && method === 'GET') {
      return json(res, 200, { ok: true, items: getMetaCatalog(rootDir) });
    }

    if (pathname === '/api/delivery/zones' && method === 'GET') {
      const zones = readJsonFile(path.join(rootDir, 'data', 'delivery_zones.json'), []);
      const groupedZones = readJsonFile(path.join(rootDir, 'data', 'delivery_zones_grouped.json'), []);
      return json(res, 200, { ok: true, zones, groupedZones });
    }

    if (pathname === '/api/leads' && method === 'POST') {
      const body = await parseBody(req);
      const metaContext = buildMetaRequestContext(req, body.meta, `${appConfig.site.baseUrl}/contact.html`);

      const lead = await createLead(rootDir, {
        id: randomUUID(),
        source: body.source || 'website',
        name: body.name || '',
        phone: normalizePhone(body.phone || ''),
        notes: body.notes || '',
        preferredChannel: body.preferredChannel || 'whatsapp',
        createdAt: new Date().toISOString()
      });

      await safeSendMetaEvent(appConfig, {
        event_name: 'Lead',
        action_source: 'website',
        event_source_url: metaContext.event_source_url || `${appConfig.site.baseUrl}/contact.html`,
        event_id: metaContext.event_id || `lead-${lead.id}`,
        user_data: {
          phone: lead.phone,
          email: body.email || '',
          external_id: lead.id,
          ...metaContext.user_data
        },
        custom_data: {
          content_name: 'website_lead',
          source: lead.source,
          preferred_channel: lead.preferred_channel || lead.preferredChannel || body.preferredChannel || 'whatsapp'
        }
      });

      return json(res, 201, { ok: true, lead, message: 'تم تسجيل طلب التواصل بنجاح.' });
    }

    if (pathname === '/api/orders' && method === 'POST') {
      const body = await parseBody(req);
      const metaContext = buildMetaRequestContext(req, body.meta, `${appConfig.site.baseUrl}/order.html`);
      const phone = normalizePhone(body.phone || '');
      const items = Array.isArray(body.items) ? body.items : [];
      const notes = body.notes || '';
      const deliverySlot = body.deliverySlot || '';
      const deliveryType = body.deliveryType || 'delivery';
      const address = body.address || '';
      const paymentMethod = body.paymentMethod || 'cash';
      const now = new Date().toISOString();
      const zone = body.deliveryZoneId ? getDeliveryZoneById(rootDir, body.deliveryZoneId) : null;
      const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotalJod || item.line_total_jod || item.total || 0), 0);
      const deliveryFee = deliveryType === 'pickup' ? 0 : Number(zone?.delivery_fee_jod || body.deliveryFeeJod || 0);

      const order = await createOrder(rootDir, {
        id: await generateNextOrderCode(rootDir),
        customerName: body.customerName || 'عميل مطبخ اليوم',
        phone,
        items,
        notes,
        address,
        deliveryDay: body.deliveryDay || '',
        deliverySlot,
        deliveryType,
        deliverySector: zone ? `${zone.zone_type} — ${zone.sector_or_governorate}` : body.deliverySector || '',
        deliveryZoneId: zone?.zone_id || body.deliveryZoneId || null,
        deliveryZoneName: zone?.zone_name_ar || body.deliveryZoneName || '',
        paymentMethod,
        status: 'awaiting_admin_review',
        statusLabelAr: 'بانتظار اعتماد الإدارة',
        subtotalJod: subtotal,
        deliveryFeeJod: deliveryFee,
        totalJod: subtotal + deliveryFee,
        createdAt: now,
        updatedAt: now
      });

      await safeSendMetaEvent(appConfig, {
        event_name: 'InitiateCheckout',
        action_source: 'website',
        event_source_url: metaContext.event_source_url || `${appConfig.site.baseUrl}/order.html`,
        event_id: metaContext.event_id || `checkout-${order.id}`,
        user_data: {
          phone,
          external_id: order.id,
          ...metaContext.user_data
        },
        custom_data: {
          currency: 'JOD',
          value: Number((subtotal + deliveryFee).toFixed(3)),
          content_name: 'order_submitted',
          content_category: 'kitchen_order',
          order_id: order.id,
          delivery_type: deliveryType,
          payment_method: paymentMethod,
          num_items: items.length
        }
      });

      return json(res, 201, {
        ok: true,
        order,
        policy: 'تم استلام طلبك بنجاح، وطلبك الآن قيد المعالجة. جارٍ تثبيت التفاصيل النهائية وإصدار التأكيد النهائي.',
        orderWindowOpen: isWithinOrderWindow(appConfig)
      });
    }

    if (pathname === '/api/orders/track' && method === 'GET') {
      const orderId = url.searchParams.get('orderId');
      const phone = normalizePhone(url.searchParams.get('phone') || '');

      if (orderId) {
        const order = await getOrderById(rootDir, orderId);
        return json(res, order ? 200 : 404, order ? { ok: true, order } : { ok: false, message: 'لم يتم العثور على الطلب.' });
      }

      if (phone) {
        const orders = await findOrdersByPhone(rootDir, phone);
        return json(res, 200, { ok: true, orders });
      }

      return json(res, 400, { ok: false, message: 'يرجى إرسال رقم الطلب أو رقم الهاتف.' });
    }

    if (pathname === '/api/orders/status' && method === 'POST') {
      const body = await parseBody(req);
      const updated = await updateOrderStatus(rootDir, body.orderId, body.status, body.statusLabelAr || body.status);

      if (!updated) {
        return json(res, 404, { ok: false, message: 'الطلب غير موجود.' });
      }

      if (['approved', 'delivered'].includes(body.status)) {
        const eventName = body.status === 'approved' ? 'QualifiedLead' : 'Purchase';

        await safeSendMetaEvent(appConfig, {
          event_name: eventName,
          action_source: 'system_generated',
          event_source_url: `${appConfig.site.baseUrl}/track.html`,
          event_id: `${eventName.toLowerCase()}-${updated.id}-${Date.now()}`,
          user_data: {
            phone: updated.phone,
            external_id: updated.id
          },
          custom_data: {
            order_id: updated.id,
            status: body.status,
            value: getOrderTotal(updated),
            currency: 'JOD',
            delivery_type: getOrderDeliveryType(updated),
            payment_method: getOrderPaymentMethod(updated)
          }
        });
      }

      return json(res, 200, { ok: true, order: updated });
    }

    if (pathname === '/api/webhooks/whatsapp' && method === 'GET') {
      return whatsappVerify(req, res);
    }

    if (pathname === '/api/webhooks/whatsapp' && method === 'POST') {
      return processWhatsAppWebhook(rootDir, req, res, appConfig);
    }

    if (pathname === '/api/meta/event' && method === 'POST') {
      const body = await parseBody(req);
      const result = await safeSendMetaEvent(appConfig, body);
      return json(res, 200, { ok: true, result });
    }

    if (pathname === '/healthz') {
      return json(res, 200, {
        ok: true,
        service: 'matbakh-alyoum-smart-bot',
        time: new Date().toISOString()
      });
    }

    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(publicDir)) {
      return text(res, 403, 'Forbidden');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const noIndex = filePath.includes(`${path.sep}admin${path.sep}`);
      return sendFile(res, filePath, ext, noIndex);
    }

    return sendFile(res, path.join(publicDir, '404.html'), '.html');
  } catch (error) {
    console.error(error);
    if (res && typeof res.writeHead === 'function') {
      return json(res, 500, {
        ok: false,
        message: 'حدث خطأ داخلي غير متوقع.',
        error: error.message
      });
    }
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Matbakh Al Youm server running on http://localhost:${port}`);
});
