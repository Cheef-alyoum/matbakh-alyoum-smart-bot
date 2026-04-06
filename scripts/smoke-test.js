import { spawn } from 'node:child_process';

const port = 4010;
const base = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ['server.js'], {
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'test',
    WEBSITE_URL: process.env.WEBSITE_URL || 'https://matbakh-alyoum.site',
    PUBLIC_MENU_URL: process.env.PUBLIC_MENU_URL || 'https://matbakh-alyoum.site/menu.html',
    PUBLIC_ORDER_URL: process.env.PUBLIC_ORDER_URL || 'https://matbakh-alyoum.site/order.html',
    PUBLIC_TRACKING_URL: process.env.PUBLIC_TRACKING_URL || 'https://matbakh-alyoum.site/track.html'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchResponse(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  return {
    status: res.status,
    body: text,
    headers: Object.fromEntries(res.headers.entries())
  };
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return true;
    } catch {
      // ignore during boot
    }
    await wait(250);
  }
  return false;
}

async function main() {
  server.stdout.on('data', chunk => process.stdout.write(chunk.toString()));
  server.stderr.on('data', chunk => process.stderr.write(chunk.toString()));

  const started = await waitForServer();

  if (!started) {
    server.kill('SIGTERM');
    console.error('Smoke test failed:\n- Server did not become ready on time');
    process.exit(1);
  }

  const checks = [
    { path: '/', expectStatus: 200, expectType: 'application/json' },
    { path: '/health', expectStatus: 200, expectType: 'application/json' },
    { path: '/healthz', expectStatus: 200, expectType: 'application/json' },
    { path: '/api/status', expectStatus: 200, expectType: 'application/json' },
    { path: '/api/site/seo', expectStatus: 200, expectType: 'application/json' },
    { path: '/api/site/homepage', expectStatus: 200, expectType: 'application/json' },
    { path: '/api/channels', expectStatus: 200, expectType: 'application/json' },
    { path: '/api/menu', expectStatus: 200, expectType: 'application/json' },
    { path: '/api/menu/sections', expectStatus: 200, expectType: 'application/json' },
    { path: '/api/menu/search?q=مقلوبة', expectStatus: 200, expectType: 'application/json' },
    { path: '/api/delivery/zones', expectStatus: 200, expectType: 'application/json' }
  ];

  const failures = [];

  for (const check of checks) {
    const result = await fetchResponse(`${base}${check.path}`);
    const contentType = result.headers['content-type'] || '';

    if (result.status !== check.expectStatus) {
      failures.push(`${check.path} returned HTTP ${result.status} instead of ${check.expectStatus}`);
      continue;
    }

    if (!contentType.includes(check.expectType)) {
      failures.push(`${check.path} content-type mismatch: expected ${check.expectType}, got ${contentType}`);
    }
  }

  const redirectChecks = [
    { path: '/menu.html', target: 'https://matbakh-alyoum.site/menu.html' },
    { path: '/order.html', target: 'https://matbakh-alyoum.site/order.html' },
    { path: '/track.html', target: 'https://matbakh-alyoum.site/track.html' }
  ];

  for (const check of redirectChecks) {
    const result = await fetchResponse(`${base}${check.path}`, { redirect: 'manual' });
    const location = result.headers.location || '';

    if (result.status < 300 || result.status >= 400) {
      failures.push(`${check.path} did not return a redirect, got HTTP ${result.status}`);
      continue;
    }

    if (location !== check.target) {
      failures.push(`${check.path} redirect mismatch: expected ${check.target}, got ${location || 'empty'}`);
    }
  }

  const leadPayload = {
    name: 'عميل اختبار',
    phone: '0779960015',
    source: 'smoke_test'
  };

  const leadResult = await fetchResponse(`${base}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(leadPayload)
  });

  if (leadResult.status !== 201) {
    failures.push(`/api/leads returned HTTP ${leadResult.status}`);
  }

  const orderPayload = {
    phone: '0779960015',
    customerName: 'عميل اختبار',
    deliveryType: 'pickup',
    paymentMethod: 'cash',
    deliveryDay: 'اليوم',
    deliverySlot: '12:30-14:00',
    items: [
      {
        id: 'SMOKE-ITEM-1',
        display_name_ar: 'صنف اختبار',
        quantity: 1,
        unit_ar: 'طلب',
        price_1_jod: 5,
        lineTotalJod: 5
      }
    ]
  };

  const orderResult = await fetchResponse(`${base}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(orderPayload)
  });

  if (orderResult.status !== 201) {
    failures.push(`/api/orders returned HTTP ${orderResult.status}`);
  } else {
    try {
      const parsed = JSON.parse(orderResult.body);
      const orderId = parsed?.order?.id;

      if (!orderId) {
        failures.push('/api/orders did not return order.id');
      } else {
        const trackResult = await fetchResponse(`${base}/api/orders/track?orderId=${encodeURIComponent(orderId)}`);
        if (trackResult.status !== 200) {
          failures.push(`/api/orders/track returned HTTP ${trackResult.status} for ${orderId}`);
        }
      }
    } catch (error) {
      failures.push(`/api/orders response is not valid JSON: ${error.message}`);
    }
  }

  server.kill('SIGTERM');

  if (failures.length) {
    console.error('Smoke test failed:\n' + failures.map(x => `- ${x}`).join('\n'));
    process.exit(1);
  }

  console.log('Smoke test passed. Bot backend routes and redirects responded correctly.');
}

main().catch(error => {
  server.kill('SIGTERM');
  console.error(error);
  process.exit(1);
});
