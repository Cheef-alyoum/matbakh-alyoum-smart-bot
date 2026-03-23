import { spawn } from 'node:child_process';

const port = 4010;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe']
});

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { status: res.status, body: text, headers: Object.fromEntries(res.headers.entries()) };
}

async function main() {
  let started = false;
  server.stdout.on('data', chunk => {
    const text = chunk.toString();
    if (text.includes('Matbakh Al Youm server running')) started = true;
    process.stdout.write(text);
  });
  server.stderr.on('data', chunk => process.stderr.write(chunk.toString()));

  for (let i = 0; i < 40; i += 1) {
    if (started) break;
    await wait(250);
  }

  const checks = [
    ['/', 'text/html'],
    ['/api/status', 'application/json'],
    ['/api/menu/sections', 'application/json'],
    ['/menu.html', 'text/html'],
    ['/order.html', 'text/html'],
    ['/track.html', 'text/html'],
    ['/healthz', 'application/json']
  ];

  const failures = [];
  for (const [pathname, expectedType] of checks) {
    const result = await fetchJson(`${base}${pathname}`);
    const contentType = result.headers['content-type'] || '';
    if (result.status < 200 || result.status >= 400) {
      failures.push(`${pathname} returned HTTP ${result.status}`);
      continue;
    }
    if (!contentType.includes(expectedType)) {
      failures.push(`${pathname} content-type mismatch: expected ${expectedType}, got ${contentType}`);
    }
  }

  server.kill('SIGTERM');

  if (failures.length) {
    console.error('Smoke test failed:\n' + failures.map(x => `- ${x}`).join('\n'));
    process.exit(1);
  }

  console.log('Smoke test passed. Core routes responded correctly.');
}

main().catch(error => {
  server.kill('SIGTERM');
  console.error(error);
  process.exit(1);
});
