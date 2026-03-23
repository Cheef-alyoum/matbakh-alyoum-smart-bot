import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'server.js',
  'config.app.json',
  'package.json',
  'render.yaml',
  'public/index.html',
  'public/menu.html',
  'public/order.html',
  'public/track.html',
  'database/schema.sql',
  'database/seed_menu.sql',
  'data/menu.api_items.json',
  'data/meta_catalog.json',
  '.env.example',
  '.env.production.example'
];

const errors = [];
for (const file of requiredFiles) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) errors.push(`Missing required file: ${file}`);
}

const configPath = path.join(root, 'config.app.json');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const checks = [
    ['app', config.app],
    ['timezone', config.timezone],
    ['site.baseUrl', config.site?.baseUrl],
    ['site.email', config.site?.email],
    ['directCallPhone', config.directCallPhone],
    ['orderWindow.start', config.orderWindow?.start],
    ['orderWindow.lastSameDayOrder', config.orderWindow?.lastSameDayOrder],
    ['orderWindow.lastDelivery', config.orderWindow?.lastDelivery]
  ];
  for (const [key, value] of checks) {
    if (!value) errors.push(`Missing config value: ${key}`);
  }

  if (!Array.isArray(config.deliveryTimeSlots) || config.deliveryTimeSlots.length === 0) {
    errors.push('deliveryTimeSlots must contain at least one slot');
  }
}

const menuPath = path.join(root, 'data/menu.api_items.json');
if (fs.existsSync(menuPath)) {
  const menu = JSON.parse(fs.readFileSync(menuPath, 'utf-8'));
  if (!Array.isArray(menu) || menu.length < 50) {
    errors.push('Menu dataset looks incomplete');
  }
}

if (errors.length) {
  console.error('Validation failed:\n' + errors.map(x => `- ${x}`).join('\n'));
  process.exit(1);
}

console.log('Validation passed. Project structure and core config look correct.');
