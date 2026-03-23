# نشر المشروع على Render — النسخة العملية

## 1) قبل الربط
- ارفع المشروع إلى GitHub.
- تأكد أن `render.yaml` موجود في جذر المستودع.
- جهز القيم السرية قبل أول ربط:
  - `WHATSAPP_VERIFY_TOKEN`
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `META_PIXEL_ID`
  - `META_ACCESS_TOKEN`
  - `APP_SECRET`

## 2) إنشاء الخدمة
1. افتح Render.
2. اختر **New +** ثم **Blueprint**.
3. اربط المستودع.
4. وافق على قراءة `render.yaml`.
5. أدخل القيم السرية التي سيطلبها Render لأول مرة.
6. أكمل الإنشاء.

## 3) بعد إنشاء الخدمة
تحقق من التالي:
- `https://YOUR-DOMAIN/healthz`
- `https://YOUR-DOMAIN/api/status`
- الصفحة الرئيسية `/`
- صفحة المنيو `/menu.html`

## 4) بعد إضافة الدومين الرسمي
- اجعل `BASE_URL=https://matbakh-alyoum.site`
- أعد النشر
- افحص `sitemap.xml` و `robots.txt`
- افحص معاينة الرابط في Meta

## 5) ملاحظات مهمة
- لا تضع الأسرار داخل GitHub.
- أي قيمة `sync: false` في `render.yaml` تُطلب فقط عند الإنشاء الأول.
- عند إضافة أسرار جديدة لاحقًا، أضفها من لوحة Render يدويًا.
