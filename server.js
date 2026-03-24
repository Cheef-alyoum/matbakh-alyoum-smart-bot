import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadAppConfig, isWithinOrderWindow, normalizePhone, json, text, sendFile, readJsonFile, writeJsonFile, parseBody, parseCookies } from './src/utils/core.js';
import { getMenuData, getMenuSummary, getMetaCatalog, searchMenu, getSections } from './src/services/menu.service.js';
import { buildHomepageData, buildSeoConfig } from './src/services/site.service.js';
import { getDeliveryZoneById } from './src/services/delivery.service.js';
import { sendMetaEvent } from './src/services/meta-capi.service.js';
import { whatsappVerify, processWhatsAppWebhook } from './src/services/whatsapp.service.js';
import { createOrder, getOrderById, findOrdersByPhone, updateOrderStatus, createLead, generateNextOrderCode } from './src/services/storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');
const appConfig = loadAppConfig(path.join(rootDir, 'config.app.json'));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

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
      const lead = await createLead(rootDir, {
        id: randomUUID(),
        source: body.source || 'website',
        name: body.name || '',
        phone: normalizePhone(body.phone || ''),
        notes: body.notes || '',
        preferredChannel: body.preferredChannel || 'whatsapp',
        createdAt: new Date().toISOString()
      });

      await sendMetaEvent(appConfig, {
        event_name: 'Lead',
        action_source: 'website',
        event_source_url: `${appConfig.site.baseUrl}/contact.html`,
        user_data: {
          phone: lead.phone
        },
        custom_data: {
          content_name: 'website_lead',
          source: lead.source
        }
      });

      return json(res, 201, { ok: true, lead, message: 'تم تسجيل طلب التواصل بنجاح.' });
    }

    if (pathname === '/api/orders' && method === 'POST') {
      const body = await parseBody(req);
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

      await sendMetaEvent(appConfig, {
        event_name: 'InitiateCheckout',
        action_source: 'website',
        event_source_url: `${appConfig.site.baseUrl}/order.html`,
        user_data: {
          phone
        },
        custom_data: {
          currency: 'JOD',
          content_name: 'order_submitted',
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
        await sendMetaEvent(appConfig, {
          event_name: body.status === 'approved' ? 'QualifiedLead' : 'Purchase',
          action_source: 'system_generated',
          custom_data: {
            order_id: updated.id,
            status: body.status
          },
          user_data: {
            phone: updated.phone
          }
        });
      }

      return json(res, 200, { ok: true, order: updated });
    }

    if (pathname === '/api/webhooks/whatsapp' && method === 'GET') {
      return whatsappVerify(req, res);
    }

    if (pathname === '/api/webhooks/whatsapp' && method === 'POST') {
      return processWhatsAppWebhook(req, res, appConfig, rootDir);
    }

    if (pathname === '/api/meta/event' && method === 'POST') {
      const body = await parseBody(req);
      const result = await sendMetaEvent(appConfig, body);
      return json(res, 200, { ok: true, result });
    }

    // Redirect old root-json expectations to human homepage while keeping status endpoint public.
    if (pathname === '/healthz') {
      return json(res, 200, { ok: true, service: 'matbakh-alyoum-smart-bot', time: new Date().toISOString() });
    }

    // Static files
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
    return json(res, 500, { ok: false, message: 'حدث خطأ داخلي غير متوقع.', error: error.message });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Matbakh Al Youm server running on http://localhost:${port}`);
});
