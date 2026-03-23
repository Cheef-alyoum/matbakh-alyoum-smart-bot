# Matbakh Al Youm Smart Bot v1.3.0

حزمة جاهزة للتشغيل تتضمن:
- موقع عام احترافي
- API منفصل
- منيو مستورد من الملف المعتمد
- WhatsApp Webhook
- Meta Conversions API
- SQL لقاعدة البيانات
- ملفات SEO/Schema/OG
- رحلة واتساب تفاعلية كاملة بالأزرار والقوائم
- سلة طلب داخل واتساب
- إرسال الطلب للإدارة مع إشعارات مباشرة
- أوامر إدارة عبر واتساب للحالات الأساسية

## ما الجديد في v1.3.0
- زر `ابدأ الطلب` لم يعد يرسل رابطًا فقط، بل يفتح رحلة طلب كاملة داخل واتساب
- اختيار قسم → اختيار صنف → اختيار كمية → مراجعة السلة → التوصيل/الاستلام → الوقت → العنوان → الدفع → الملاحظات → إنشاء الطلب
- تخزين `session_data` و `last_order_id` في Supabase
- أوامر إدارة عبر واتساب:
  - `/pending`
  - `/view ORDER_ID`
  - `/approve ORDER_ID`
  - `/reject ORDER_ID سبب`
  - `/ready ORDER_ID`
  - `/out ORDER_ID`
  - `/delivered ORDER_ID`
- ملف إعادة بناء كامل لقاعدة البيانات:
  - `database/reset_schema_v4.sql`

## التشغيل المحلي
1. انسخ `.env.example` إلى `.env`
2. نفّذ:
   ```bash
   npm run seed:storage
   npm start
   ```
3. افتح:
   - `/`
   - `/api/status`
   - `/menu.html`
   - `/order.html`
   - `/track.html`

## ملاحظات
- التخزين الحالي للطلبات والرسائل والـ leads يتم في ملفات JSON داخل `storage/` لسهولة التجربة السريعة إذا لم تكن Supabase مفعلة.
- في الإنتاج، استخدم ملفات SQL داخل `database/` مع Supabase ثم اربط الاستدعاءات بقاعدة البيانات.
- صور الكتالوج الحالية Placeholder SVG موحدة، ويمكن استبدالها لاحقًا بصور حقيقية لكل صنف.

## قاعدة البيانات للإنتاج
في Supabase نفّذ بالترتيب:
1. `database/reset_schema_v4.sql`
2. `database/seed_menu.sql`

ثم أعد النشر على Render.

## نسخة نشر أكثر صرامة
تمت إضافة الملفات التالية:
- `.env.production.example`
- `.node-version`
- `.github/workflows/node-ci.yml`
- `docs/DEPLOY_RENDER_AR.md`
- `docs/DEPLOY_GITHUB_RENDER_AR.md`
- `docs/PRODUCTION_CHECKLIST_AR.md`
- `scripts/validate-app.js`
- `scripts/smoke-test.js`

### أوامر مفيدة
```bash
npm run validate:app
npm run smoke:local
```

### ملفات النشر التي تحتاجها أولًا
- `render.yaml`
- `.env.production.example`
- `docs/DEPLOY_RENDER_AR.md`
- `docs/PRODUCTION_CHECKLIST_AR.md`
