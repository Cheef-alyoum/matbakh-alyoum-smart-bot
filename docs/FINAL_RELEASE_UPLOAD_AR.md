# الملف النهائي الجاهز للرفع

هذه الحزمة هي النسخة النهائية الجاهزة للرفع وتشمل:
- الموقع العام داخل `public/`
- البوت داخل `src/services/` و`server.js`
- قاعدة البيانات داخل `database/`
- المنيو وكتالوج Meta داخل `data/`
- آلية التشغيل والنشر داخل `docs/` و`render.yaml`

## ترتيب التنفيذ
1. نفّذ `database/reset_schema_v4.sql` على Supabase.
2. نفّذ `database/seed_menu.sql` على Supabase.
3. اضبط متغيرات البيئة في Render.
4. ارفع المستودع إلى GitHub ثم `git push origin main`.
5. نفّذ Deploy على Render.
6. اختبر `/`, `/menu.html`, `/order.html`, `/track.html`, وWebhook واتساب.

## ملاحظات نهائية
- تم اعتماد النصوص الظاهرة للعميل بحسب `docs/FINAL_CUSTOMER_COPY_AR.md`.
- الصفحات العامة صالحة للعرض والتهيئة لمحركات البحث.
- الروابط العامة المؤقتة يمكن أن تبقى على `onrender.com` إلى حين تثبيت الدومين النهائي.
