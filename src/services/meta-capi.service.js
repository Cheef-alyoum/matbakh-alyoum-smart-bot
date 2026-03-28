import crypto from 'node:crypto';
import { sha256 } from '../utils/core.js';

const META_DISABLED_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);
const DEFAULT_GRAPH_API_VERSION = 'v25.0';
const DEFAULT_BASE_URL = 'https://matbakh-alyoum.site';

const ORDER_STATUS_EVENT_MAP = {
  approved: {
    eventName: 'QualifiedLead',
    contentName: 'order_approved',
    crmStage: 'qualified'
  },
  delivered: {
    eventName: 'Purchase',
    contentName: 'order_delivered',
    crmStage: 'delivered'
  }
};

function cleanValue(value) {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function cleanEmail(value) {
  const normalized = cleanValue(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

function normalizePhoneSafe(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  let normalized = raw.replace(/[^\d+]/g, '');

  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  }

  if (!normalized.startsWith('+') && normalized.startsWith('962')) {
    normalized = `+${normalized}`;
  }

  if (!normalized.startsWith('+') && normalized.startsWith('0')) {
    normalized = `+962${normalized.slice(1)}`;
  }

  return normalized;
}

function pruneObject(value) {
  if (Array.isArray(value)) {
    const items = value
      .map(item => pruneObject(item))
      .filter(item => item !== undefined && item !== null && item !== '');
    return items.length ? items : undefined;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, pruneObject(item)])
      .filter(([, item]) => {
        if (item === undefined || item === null || item === '') return false;
        if (Array.isArray(item) && item.length === 0) return false;
        if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) return false;
        return true;
      });

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  return value;
}

function resolveClientIp(req) {
  if (!req?.headers) return undefined;

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0]?.trim();
    if (first) return first.replace(/^::ffff:/, '');
  }

  const direct = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'];
  if (direct) return String(direct).trim().replace(/^::ffff:/, '');

  return req.socket?.remoteAddress
    ? String(req.socket.remoteAddress).replace(/^::ffff:/, '')
    : undefined;
}

function normalizeUserData(userData = {}) {
  const phone = normalizePhoneSafe(userData.phone);
  const email = cleanEmail(userData.email);
  const externalId = cleanValue(userData.external_id || userData.externalId);
  const clientIpAddress = cleanValue(userData.client_ip_address || userData.clientIpAddress);
  const clientUserAgent = cleanValue(userData.client_user_agent || userData.clientUserAgent);
  const fbp = cleanValue(userData.fbp);
  const fbclid = cleanValue(userData.fbclid);
  let fbc = cleanValue(userData.fbc);

  if (!fbc && fbclid) {
    fbc = `fb.1.${Date.now()}.${fbclid}`;
  }

  return pruneObject({
    ph: phone ? [sha256(phone)] : undefined,
    em: email ? [sha256(email)] : undefined,
    external_id: externalId ? [sha256(externalId)] : undefined,
    client_ip_address: clientIpAddress,
    client_user_agent: clientUserAgent,
    fbp,
    fbc
  }) || {};
}

function getGraphApiVersion() {
  return cleanValue(process.env.META_GRAPH_API_VERSION) || DEFAULT_GRAPH_API_VERSION;
}

function getOrderValue(order = {}) {
  return Number(order.totalJod ?? order.total_jod ?? 0) || 0;
}

function getOrderId(order = {}) {
  return cleanValue(order.id || order.order_id);
}

function getOrderPhone(order = {}) {
  return normalizePhoneSafe(order.phone);
}

function getOrderDeliveryType(order = {}) {
  return cleanValue(order.deliveryType || order.delivery_type);
}

function getOrderPaymentMethod(order = {}) {
  return cleanValue(order.paymentMethod || order.payment_method);
}

function getLeadId(lead = {}) {
  return cleanValue(lead.id || lead.lead_id);
}

function getLeadPhone(lead = {}) {
  return normalizePhoneSafe(lead.phone);
}

function getLeadEmail(lead = {}) {
  return cleanEmail(lead.email);
}

export function isMetaCrmEnabled() {
  const raw = String(process.env.META_CRM_ENABLED ?? 'true').trim().toLowerCase();
  return !META_DISABLED_VALUES.has(raw);
}

export function getMetaBaseUrl(config = {}) {
  return cleanValue(process.env.BASE_URL) || cleanValue(config?.site?.baseUrl) || DEFAULT_BASE_URL;
}

export function getMetaCrmDiagnostics() {
  const pixelId = cleanValue(process.env.META_PIXEL_ID);
  const accessToken = cleanValue(process.env.META_ACCESS_TOKEN);
  const testEventCode = cleanValue(process.env.META_TEST_EVENT_CODE);

  return {
    enabled: isMetaCrmEnabled(),
    configured: Boolean(pixelId && accessToken),
    pixelIdConfigured: Boolean(pixelId),
    accessTokenConfigured: Boolean(accessToken),
    testEventCodeConfigured: Boolean(testEventCode),
    graphApiVersion: getGraphApiVersion()
  };
}

export function buildMetaRequestContext(req, rawMeta = {}, fallbackUrl = '') {
  const meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? rawMeta : {};

  return {
    event_id: cleanValue(meta.eventId || meta.event_id),
    event_source_url: cleanValue(meta.eventSourceUrl || meta.event_source_url) || cleanValue(fallbackUrl),
    user_data: pruneObject({
      client_ip_address: resolveClientIp(req),
      client_user_agent: cleanValue(req?.headers?.['user-agent']),
      fbp: cleanValue(meta.fbp),
      fbc: cleanValue(meta.fbc),
      fbclid: cleanValue(meta.fbclid),
      external_id: cleanValue(meta.externalId || meta.external_id)
    }) || {}
  };
}

export function createLeadMetaEvent(config, {
  lead = {},
  userData = {},
  eventId,
  eventSourceUrl,
  source = 'website',
  preferredChannel = 'whatsapp',
  customData = {}
} = {}) {
  return pruneObject({
    event_name: 'Lead',
    action_source: 'website',
    event_source_url: cleanValue(eventSourceUrl) || `${getMetaBaseUrl(config)}/contact.html`,
    event_id: cleanValue(eventId) || `lead-${getLeadId(lead) || crypto.randomUUID()}`,
    user_data: pruneObject({
      phone: getLeadPhone(lead),
      email: getLeadEmail(lead),
      external_id: getLeadId(lead),
      ...userData
    }) || {},
    custom_data: pruneObject({
      content_name: 'website_lead',
      content_category: 'lead',
      lead_id: getLeadId(lead),
      lead_source: cleanValue(source) || 'website',
      preferred_channel: cleanValue(preferredChannel) || 'whatsapp',
      crm_stage: 'new',
      ...customData
    }) || {}
  }) || {};
}

export function createOrderCheckoutMetaEvent(config, {
  order = {},
  userData = {},
  eventId,
  eventSourceUrl,
  source = 'website',
  customData = {}
} = {}) {
  return pruneObject({
    event_name: 'InitiateCheckout',
    action_source: 'website',
    event_source_url: cleanValue(eventSourceUrl) || `${getMetaBaseUrl(config)}/order.html`,
    event_id: cleanValue(eventId) || `checkout-${getOrderId(order) || crypto.randomUUID()}`,
    user_data: pruneObject({
      phone: getOrderPhone(order),
      external_id: getOrderId(order),
      ...userData
    }) || {},
    custom_data: pruneObject({
      currency: 'JOD',
      value: Number(getOrderValue(order).toFixed(3)),
      content_name: 'order_submitted',
      content_category: 'kitchen_order',
      order_id: getOrderId(order),
      delivery_type: getOrderDeliveryType(order),
      payment_method: getOrderPaymentMethod(order),
      num_items: Array.isArray(order.items) ? order.items.length : undefined,
      crm_stage: 'new',
      order_source: cleanValue(source) || 'website',
      ...customData
    }) || {}
  }) || {};
}

export function createOrderStatusMetaEvent(config, {
  order = {},
  status,
  userData = {},
  eventId,
  eventSourceUrl,
  actionSource = 'system_generated',
  customData = {}
} = {}) {
  const normalizedStatus = String(status || order.status || '').trim();
  const mapping = ORDER_STATUS_EVENT_MAP[normalizedStatus];

  if (!mapping) return null;

  return pruneObject({
    event_name: mapping.eventName,
    action_source: actionSource,
    event_source_url: cleanValue(eventSourceUrl) || `${getMetaBaseUrl(config)}/track.html`,
    event_id: cleanValue(eventId) || `${mapping.eventName.toLowerCase()}-${getOrderId(order) || crypto.randomUUID()}`,
    user_data: pruneObject({
      phone: getOrderPhone(order),
      external_id: getOrderId(order),
      ...userData
    }) || {},
    custom_data: pruneObject({
      order_id: getOrderId(order),
      status: normalizedStatus,
      crm_stage: mapping.crmStage,
      value: Number(getOrderValue(order).toFixed(3)),
      currency: 'JOD',
      delivery_type: getOrderDeliveryType(order),
      payment_method: getOrderPaymentMethod(order),
      content_name: mapping.contentName,
      content_category: 'kitchen_order',
      ...customData
    }) || {}
  }) || {};
}

export async function trackLeadCreated(config, payload = {}) {
  return sendMetaEvent(config, createLeadMetaEvent(config, payload));
}

export async function trackOrderCreated(config, payload = {}) {
  return sendMetaEvent(config, createOrderCheckoutMetaEvent(config, payload));
}

export async function trackOrderStatusChanged(config, payload = {}) {
  const event = createOrderStatusMetaEvent(config, payload);

  if (!event) {
    return {
      skipped: true,
      reason: `STATUS_NOT_TRACKED:${payload?.status || payload?.order?.status || 'unknown'}`
    };
  }

  return sendMetaEvent(config, event);
}

export async function sendMetaEvent(config, event = {}) {
  if (!event || typeof event !== 'object' || Object.keys(event).length === 0) {
    return { skipped: true, reason: 'EMPTY_EVENT' };
  }

  if (!isMetaCrmEnabled()) {
    return { skipped: true, reason: 'META_CRM_ENABLED=false' };
  }

  const pixelId = cleanValue(process.env.META_PIXEL_ID);
  const accessToken = cleanValue(process.env.META_ACCESS_TOKEN);

  if (!pixelId || !accessToken) {
    return { skipped: true, reason: 'META_PIXEL_ID أو META_ACCESS_TOKEN غير مضبوطين.' };
  }

  const payload = pruneObject({
    data: [
      {
        event_name: event.event_name || 'PageView',
        event_time: Number(event.event_time || Math.floor(Date.now() / 1000)),
        action_source: event.action_source || 'website',
        event_source_url: event.event_source_url || getMetaBaseUrl(config),
        event_id: event.event_id || crypto.randomUUID(),
        user_data: normalizeUserData(event.user_data || {}),
        custom_data: pruneObject(event.custom_data || {})
      }
    ],
    test_event_code: cleanValue(process.env.META_TEST_EVENT_CODE)
  });

  try {
    const response = await fetch(
      `https://graph.facebook.com/${getGraphApiVersion()}/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json().catch(() => ({}));

    return {
      ok: response.ok,
      status: response.status,
      data,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.message,
      payload
    };
  }
}
