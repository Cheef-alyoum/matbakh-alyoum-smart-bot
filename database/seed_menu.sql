-- menu_items seed generated from approved workbook

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0001', 'MY-MENU-0001', 'عالم المحاشي', 'كيلو ملفوف مطبوخ', 'كيلو ملفوف مطبوخ - بلدي', 'الملفوف', 'بلدي', 'كيلو', 'kg', 1, 8, 8000, 'ready', 'GRP-BF768D45', false, null, 'مطبوخ وجاهز للأكل، يكفي شخصين، الوزن بعد اللف، 27-30 حبة تقريبًا، الحشوة لحم عجل بلدي', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0002', 'MY-MENU-0002', 'عالم المحاشي', 'كيلو ملفوف جاهز للطبخ (غير مطبوخ)', 'كيلو ملفوف جاهز للطبخ (غير مطبوخ) - بلدي', 'الملفوف', 'بلدي', 'كيلو', 'kg', 1, 6, 6000, 'raw', 'GRP-0EEA304B', false, null, 'غير مطبوخ، الحشوة لحم عجل بلدي', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0003', 'MY-MENU-0003', 'عالم المحاشي', 'كيلو ورق عنب مطبوخ', 'كيلو ورق عنب مطبوخ', 'ورق العنب', null, 'كيلو', 'kg', 1, 10, 10000, 'ready', 'GRP-8605516F', false, null, 'مطبوخ وجاهز للأكل، بعد اللف، 60-65 حبة تقريبًا', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0004', 'MY-MENU-0004', 'عالم المحاشي', 'كيلو ورق عنب غير مطبوخ', 'كيلو ورق عنب غير مطبوخ', 'ورق العنب', null, 'كيلو', 'kg', 1, 8, 8000, 'raw', 'GRP-A2091F84', false, null, 'جاهز للطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0005', 'MY-MENU-0005', 'عالم المحاشي', 'كيلو كوسا مطبوخ', 'كيلو كوسا مطبوخ', 'الكوسا', null, 'كيلو', 'kg', 1, 6, 6000, 'ready', 'GRP-DA91738F', false, null, 'مطبوخ وجاهز للأكل، 10-12 حبة تقريبًا، حجم وسط', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0006', 'MY-MENU-0006', 'عالم المحاشي', 'كيلو كوسا غير مطبوخ', 'كيلو كوسا غير مطبوخ', 'الكوسا', null, 'كيلو', 'kg', 1, 5, 5000, 'raw', 'GRP-DCD48872', false, null, 'جاهز للطبخ، 10-12 حبة تقريبًا، حجم وسط', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0007', 'MY-MENU-0007', 'عالم المحاشي', 'كيلو باذنجان مطبوخ', 'كيلو باذنجان مطبوخ', 'الباذنجان', null, 'كيلو', 'kg', 1, 6, 6000, 'ready', 'GRP-514EF6E1', false, null, 'مطبوخ وجاهز للأكل، 10-12 حبة تقريبًا، حجم وسط', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0008', 'MY-MENU-0008', 'عالم المحاشي', 'كيلو باذنجان غير مطبوخ', 'كيلو باذنجان غير مطبوخ', 'الباذنجان', null, 'كيلو', 'kg', 1, 5, 5000, 'raw', 'GRP-EB6157C0', false, null, 'جاهز للطبخ، 10-12 حبة تقريبًا، حجم وسط', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0009', 'MY-MENU-0009', 'العروض المجمعة', 'العرض الأول – ورق عنب + كوسا + 4 ريش', 'العرض الأول – ورق عنب + كوسا + 4 ريش - عروض الريش - روماني', 'عروض الريش', 'روماني', 'عرض', 'bundle', 1, 25, 25000, 'bundle', 'GRP-C8C063D9', false, null, '1 كيلو ورق عنب + 1 كيلو كوسا + 4 ريش + خيار باللبن، يكفي 3-4 أشخاص', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0010', 'MY-MENU-0010', 'العروض المجمعة', 'العرض الثاني – ورق عنب + كوسا + 3 ريش', 'العرض الثاني – ورق عنب + كوسا + 3 ريش - عروض الريش - روماني', 'عروض الريش', 'روماني', 'عرض', 'bundle', 1, 14, 14000, 'bundle', 'GRP-21F0D08F', false, null, 'نصف كيلو ورق عنب + نصف كيلو كوسا + 3 ريش + خيار باللبن، يكفي شخصين', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0011', 'MY-MENU-0011', 'العروض المجمعة', 'العرض الأول – ورق عنب + كوسا + 4 ريش', 'العرض الأول – ورق عنب + كوسا + 4 ريش - عروض الريش - بلدي', 'عروض الريش', 'بلدي', 'عرض', 'bundle', 1, 30, 30000, 'bundle', 'GRP-C8C063D9', false, null, '1 كيلو ورق عنب + 1 كيلو كوسا + 4 ريش + خيار باللبن، يكفي 3-4 أشخاص', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0012', 'MY-MENU-0012', 'العروض المجمعة', 'العرض الثاني – ورق عنب + كوسا + 3 ريش', 'العرض الثاني – ورق عنب + كوسا + 3 ريش - عروض الريش - بلدي', 'عروض الريش', 'بلدي', 'عرض', 'bundle', 1, 17, 17000, 'bundle', 'GRP-21F0D08F', false, null, 'نصف كيلو ورق عنب + نصف كيلو كوسا + 3 ريش + خيار باللبن، يكفي شخصين', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0013', 'MY-MENU-0013', 'العروض المجمعة', 'العرض الأول – ورق عنب + كوسا + دجاجة', 'العرض الأول – ورق عنب + كوسا + دجاجة - عروض الدجاج', 'عروض الدجاج', 'دجاج', 'عرض', 'bundle', 1, 21, 21000, 'bundle', 'GRP-73B8BB03', false, null, '1 كيلو ورق عنب + 1 كيلو كوسا + دجاجة + خيار باللبن، يكفي 3-4 أشخاص', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0014', 'MY-MENU-0014', 'العروض المجمعة', 'العرض الثاني – ورق عنب + كوسا + نصف دجاجة', 'العرض الثاني – ورق عنب + كوسا + نصف دجاجة - عروض الدجاج', 'عروض الدجاج', 'دجاج', 'عرض', 'bundle', 1, 12, 12000, 'bundle', 'GRP-22DAE5BE', false, null, 'نصف كيلو ورق عنب + نصف كيلو كوسا + نصف دجاجة + خيار باللبن، يكفي شخصين', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0015', 'MY-MENU-0015', 'الأطباق الرئيسية', 'منسف', 'منسف - على الدجاج - دجاج - 1دجاجة', 'على الدجاج', 'دجاج', '1دجاجة', 'chicken', 1, 11, 11000, 'made_to_order', 'GRP-103A21DD', false, null, 'الدجاج مشوي أو مسلوق حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0016', 'MY-MENU-0016', 'الأطباق الرئيسية', 'مقلوبة', 'مقلوبة - على الدجاج - دجاج - 1دجاجة', 'على الدجاج', 'دجاج', '1دجاجة', 'chicken', 1, 11, 11000, 'made_to_order', 'GRP-0897954E', false, null, 'نوع الخضار: باذنجان + زهرة + بطاطا', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0017', 'MY-MENU-0017', 'الأطباق الرئيسية', 'أوزي', 'أوزي - على الدجاج - دجاج - 1دجاجة', 'على الدجاج', 'دجاج', '1دجاجة', 'chicken', 1, 11, 11000, 'made_to_order', 'GRP-B5D3276C', false, null, 'ارز يكفي شخصين', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0018', 'MY-MENU-0018', 'الأطباق الرئيسية', 'كبسة', 'كبسة - على الدجاج - دجاج - 1دجاجة', 'على الدجاج', 'دجاج', '1دجاجة', 'chicken', 1, 11, 11000, 'made_to_order', 'GRP-9843E8ED', false, null, 'ارز يكفي شخصين', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0019', 'MY-MENU-0019', 'الأطباق الرئيسية', 'برياني', 'برياني - على الدجاج - دجاج - 1دجاجة', 'على الدجاج', 'دجاج', '1دجاجة', 'chicken', 1, 11, 11000, 'made_to_order', 'GRP-D45E522C', false, null, 'ارز يكفي شخصين', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0020', 'MY-MENU-0020', 'الأطباق الرئيسية', 'فريكة', 'فريكة - على الدجاج - دجاج - 1دجاجة', 'على الدجاج', 'دجاج', '1دجاجة', 'chicken', 1, 11, 11000, 'made_to_order', 'GRP-83652349', false, null, 'كمية الفريكة تكفي شخصين', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0021', 'MY-MENU-0021', 'الأطباق الرئيسية', 'مفتول', 'مفتول - على الدجاج - دجاج - 1دجاجة', 'على الدجاج', 'دجاج', '1دجاجة', 'chicken', 1, 11, 11000, 'made_to_order', 'GRP-F86D0ACF', false, null, '1كيلو مفتول', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0022', 'MY-MENU-0022', 'الأطباق الرئيسية', 'مسخن', 'مسخن - على الدجاج - دجاج - 1دجاجة', 'على الدجاج', 'دجاج', '1دجاجة', 'chicken', 1, 11, 11000, 'made_to_order', 'GRP-7DB87EFF', false, null, '4رغيف حسب عدد الدجاج، والرغيف الإضافي بدينار', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0023', 'MY-MENU-0023', 'الأطباق الرئيسية', 'رغيف مسخن إضافي', 'رغيف مسخن إضافي - إضافات - خبز طابون', 'إضافات', 'خبز طابون', 'رغيف', 'piece', 1, 1, 1000, 'made_to_order', 'GRP-A9FDC806', false, null, 'لكل رغيف إضافي', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0024', 'MY-MENU-0024', 'الأطباق الرئيسية', 'مقلوبة على دجاجة مع إضافات', 'مقلوبة على دجاجة مع إضافات - على الدجاج', 'على الدجاج', 'دجاج', 'دجاجة', 'chicken', 1, 14, 14000, 'made_to_order', 'GRP-C7720798', false, null, 'تأتي مع 2 لبن + 2 سلطة', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0025', 'MY-MENU-0025', 'الأطباق الرئيسية', 'منسف', 'منسف - باللحم - بلدي - 1كيلو', 'باللحم', 'بلدي', '1كيلو', 'kg', 1, 23, 23000, 'made_to_order', 'GRP-C9E3EEBC', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0026', 'MY-MENU-0026', 'الأطباق الرئيسية', 'منسف', 'منسف - باللحم - روماني - 1كيلو', 'باللحم', 'روماني', '1كيلو', 'kg', 1, 17, 17000, 'made_to_order', 'GRP-C9E3EEBC', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0027', 'MY-MENU-0027', 'الأطباق الرئيسية', 'مقلوبة', 'مقلوبة - باللحم - بلدي - 1كيلو', 'باللحم', 'بلدي', '1كيلو', 'kg', 1, 23, 23000, 'made_to_order', 'GRP-6D2F91DC', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0028', 'MY-MENU-0028', 'الأطباق الرئيسية', 'مقلوبة', 'مقلوبة - باللحم - روماني - 1كيلو', 'باللحم', 'روماني', '1كيلو', 'kg', 1, 17, 17000, 'made_to_order', 'GRP-6D2F91DC', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0029', 'MY-MENU-0029', 'الأطباق الرئيسية', 'كبسة', 'كبسة - باللحم - بلدي - 1كيلو', 'باللحم', 'بلدي', '1كيلو', 'kg', 1, 23, 23000, 'made_to_order', 'GRP-A8940294', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0030', 'MY-MENU-0030', 'الأطباق الرئيسية', 'كبسة', 'كبسة - باللحم - روماني - 1كيلو', 'باللحم', 'روماني', '1كيلو', 'kg', 1, 17, 17000, 'made_to_order', 'GRP-A8940294', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0031', 'MY-MENU-0031', 'الأطباق الرئيسية', 'أوزي', 'أوزي - باللحم - بلدي - 1كيلو', 'باللحم', 'بلدي', '1كيلو', 'kg', 1, 23, 23000, 'made_to_order', 'GRP-925220C4', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0032', 'MY-MENU-0032', 'الأطباق الرئيسية', 'أوزي', 'أوزي - باللحم - روماني - 1كيلو', 'باللحم', 'روماني', '1كيلو', 'kg', 1, 17, 17000, 'made_to_order', 'GRP-925220C4', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0033', 'MY-MENU-0033', 'الأطباق الرئيسية', 'فريكة', 'فريكة - باللحم - بلدي - 1كيلو', 'باللحم', 'بلدي', '1كيلو', 'kg', 1, 23, 23000, 'made_to_order', 'GRP-9E1ADA46', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0034', 'MY-MENU-0034', 'الأطباق الرئيسية', 'فريكة', 'فريكة - باللحم - روماني - 1كيلو', 'باللحم', 'روماني', '1كيلو', 'kg', 1, 17, 17000, 'made_to_order', 'GRP-9E1ADA46', false, null, 'يتم تقطيع الكيلو إلى 3 أو 4 قطع حسب طلب الزبون', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0035', 'MY-MENU-0035', 'الأطباق الرئيسية', 'صنية كفتة', 'صنية كفتة - أطباق باللحم - بلدي - 1كيلو', 'أطباق باللحم', 'بلدي', '1كيلو', 'kg', 1, 15, 15000, 'made_to_order', 'GRP-5F751120', false, null, 'فرد بالبندور او كورات او مع طحينية', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0036', 'MY-MENU-0036', 'أطباق نفرات', 'بامية', 'بامية - شخصين', 'نفرات', null, 'شخصين', 'serving', 2, 10, 10000, 'made_to_order', 'GRP-AB507E10', false, null, 'مع ارز ابيض', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0037', 'MY-MENU-0037', 'أطباق نفرات', 'فاصوليا', 'فاصوليا - شخصين', 'نفرات', null, 'شخصين', 'serving', 2, 10, 10000, 'made_to_order', 'GRP-41D56C7F', false, null, 'مع ارز ابيض', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0038', 'MY-MENU-0038', 'أطباق نفرات', 'شاكرية', 'شاكرية - شخصين', 'نفرات', null, 'شخصين', 'serving', 2, 10, 10000, 'made_to_order', 'GRP-3CE2298E', false, null, 'مع ارز بالشعرية او ابيض', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0039', 'MY-MENU-0039', 'أطباق نفرات', 'كباب هندي', 'كباب هندي - شخصين', 'نفرات', null, 'شخصين', 'serving', 2, 10, 10000, 'made_to_order', 'GRP-07656BA7', false, null, 'مع ارز ابيض', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0040', 'MY-MENU-0040', 'أطباق نفرات', 'شيشبرك + أرز', 'شيشبرك + أرز - بلدي - شخصين', 'نفرات', 'بلدي', 'شخصين', 'serving', 2, 10, 10000, 'made_to_order', 'GRP-EC21F89D', false, null, '20حبة، الحشوة لحم عجل بلدي', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0041', 'MY-MENU-0041', 'أطباق نفرات', 'شيخ المخشي + أرز', 'شيخ المخشي + أرز - بلدي - شخصين', 'نفرات', 'بلدي', 'شخصين', 'serving', 2, 10, 10000, 'made_to_order', 'GRP-8CB8CD56', false, null, '8حبة، الحشوة لحم عجل بلدي', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0042', 'MY-MENU-0042', 'أطباق نفرات', 'ملوخية', 'ملوخية - شخصين', 'نفرات', null, 'شخصين', 'serving', 2, 10, 10000, 'made_to_order', 'GRP-BA330EB1', false, null, 'مع ارز ابيض', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0043', 'MY-MENU-0043', 'أطباق نفرات', 'كبة لبنية + أرز', 'كبة لبنية + أرز - بلدي - شخصين', 'نفرات', 'بلدي', 'شخصين', 'serving', 2, 10, 10000, 'made_to_order', 'GRP-64F83F69', false, null, '8حبة الحشوة لحم عجل بلدي', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0044', 'MY-MENU-0044', 'عالم المفتول', 'كيلو مفتول مطبوخ', 'كيلو مفتول مطبوخ', 'المفتول', null, 'كيلو', 'kg', 1, 6, 6000, 'ready', 'GRP-7E3EE095', false, null, 'مطبوخ وجاهز للأكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0045', 'MY-MENU-0045', 'عالم المفتول', 'كيلو مفتول غير مطبوخ', 'كيلو مفتول غير مطبوخ', 'المفتول', null, 'كيلو', 'kg', 1, 4, 4000, 'raw', 'GRP-60D7BCD5', false, null, 'جاهز للطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0046', 'MY-MENU-0046', 'عالم المفتول', 'شوربة المفتول', 'شوربة المفتول', 'المفتول', null, 'إضافة', 'addon', 1, 2, 2000, 'made_to_order', 'GRP-ADFB6721', true, 'السعر يحتاج تأكيد', 'مرقة دجاج + حب حمص + بصل، ولم يذكر سعر واضح في المصدر', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0047', 'MY-MENU-0047', 'عالم المفتول', 'إضافة خضروات للمفتول', 'إضافة خضروات للمفتول', 'المفتول', null, 'إضافة', 'addon', 1, 2, 2000, 'made_to_order', 'GRP-D6F359C3', false, null, 'بندورة / بطاطا / جزر / كوسا', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0048', 'MY-MENU-0048', 'عالم اليالنجي', 'كيلو يالنجي مطبوخ', 'كيلو يالنجي مطبوخ', 'اليالنجي', null, 'كيلو', 'kg', 1, 12, 12000, 'ready', 'GRP-A82655E0', false, null, 'مطبوخ وجاهز للأكل، بعد اللف، 40-44 حبة تقريبًا', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0049', 'MY-MENU-0049', 'عالم اليالنجي', 'كيلو كوسا يالنجي مطبوخ', 'كيلو كوسا يالنجي مطبوخ', 'اليالنجي', null, 'كيلو', 'kg', 1, 6, 6000, 'ready', 'GRP-CC1AE8AE', false, null, 'مطبوخ وجاهز للأكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0050', 'MY-MENU-0050', 'عالم اليالنجي', 'كيلو باذنجان يالنجي مطبوخ', 'كيلو باذنجان يالنجي مطبوخ', 'اليالنجي', null, 'كيلو', 'kg', 1, 6, 6000, 'ready', 'GRP-0D19FF01', false, null, 'مطبوخ وجاهز للأكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0051', 'MY-MENU-0051', 'عالم اليالنجي', 'كيلو ملفوف يالنجي مطبوخ', 'كيلو ملفوف يالنجي مطبوخ', 'اليالنجي', null, 'كيلو', 'kg', 1, 8, 8000, 'ready', 'GRP-3B4E8EF7', false, null, 'مطبوخ وجاهز للأكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0052', 'MY-MENU-0052', 'عالم اليالنجي', 'كيلو يالنجي غير مطبوخ', 'كيلو يالنجي غير مطبوخ', 'اليالنجي', null, 'كيلو', 'kg', 1, 8, 8000, 'raw', 'GRP-1230E699', false, null, 'جاهز للطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0053', 'MY-MENU-0053', 'عالم اليالنجي', 'كيلو كوسا يالنجي غير مطبوخ', 'كيلو كوسا يالنجي غير مطبوخ', 'اليالنجي', null, 'كيلو', 'kg', 1, 5, 5000, 'raw', 'GRP-80E279C0', false, null, 'جاهز للطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0054', 'MY-MENU-0054', 'عالم اليالنجي', 'كيلو باذنجان يالنجي غير مطبوخ', 'كيلو باذنجان يالنجي غير مطبوخ', 'اليالنجي', null, 'كيلو', 'kg', 1, 5, 5000, 'raw', 'GRP-0FA2D761', false, null, 'جاهز للطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0055', 'MY-MENU-0055', 'السلطات', 'خيار بلبن', 'خيار بلبن', 'سلطات', null, 'صحن', 'plate', 1, 2, 2000, 'ready', 'GRP-2D897135', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0056', 'MY-MENU-0056', 'السلطات', 'سلطة عربية', 'سلطة عربية', 'سلطات', null, 'صحن', 'plate', 1, 2, 2000, 'ready', 'GRP-D0DD21F8', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0057', 'MY-MENU-0057', 'السلطات', 'فتوش', 'فتوش', 'سلطات', null, 'صحن', 'plate', 1, 2, 2000, 'ready', 'GRP-D012C011', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0058', 'MY-MENU-0058', 'السلطات', 'سلطة جرجير', 'سلطة جرجير', 'سلطات', null, 'صحن', 'plate', 1, 2, 2000, 'ready', 'GRP-6DFB64B1', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0059', 'MY-MENU-0059', 'السلطات', 'تبولة', 'تبولة', 'سلطات', null, 'صحن', 'plate', 1, 4, 4000, 'ready', 'GRP-832C07A9', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0060', 'MY-MENU-0060', 'السلطات', 'سلطة معكرونة', 'سلطة معكرونة', 'سلطات', null, 'صحن', 'plate', 1, 4, 4000, 'ready', 'GRP-E76D0638', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0061', 'MY-MENU-0061', 'السلطات', 'سلطة البوملي', 'سلطة البوملي', 'سلطات', null, 'صحن', 'plate', 1, 6, 6000, 'ready', 'GRP-11C1764C', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0062', 'MY-MENU-0062', 'الشوربات', 'شوربة عدس', 'شوربة عدس - 300 ml', 'شوربات', null, '300 ml', 'volume', 300, 2, 2000, 'ready', 'GRP-C269C857', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0063', 'MY-MENU-0063', 'الشوربات', 'شوربة فريكة', 'شوربة فريكة - 300 ml', 'شوربات', null, '300 ml', 'volume', 300, 2, 2000, 'ready', 'GRP-8DEBA6CA', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0064', 'MY-MENU-0064', 'الشوربات', 'شوربة خضار', 'شوربة خضار - 300 ml', 'شوربات', null, '300 ml', 'volume', 300, 2, 2000, 'ready', 'GRP-A25CD025', false, null, null, 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0065', 'MY-MENU-0065', 'المقالي', 'حبة كبة مقلية', 'حبة كبة مقلية', 'مقالي', null, 'حبة', 'piece_pack', 1, 0.75, 750, 'ready', 'GRP-84789841', false, null, 'جاهز للاكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0066', 'MY-MENU-0066', 'المقالي', 'رول مسخن مقلي', 'رول مسخن مقلي - 3 حبات', 'مقالي', null, '3 حبات', 'other', 3, 1, 1000, 'ready', 'GRP-D2E38391', false, null, 'جاهز للاكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0067', 'MY-MENU-0067', 'المقالي', 'حبة سمبوسك جبنة مقلية', 'حبة سمبوسك جبنة مقلية', 'مقالي', null, 'حبة', 'piece_pack', 1, 0.4, 400, 'ready', 'GRP-4E938568', false, null, 'جاهز للاكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0068', 'MY-MENU-0068', 'المقالي', 'حبة سمبوسك لحمة مقلية', 'حبة سمبوسك لحمة مقلية', 'مقالي', null, 'حبة', 'piece_pack', 1, 0.4, 400, 'ready', 'GRP-B60EB397', false, null, 'جاهز للاكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0069', 'MY-MENU-0069', 'المقالي', 'سبرينغ رول مقلي', 'سبرينغ رول مقلي', 'مقالي', null, 'حبة', 'piece_pack', 1, 0.5, 500, 'ready', 'GRP-7793B903', false, null, 'جاهز للاكل', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0070', 'MY-MENU-0070', 'المفرزات', 'كبة مفرزة', 'كبة مفرزة - 25 حبة', 'مفرزات', null, '25 حبة', 'piece_pack', 25, 15, 15000, 'frozen', 'GRP-42BF0061', false, null, 'جاهز لطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0071', 'MY-MENU-0071', 'المفرزات', 'رولات مسخن مفرزة', 'رولات مسخن مفرزة - 25 حبة', 'مفرزات', null, '25 حبة', 'piece_pack', 25, 8, 8000, 'frozen', 'GRP-879E9875', false, null, 'جاهز لطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0072', 'MY-MENU-0072', 'المفرزات', 'سمبوسك بالجبنة مفرزة', 'سمبوسك بالجبنة مفرزة - 25 حبة', 'مفرزات', null, '25 حبة', 'piece_pack', 25, 8, 8000, 'frozen', 'GRP-7F3BDB4C', false, null, 'جاهز لطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0073', 'MY-MENU-0073', 'المفرزات', 'سمبوسك باللحمة مفرزة', 'سمبوسك باللحمة مفرزة - 25 حبة', 'مفرزات', null, '25 حبة', 'piece_pack', 25, 10, 10000, 'frozen', 'GRP-0DB33061', false, null, 'جاهز لطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0074', 'MY-MENU-0074', 'المفرزات', 'شيشبرك مفرز', 'شيشبرك مفرز - بلدي - 50 حبة', 'مفرزات', 'بلدي', '50 حبة', 'piece_pack', 50, 8, 8000, 'frozen', 'GRP-EBA385C2', false, null, 'جاهز لطبخ', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0075', 'MY-MENU-0075', 'المفرزات', 'كيلو شيخ المخشي مفرز', 'كيلو شيخ المخشي مفرز - بلدي - 1كيلو', 'مفرزات', 'بلدي', '1كيلو', 'kg', 1, 12, 12000, 'frozen', 'GRP-9A52ACCF', false, null, 'الحشوة لحم عجل بلدي 12 حبة كوسا', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0076', 'MY-MENU-0076', 'المفرزات', 'عرض التوفير للمفرزات', 'عرض التوفير للمفرزات', 'مفرزات', null, 'عرض', 'bundle', 1, 35, 35000, 'frozen', 'GRP-776121A1', false, null, '25 حبة كبة + 25 حبة سمبوسك جبنة + 25 حبة رول مسخن + 50 حبة شيشبرك', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0077', 'MY-MENU-0077', 'ولائم ومحاشي الذبائح', 'محشي رز', 'محشي رز - خاروف كامل - بلدي - خاروف', 'خاروف كامل', 'بلدي', 'خاروف', 'whole_sheep', 1, 270, 270000, 'made_to_order', 'GRP-3A23BF67', false, null, 'وزن الخاروف 12-14 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0078', 'MY-MENU-0078', 'ولائم ومحاشي الذبائح', 'محشي فريكة', 'محشي فريكة - خاروف كامل - بلدي - خاروف', 'خاروف كامل', 'بلدي', 'خاروف', 'whole_sheep', 1, 270, 270000, 'made_to_order', 'GRP-BAE27F6F', false, null, 'وزن الخاروف 12-14 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0079', 'MY-MENU-0079', 'ولائم ومحاشي الذبائح', 'محشي ورق عنب', 'محشي ورق عنب - خاروف كامل - بلدي - خاروف', 'خاروف كامل', 'بلدي', 'خاروف', 'whole_sheep', 1, 290, 290000, 'made_to_order', 'GRP-EED18F0D', true, 'الوصف/التسمية تحتاج تأكيد', 'وزن الخاروف 12-14 كيلو؛ في الصفحة كُتب: ضلعة محشي ورق عنب، لذا يحتاج تأكيد التسمية', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0080', 'MY-MENU-0080', 'ولائم ومحاشي الذبائح', 'محشي رز', 'محشي رز - خاروف كامل - مستورد - خاروف', 'خاروف كامل', 'مستورد', 'خاروف', 'whole_sheep', 1, 200, 200000, 'made_to_order', 'GRP-3A23BF67', false, null, 'وزن الخاروف 12-14 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0081', 'MY-MENU-0081', 'ولائم ومحاشي الذبائح', 'محشي فريكة', 'محشي فريكة - خاروف كامل - مستورد - خاروف', 'خاروف كامل', 'مستورد', 'خاروف', 'whole_sheep', 1, 200, 200000, 'made_to_order', 'GRP-BAE27F6F', false, null, 'وزن الخاروف 12-14 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0082', 'MY-MENU-0082', 'ولائم ومحاشي الذبائح', 'محشي ورق عنب', 'محشي ورق عنب - خاروف كامل - مستورد - خاروف', 'خاروف كامل', 'مستورد', 'خاروف', 'whole_sheep', 1, 220, 220000, 'made_to_order', 'GRP-EED18F0D', false, null, 'وزن الخاروف 12-14 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0083', 'MY-MENU-0083', 'ولائم ومحاشي الذبائح', 'محشي رز', 'محشي رز - نصف خاروف - بلدي - نصف خاروف', 'نصف خاروف', 'بلدي', 'نصف خاروف', 'half_sheep', 0.5, 150, 150000, 'made_to_order', 'GRP-08F9B75D', false, null, 'وزن 7-8 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0084', 'MY-MENU-0084', 'ولائم ومحاشي الذبائح', 'محشي فريكة', 'محشي فريكة - نصف خاروف - بلدي - نصف خاروف', 'نصف خاروف', 'بلدي', 'نصف خاروف', 'half_sheep', 0.5, 150, 150000, 'made_to_order', 'GRP-47003D2A', false, null, 'وزن 7-8 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0085', 'MY-MENU-0085', 'ولائم ومحاشي الذبائح', 'محشي ورق عنب', 'محشي ورق عنب - نصف خاروف - بلدي - نصف خاروف', 'نصف خاروف', 'بلدي', 'نصف خاروف', 'half_sheep', 0.5, 170, 170000, 'made_to_order', 'GRP-90DA0CF9', false, null, 'وزن 7-8 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0086', 'MY-MENU-0086', 'ولائم ومحاشي الذبائح', 'محشي رز', 'محشي رز - نصف خاروف - مستورد - نصف خاروف', 'نصف خاروف', 'مستورد', 'نصف خاروف', 'half_sheep', 0.5, 125, 125000, 'made_to_order', 'GRP-08F9B75D', false, null, 'وزن 7-8 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0087', 'MY-MENU-0087', 'ولائم ومحاشي الذبائح', 'محشي فريكة', 'محشي فريكة - نصف خاروف - مستورد - نصف خاروف', 'نصف خاروف', 'مستورد', 'نصف خاروف', 'half_sheep', 0.5, 125, 125000, 'made_to_order', 'GRP-47003D2A', false, null, 'وزن 7-8 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0088', 'MY-MENU-0088', 'ولائم ومحاشي الذبائح', 'محشي ورق عنب', 'محشي ورق عنب - نصف خاروف - مستورد - نصف خاروف', 'نصف خاروف', 'مستورد', 'نصف خاروف', 'half_sheep', 0.5, 145, 145000, 'made_to_order', 'GRP-90DA0CF9', false, null, 'وزن 7-8 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0089', 'MY-MENU-0089', 'ولائم ومحاشي الذبائح', 'محشي رز', 'محشي رز - ضلعة - بلدي - ضلعة', 'ضلعة', 'بلدي', 'ضلعة', 'lamb_rack', 1, 80, 80000, 'made_to_order', 'GRP-CA6DCC57', false, null, 'وزن 3-4 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0090', 'MY-MENU-0090', 'ولائم ومحاشي الذبائح', 'محشي فريكة', 'محشي فريكة - ضلعة - بلدي - ضلعة', 'ضلعة', 'بلدي', 'ضلعة', 'lamb_rack', 1, 80, 80000, 'made_to_order', 'GRP-6DE68251', false, null, 'وزن 3-4 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0091', 'MY-MENU-0091', 'ولائم ومحاشي الذبائح', 'محشي ورق عنب', 'محشي ورق عنب - ضلعة - بلدي - ضلعة', 'ضلعة', 'بلدي', 'ضلعة', 'lamb_rack', 1, 90, 90000, 'made_to_order', 'GRP-5F5B0BAD', false, null, 'وزن 3-4 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0092', 'MY-MENU-0092', 'ولائم ومحاشي الذبائح', 'محشي رز', 'محشي رز - ضلعة - مستورد - ضلعة', 'ضلعة', 'مستورد', 'ضلعة', 'lamb_rack', 1, 65, 65000, 'made_to_order', 'GRP-CA6DCC57', false, null, 'وزن 3-4 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0093', 'MY-MENU-0093', 'ولائم ومحاشي الذبائح', 'محشي فريكة', 'محشي فريكة - ضلعة - مستورد - ضلعة', 'ضلعة', 'مستورد', 'ضلعة', 'lamb_rack', 1, 65, 65000, 'made_to_order', 'GRP-6DE68251', false, null, 'وزن 3-4 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();

insert into menu_items (id, sku, section_ar, item_name_ar, display_name_ar, category_ar, type_ar, unit_ar, unit_type, unit_count, price_1_jod, price_1_fils, status, group_id, review_needed, review_note, notes_ar, source)
values ('MY-0094', 'MY-MENU-0094', 'ولائم ومحاشي الذبائح', 'محشي ورق عنب', 'محشي ورق عنب - ضلعة - مستورد - ضلعة', 'ضلعة', 'مستورد', 'ضلعة', 'lamb_rack', 1, 75, 75000, 'made_to_order', 'GRP-5F5B0BAD', false, null, 'وزن 3-4 كيلو', 'user_text')
on conflict (id) do update set
  sku = excluded.sku,
  section_ar = excluded.section_ar,
  item_name_ar = excluded.item_name_ar,
  display_name_ar = excluded.display_name_ar,
  category_ar = excluded.category_ar,
  type_ar = excluded.type_ar,
  unit_ar = excluded.unit_ar,
  unit_type = excluded.unit_type,
  unit_count = excluded.unit_count,
  price_1_jod = excluded.price_1_jod,
  price_1_fils = excluded.price_1_fils,
  status = excluded.status,
  group_id = excluded.group_id,
  review_needed = excluded.review_needed,
  review_note = excluded.review_note,
  notes_ar = excluded.notes_ar,
  source = excluded.source,
  updated_at = now();
