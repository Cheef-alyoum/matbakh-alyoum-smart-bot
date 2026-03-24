# أوامر الرفع النهائية

## GitHub – المسار المباشر على main
```powershell
cd "C:\matbakh-alyoum-smart-bot-v2-production (2)"
git status
git add .
git commit -m "finalize matbakh bot website seo and delivery zones"
git push origin main
```

## GitHub – المسار الأنظف عبر فرع نهائي
```powershell
cd "C:\matbakh-alyoum-smart-bot-v2-production (2)"
git checkout -b final-bot-website-release
git add .
git commit -m "finalize matbakh bot website seo and delivery zones"
git push origin final-bot-website-release
```

## Render
- إذا كان Auto-Deploy مفعّلًا على `main` سيبدأ النشر تلقائيًا بعد الـ push.
- إذا لم يبدأ، نفّذ:
  - Manual Deploy
  - Deploy latest commit

## Supabase – الترتيب الإلزامي
1. `database/reset_schema_v4.sql`
2. `database/seed_menu.sql`
3. `database/seed_delivery_zones.sql`

## فحص بعد النشر
- لا يوجد خطأ 500
- لا يوجد خطأ Schema
- `/api/status` يعمل
- `/api/delivery/zones` يعمل
- `/menu.html` يعمل
- `/delivery.html` يعرض المناطق
- واتساب يعرض الأزرار
- الطلب يصل للإدارة
