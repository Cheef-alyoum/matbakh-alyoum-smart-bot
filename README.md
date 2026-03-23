# Matbakh Al Youm Smart Bot

حزمة جاهزة أولية للتشغيل تتضمن:
- موقع عام احترافي
- API منفصل
- منيو مستورد من الملف المعتمد
- WhatsApp Webhook
- Meta Conversions API
- SQL لقاعدة البيانات
- ملفات SEO/Schema/OG

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
- التخزين الحالي للطلبات والرسائل والـ leads يتم في ملفات JSON داخل `storage/` لسهولة التجربة السريعة.
- في الإنتاج، استخدم ملفات SQL داخل `database/` مع Supabase ثم اربط الاستدعاءات بقاعدة البيانات.
- صور الكتالوج الحالية Placeholder SVG موحدة، ويمكن استبدالها لاحقًا بصور حقيقية لكل صنف.


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
