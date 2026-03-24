# الإقفال النهائي – مطبخ اليوم المركزي

## ما تم إقفاله في هذه النسخة
- البوت والموقع داخل مشروع واحد.
- منيو 94 صنفًا.
- مناطق التوصيل ورسومها من الملف النهائي.
- الدفع المعتمد: الدفع عند الاستلام — كاش.
- ساعات التشغيل الظاهرة على الموقع.
- أرقام الإدارة المعتمدة.
- مسار WhatsApp + Supabase + Render + GitHub.
- ملفات SQL النهائية:
  - `database/reset_schema_v4.sql`
  - `database/seed_menu.sql`
  - `database/seed_delivery_zones.sql`

## ترتيب التنفيذ النهائي
1. نفّذ `database/reset_schema_v4.sql`
2. نفّذ `database/seed_menu.sql`
3. نفّذ `database/seed_delivery_zones.sql`
4. عدّل متغيرات البيئة في Render
5. ارفع GitHub
6. راقب Logs في Render
7. اختبر:
   - الصفحة الرئيسية
   - المنيو
   - صفحة الطلب
   - صفحة التوصيل
   - Webhook
   - رحلة واتساب
   - أوامر الإدارة
8. بعد استقرار النسخة انتقل إلى:
   - Meta Webhook
   - Meta Catalog
   - Google Search Console
   - Google Business Profile

## الملفات الجديدة الخاصة بالمناطق
- `data/delivery_zones.json`
- `data/delivery_zones_grouped.json`
- `data/delivery_zones.csv`
- `database/seed_delivery_zones.sql`

## ما بعد البوت والموقع
- ربط الدومين الرسمي بعد استقرار Render.
- اختبار Meta webhook على الدومين الرسمي.
- تعبئة روابط الصور في Meta Catalog.
- إرسال sitemap إلى Google Search Console.
- تثبيت robots/canonical على الدومين النهائي.
- تشغيل أول حملة Lead / Purchase مع CAPI بعد استقرار الطلبات.
