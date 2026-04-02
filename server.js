import http from "node:http";
import { promises as fsp, createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 10000);
const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN ||
  process.env.VERIFY_TOKEN ||
  "matbakh-alyoum-verify-token";

const APP_NAME = "Matbakh Al Youm Smart Bot";
const BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${PORT}`;

const STATIC_DIR_CANDIDATES = [
  path.join(__dirname, "public"),
  path.join(__dirname, "site"),
  __dirname
];

const BLOCKED_STATIC_FILES = new Set([
  "server.js",
  "package.json",
  "package-lock.json",
  ".env",
  ".env.local",
  ".gitignore",
  "render.yaml"
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function log(...args) {
  console.log(new Date().toISOString(), "-", ...args);
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function normalizeUrlPath(urlPath) {
  try {
    return decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return urlPath.split("?")[0];
  }
}

function isSafeRelativePath(relPath) {
  return !relPath.includes("\0") && !relPath.split("/").includes("..");
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function getFirstExistingFile(candidates) {
  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        if (statSync(filePath).isFile()) return filePath;
      } catch {}
    }
  }
  return null;
}

function getDefaultHtml() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FoodEstablishment",
    name: "مطبخ اليوم المركزي",
    alternateName: "Matbakh Al Youm",
    url: BASE_URL,
    image: `${BASE_URL}/og-image.jpg`,
    email: "info@matbakh-alyoum.site",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Amman",
      addressCountry: "JO",
      streetAddress: "أم السماق"
    },
    areaServed: "Amman",
    servesCuisine: ["Jordanian", "Middle Eastern", "Home Style Cooking"],
    sameAs: [
      "https://www.facebook.com/MatbakhAlYoum",
      "https://www.instagram.com/matbakhalyoum",
      "https://www.snapchat.com/add/matbakhalyoum"
    ]
  };

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>مطبخ اليوم المركزي | أكلات بيتية وتوصيل في عمّان</title>
  <meta name="description" content="مطبخ اليوم المركزي في عمّان. أكلات بيتية محلية، جاهز للطبخ، مفرزات ومبردات، وتوصيل منزلي سريع." />
  <meta name="robots" content="index,follow" />
  <meta property="og:title" content="مطبخ اليوم المركزي" />
  <meta property="og:description" content="أكلات بيتية محلية بجودة عالية وخدمة احترافية وتوصيل سريع داخل عمّان." />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${BASE_URL}" />
  <meta property="og:image" content="${BASE_URL}/og-image.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
  <style>
    :root{
      --bg:#0f172a;
      --card:#111827;
      --soft:#1f2937;
      --text:#f8fafc;
      --muted:#cbd5e1;
      --brand:#f59e0b;
      --brand2:#f97316;
      --line:rgba(255,255,255,.08);
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:Tahoma,Arial,sans-serif;
      background:linear-gradient(180deg,#0b1220 0%,#111827 100%);
      color:var(--text);
      line-height:1.8;
    }
    .wrap{max-width:1200px;margin:auto;padding:24px}
    .hero{
      padding:56px 24px;
      border:1px solid var(--line);
      background:linear-gradient(135deg,rgba(245,158,11,.16),rgba(249,115,22,.08),rgba(255,255,255,.03));
      border-radius:24px;
      margin-top:20px;
      box-shadow:0 20px 60px rgba(0,0,0,.25);
    }
    h1,h2,h3{margin:0 0 12px}
    h1{font-size:clamp(32px,4vw,54px);line-height:1.2}
    p{margin:0 0 14px;color:var(--muted)}
    .badge{
      display:inline-block;
      padding:8px 14px;
      border-radius:999px;
      background:rgba(245,158,11,.16);
      color:#fde68a;
      border:1px solid rgba(245,158,11,.28);
      margin-bottom:16px;
      font-size:14px;
    }
    .actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
    .btn{
      display:inline-block;
      text-decoration:none;
      color:#111827;
      background:linear-gradient(135deg,var(--brand),var(--brand2));
      padding:14px 20px;
      border-radius:14px;
      font-weight:700;
    }
    .btn.alt{
      background:transparent;
      color:var(--text);
      border:1px solid var(--line);
    }
    .grid{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(240px,1fr));
      gap:16px;
      margin-top:24px;
    }
    .card{
      background:rgba(255,255,255,.03);
      border:1px solid var(--line);
      border-radius:20px;
      padding:20px;
    }
    .section{margin-top:28px}
    .footer{
      margin:40px 0 10px;
      padding:20px 0;
      border-top:1px solid var(--line);
      color:var(--muted);
      font-size:14px;
    }
    a{color:inherit}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="badge">مطبخ اليوم المركزي • عمّان • أم السماق</div>
      <h1>أكلات بيتية محلية بطعم أصيل وخدمة احترافية</h1>
      <p>نقدّم لكم في مطبخ اليوم أصناف الطبخ المنزلي، الجاهز للطبخ، والمفرز والمبرد، مع خدمة توصيل منزلي سريع داخل عمّان.</p>
      <div class="actions">
        <a class="btn" href="https://wa.me/" target="_blank" rel="noopener noreferrer">اطلب عبر واتساب</a>
        <a class="btn alt" href="https://www.matbakh-alyoum.site" target="_blank" rel="noopener noreferrer">الموقع الرسمي</a>
      </div>
    </section>

    <section class="section grid">
      <div class="card">
        <h3>طبخ يومي ومناسبات</h3>
        <p>أطباق بيتية محلية بجودة عالية وتفاصيل إعداد مدروسة تناسب الطلبات اليومية والعائلية.</p>
      </div>
      <div class="card">
        <h3>جاهز للطبخ</h3>
        <p>خيارات عملية تمكّن العميل من الحصول على نفس الجودة مع مرونة التحضير حسب الحاجة.</p>
      </div>
      <div class="card">
        <h3>مفرزات ومبردات</h3>
        <p>حلول حفظ وتخزين مناسبة لاحتياجات الأسرة مع المحافظة على الطعم والجودة.</p>
      </div>
      <div class="card">
        <h3>توصيل سريع</h3>
        <p>تنسيق دقيق للطلبات والتغليف والتوصيل لضمان وصول الطلب بشكل مرتب وآمن.</p>
      </div>
    </section>

    <section class="section card">
      <h2>حالة النظام</h2>
      <p>الخادم يعمل بنجاح. هذا الإصدار يتضمن:</p>
      <p>• صفحة عامة افتراضية عند عدم وجود ملفات الموقع</p>
      <p>• نقاط فحص للصحة والتشغيل</p>
      <p>• دعم Webhook الخاص بـ WhatsApp/Meta</p>
      <p>• دعم خدمة الملفات الثابتة إذا كانت موجودة داخل مجلد <strong>public</strong></p>
    </section>

    <div class="footer">
      © ${new Date().getFullYear()} مطبخ اليوم المركزي — تشغيل ذكي للموقع والبوت وWebhook على Render.
    </div>
  </div>
</body>
</html>`;
}

function getRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
}

function getSitemapXml() {
  const now = new Date().toISOString();
  const urls = ["/", "/about", "/menu", "/privacy", "/contact"].map((u) => `
  <url>
    <loc>${BASE_URL}${u}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${u === "/" ? "1.0" : "0.8"}</priority>
  </url>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

async function parseRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  if (!raw) return { raw: "", json: null };

  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}

function getStaticFilePath(urlPath) {
  let relPath = normalizeUrlPath(urlPath);

  if (relPath === "/") relPath = "/index.html";

  const cleanRelative = relPath.replace(/^\/+/, "");
  if (!isSafeRelativePath(cleanRelative)) return null;
  if (BLOCKED_STATIC_FILES.has(path.basename(cleanRelative))) return null;

  const candidates = [];
  for (const baseDir of STATIC_DIR_CANDIDATES) {
    candidates.push(path.join(baseDir, cleanRelative));
  }

  return getFirstExistingFile(candidates);
}

async function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = getContentType(filePath);

  let cacheControl = "public, max-age=3600";
  if (ext === ".html") cacheControl = "no-cache";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": cacheControl
  });

  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(res);
  });
}

function extractWhatsAppSummary(payload) {
  const entryCount = Array.isArray(payload?.entry) ? payload.entry.length : 0;
  const changes = [];

  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      changes.push({
        field: change?.field || null,
        metadata: value?.metadata || null,
        contacts: Array.isArray(value?.contacts) ? value.contacts.length : 0,
        messages: Array.isArray(value?.messages) ? value.messages.length : 0,
        statuses: Array.isArray(value?.statuses) ? value.statuses.length : 0
      });
    }
  }

  return { entryCount, changes };
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = requestUrl.pathname;
  const method = (req.method || "GET").toUpperCase();

  res.setHeader("X-Powered-By", APP_NAME);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (method === "GET" && (pathname === "/health" || pathname === "/api/health")) {
      return sendJson(res, 200, {
        ok: true,
        service: "matbakh-alyoum-smart-bot",
        status: "healthy",
        time: new Date().toISOString(),
        verifyTokenConfigured: Boolean(VERIFY_TOKEN),
        baseUrl: BASE_URL
      });
    }

    if (method === "GET" && pathname === "/robots.txt") {
      return sendText(res, 200, getRobotsTxt(), "text/plain; charset=utf-8");
    }

    if (method === "GET" && pathname === "/sitemap.xml") {
      return sendText(res, 200, getSitemapXml(), "application/xml; charset=utf-8");
    }

    if (method === "GET" && pathname === "/manifest.json") {
      return sendJson(res, 200, {
        name: "مطبخ اليوم المركزي",
        short_name: "مطبخ اليوم",
        start_url: "/",
        display: "standalone",
        background_color: "#111827",
        theme_color: "#f59e0b",
        lang: "ar",
        dir: "rtl"
      });
    }

    if (method === "GET" && pathname === "/webhook") {
      const mode = requestUrl.searchParams.get("hub.mode");
      const token = requestUrl.searchParams.get("hub.verify_token");
      const challenge = requestUrl.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        log("WhatsApp webhook verified successfully.");
        return sendText(res, 200, challenge || "");
      }

      log("WhatsApp webhook verification failed.");
      return sendJson(res, 403, {
        ok: false,
        error: "Webhook verification failed"
      });
    }

    if (method === "POST" && pathname === "/webhook") {
      const body = await parseRequestBody(req);

      if (!body.json) {
        return sendJson(res, 400, {
          ok: false,
          error: "Invalid JSON body"
        });
      }

      const summary = extractWhatsAppSummary(body.json);
      log("Incoming WhatsApp webhook:", JSON.stringify(summary));

      return sendJson(res, 200, {
        ok: true,
        received: true
      });
    }

    if (method === "POST" && (pathname === "/api/meta/capi" || pathname === "/meta/capi")) {
      const body = await parseRequestBody(req);
      log("Incoming Meta CAPI payload received.");

      return sendJson(res, 200, {
        ok: true,
        route: pathname,
        received: Boolean(body.raw),
        note: "Payload accepted by server"
      });
    }

    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      const indexFile = getFirstExistingFile([
        path.join(__dirname, "public", "index.html"),
        path.join(__dirname, "site", "index.html"),
        path.join(__dirname, "index.html")
      ]);

      if (indexFile) {
        return await serveFile(res, indexFile);
      }

      return sendText(res, 200, getDefaultHtml(), "text/html; charset=utf-8");
    }

    if (method === "GET") {
      const filePath = getStaticFilePath(pathname);
      if (filePath) {
        return await serveFile(res, filePath);
      }

      if (["/about", "/menu", "/privacy", "/contact", "/platforms"].includes(pathname)) {
        const fallbackPage = getFirstExistingFile([
          path.join(__dirname, "public", `${pathname.slice(1)}.html`),
          path.join(__dirname, `${pathname.slice(1)}.html`)
        ]);

        if (fallbackPage) {
          return await serveFile(res, fallbackPage);
        }

        return sendText(res, 200, getDefaultHtml(), "text/html; charset=utf-8");
      }
    }

    return sendJson(res, 404, {
      ok: false,
      error: "Not Found",
      path: pathname
    });
  } catch (error) {
    console.error("Server error:", error);
    return sendJson(res, 500, {
      ok: false,
      error: "Internal Server Error",
      message: error?.message || "Unknown error"
    });
  }
});

server.listen(PORT, "0.0.0.0", async () => {
  log(`${APP_NAME} running on http://0.0.0.0:${PORT}`);
  log(`Base URL: ${BASE_URL}`);

  const dirsToEnsure = [
    path.join(__dirname, "public"),
    path.join(__dirname, "logs")
  ];

  for (const dir of dirsToEnsure) {
    try {
      await fsp.mkdir(dir, { recursive: true });
    } catch {}
  }
});
