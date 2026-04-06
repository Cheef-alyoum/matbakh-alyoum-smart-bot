import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'server.js',
  'config.app.json',
  'package.json',
  'render.yaml',
  'database/schema.sql',
  'database/seed_menu.sql',
  'data/menu.api_items.json',
  'data/meta_catalog.json',
  'data/delivery_zones.json',
  '.env.example',
  '.env.production.example',
  'src/utils/core.js',
  'src/services/menu.service.js',
  'src/services/delivery.service.js',
  'src/services/storage.service.js',
  'src/services/whatsapp.service.js',
  'src/services/meta-capi.service.js',
  'src/services/site.service.js',
  'src/services/supabase.service.js',
  'public/404.html'
];

const optionalPublicFiles = [
  'public/index.html',
  'public/menu.html',
  'public/order.html',
  'public/track.html'
];

const errors = [];
const warnings = [];

for (const file of requiredFiles) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    errors.push(`Missing required file: ${file}`);
  }
}

for (const file of optionalPublicFiles) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    warnings.push(`Optional public file not found (acceptable after separating website): ${file}`);
  }
}

const configPath = path.join(root, 'config.app.json');
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const checks = [
      ['app', config.app],
      ['business', config.business],
      ['timezone', config.timezone],
      ['site.baseUrl', config.site?.baseUrl],
      ['site.email', config.site?.email],
      ['directCallPhone', config.directCallPhone],
      ['orderWindow.start', config.orderWindow?.start],
      ['orderWindow.lastSameDayOrder', config.orderWindow?.lastSameDayOrder],
      ['orderWindow.lastDelivery', config.orderWindow?.lastDelivery],
      ['channels.website', config.channels?.website],
      ['channels.menu', config.channels?.menu],
      ['channels.order', config.channels?.order],
      ['channels.tracking', config.channels?.tracking]
    ];

    for (const [key, value] of checks) {
      if (!value) errors.push(`Missing config value: ${key}`);
    }

    if (!Array.isArray(config.deliveryTimeSlots) || config.deliveryTimeSlots.length === 0) {
      errors.push('deliveryTimeSlots must contain at least one slot');
    }

    if (!Array.isArray(config.adminPhones) || config.adminPhones.length === 0) {
      warnings.push('adminPhones is empty in config.app.json');
    }

    if (config.features?.publicWebsite !== false) {
      warnings.push('features.publicWebsite is not false; project now operates as bot backend with external website');
    }
  } catch (error) {
    errors.push(`config.app.json is not valid JSON: ${error.message}`);
  }
}

const menuPath = path.join(root, 'data/menu.api_items.json');
if (fs.existsSync(menuPath)) {
  try {
    const menu = JSON.parse(fs.readFileSync(menuPath, 'utf-8'));

    if (!Array.isArray(menu) || menu.length < 20) {
      errors.push('Menu dataset looks incomplete');
    } else {
      const first = menu[0] || {};
      const hasUsefulShape =
        'record_id' in first ||
        'display_name_ar' in first ||
        'item_name_ar' in first;

      if (!hasUsefulShape) {
        warnings.push('menu.api_items.json structure looks unusual');
      }
    }
  } catch (error) {
    errors.push(`data/menu.api_items.json is not valid JSON: ${error.message}`);
  }
}

const deliveryZonesPath = path.join(root, 'data/delivery_zones.json');
if (fs.existsSync(deliveryZonesPath)) {
  try {
    const zones = JSON.parse(fs.readFileSync(deliveryZonesPath, 'utf-8'));
    if (!Array.isArray(zones) || zones.length === 0) {
      errors.push('Delivery zones dataset is empty or invalid');
    }
  } catch (error) {
    errors.push(`data/delivery_zones.json is not valid JSON: ${error.message}`);
  }
}

if (warnings.length) {
  console.warn('Validation warnings:\n' + warnings.map(x => `- ${x}`).join('\n'));
}

if (errors.length) {
  console.error('Validation failed:\n' + errors.map(x => `- ${x}`).join('\n'));
  process.exit(1);
}

console.log('Validation passed. Bot backend structure and core config look correct.');
