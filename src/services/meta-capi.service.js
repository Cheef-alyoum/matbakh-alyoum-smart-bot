import crypto from 'node:crypto';
import { sha256 } from '../utils/core.js';

const META_DISABLED_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

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

export function isMetaCrmEnabled() {
  const raw = String(process.env.META_CRM_ENABLED ?? 'true').trim().toLowerCase();
  return !META_DISABLED_VALUES.has(raw);
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

export async function sendMetaEvent(config, event = {}) {
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
        event_source_url: event.event_source_url || config?.site?.baseUrl,
        event_id: event.event_id || crypto.randomUUID(),
        user_data: normalizeUserData(event.user_data || {}),
        custom_data: pruneObject(event.custom_data || {})
      }
    ],
    test_event_code: cleanValue(process.env.META_TEST_EVENT_CODE)
  });

  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${pixelId}/events?access_token=${accessToken}`,
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
