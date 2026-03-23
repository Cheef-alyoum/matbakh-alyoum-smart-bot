import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function loadAppConfig(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.site.baseUrl = process.env.BASE_URL || config.site.baseUrl;
  config.site.businessPhoneDisplay = process.env.DIRECT_CALL_PHONE || config.site.businessPhoneDisplay;
  config.site.businessPhoneIntl = process.env.DIRECT_CALL_PHONE_INTL || config.site.businessPhoneIntl;
  config.site.email = process.env.BUSINESS_EMAIL || config.site.email;
  config.orderWindow.start = process.env.ORDER_START || config.orderWindow.start;
  config.orderWindow.lastSameDayOrder = process.env.LAST_SAME_DAY_ORDER || config.orderWindow.lastSameDayOrder;
  config.orderWindow.lastDelivery = process.env.LAST_DELIVERY || config.orderWindow.lastDelivery;
  if (process.env.DELIVERY_TIME_SLOTS) {
    config.deliveryTimeSlots = process.env.DELIVERY_TIME_SLOTS.split(',').map(x => x.trim()).filter(Boolean);
  }
  return config;
}

export function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};
  const type = req.headers['content-type'] || '';
  if (type.includes('application/json')) return JSON.parse(raw);
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
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
  if (noIndex) headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive';
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

export function normalizePhone(input = '') {
  const raw = String(input).trim().replace(/\s+/g, '').replace(/-/g, '');
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
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = config.orderWindow.start.split(':').map(Number);
  const [closeH, closeM] = config.orderWindow.lastSameDayOrder.split(':').map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}
