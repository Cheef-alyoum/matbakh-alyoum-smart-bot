import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function toTrimmedString(value) {
  return value == null ? '' : String(value).trim();
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseTimeToMinutes(value, fallback = 0) {
  const raw = toTrimmedString(value);
  if (!raw) return fallback;

  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;

  return hours * 60 + minutes;
}

function normalizeListFromEnv(value) {
  return toTrimmedString(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function getCurrentTimeParts(timezone = 'Asia/Amman') {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const parts = formatter.formatToParts(new Date());
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));

    const year = Number(map.year || 0);
    const month = Number(map.month || 0);
    const day = Number(map.day || 0);
    const hour = Number(map.hour || 0);
    const minute = Number(map.minute || 0);

    return {
      year,
      month,
      day,
      hour,
      minute,
      totalMinutes: hour * 60 + minute
    };
  } catch {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
      totalMinutes: now.getHours() * 60 + now.getMinutes()
    };
  }
}

export function loadAppConfig(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  config.site = ensureObject(config.site);
  config.orderWindow = ensureObject(config.orderWindow);
  config.businessConfig = ensureObject(config.businessConfig);
  config.channels = ensureObject(config.channels);
  config.features = ensureObject(config.features);
  config.operations = ensureObject(config.operations);
  config.security = ensureObject(config.security);

  config.timezone = process.env.APP_TIMEZONE || config.timezone || 'Asia/Amman';

  config.site.baseUrl = process.env.BASE_URL || config.site.baseUrl || '';
  config.site.businessPhoneDisplay = process.env.DIRECT_CALL_PHONE || config.site.businessPhoneDisplay || '';
  config.site.businessPhoneIntl = process.env.DIRECT_CALL_PHONE_INTL || config.site.businessPhoneIntl || '';
  config.site.email = process.env.BUSINESS_EMAIL || config.site.email || '';

  config.orderWindow.start = process.env.ORDER_START || config.orderWindow.start || '10:00';
  config.orderWindow.lastSameDayOrder = process.env.LAST_SAME_DAY_ORDER || config.orderWindow.lastSameDayOrder || '17:30';
  config.orderWindow.lastDelivery = process.env.LAST_DELIVERY || config.orderWindow.lastDelivery || '18:30';

  if (process.env.DELIVERY_TIME_SLOTS) {
    const envSlots = normalizeListFromEnv(process.env.DELIVERY_TIME_SLOTS);
    if (envSlots.length) {
      config.deliveryTimeSlots = envSlots;
    }
  } else if (!Array.isArray(config.deliveryTimeSlots)) {
    config.deliveryTimeSlots = [];
  }

  if (process.env.WEBSITE_URL) {
    config.channels.website = process.env.WEBSITE_URL;
  }
  if (process.env.PUBLIC_MENU_URL) {
    config.channels.menu = process.env.PUBLIC_MENU_URL;
  }
  if (process.env.PUBLIC_ORDER_URL) {
    config.channels.order = process.env.PUBLIC_ORDER_URL;
  }
  if (process.env.PUBLIC_TRACKING_URL) {
    config.channels.tracking = process.env.PUBLIC_TRACKING_URL;
  }

  if (!config.channels.email && config.site.email) {
    config.channels.email = config.site.email;
  }

  if (!config.businessConfig.whatsappPrimary && config.site.businessPhoneIntl) {
    config.businessConfig.whatsappPrimary = config.site.businessPhoneIntl.replace(/^\+/, '');
  }

  if (!config.businessConfig.whatsappDisplay && config.site.businessPhoneDisplay) {
    config.businessConfig.whatsappDisplay = config.site.businessPhoneDisplay;
  }

  return config;
}

export function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function parseBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};

  const type = String(req.headers['content-type'] || '').toLowerCase();

  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }

  if (type.includes('application/x-www-form-urlencoded')) {
    try {
      return Object.fromEntries(new URLSearchParams(raw).entries());
    } catch {
      return { raw };
    }
  }

  return { raw };
}

export function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

export function text(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

export function sendFile(res, filePath, ext, noIndex = false) {
  const contentTypeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
  };

  const headers = {
    'Content-Type': contentTypeMap[ext] || 'application/octet-stream'
  };

  if (noIndex) {
    headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive';
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

export function normalizePhone(input = '') {
  const raw = String(input)
    .trim()
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/[^\d+]/g, '');

  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('962')) return `+${raw}`;
  if (raw.startsWith('0')) return `+962${raw.slice(1)}`;
  return raw;
}

export function slugify(input = '') {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\w\u0600-\u06FF-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

export function isWithinOrderWindow(config) {
  const safeConfig = ensureObject(config);
  const safeOrderWindow = ensureObject(safeConfig.orderWindow);
  const timezone = safeConfig.timezone || 'Asia/Amman';

  const currentMinutes = getCurrentTimeParts(timezone).totalMinutes;
  const openMinutes = parseTimeToMinutes(safeOrderWindow.start, 10 * 60);
  const closeMinutes = parseTimeToMinutes(safeOrderWindow.lastSameDayOrder, 17 * 60 + 30);

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

export function parseCookies(req) {
  const header = req?.headers?.cookie || '';
  if (!header) return {};

  const pairs = header
    .split(';')
    .map(part => part.trim())
    .filter(Boolean);

  const cookies = {};

  for (const part of pairs) {
    const index = part.indexOf('=');
    if (index <= 0) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1);

    if (!key) continue;

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}
