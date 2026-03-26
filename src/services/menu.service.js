import path from 'node:path';
import { readJsonFile, slugify } from '../utils/core.js';

const ROOT_DEFINITIONS = [
  {
    id: 'bundles',
    title: '🍲 الأطباق المطبوخة',
    description: 'محاشي، دجاج، لحوم، طبخات، سلطات، شوربات',
    kind: 'hierarchy'
  },
  {
    id: 'catering',
    title: '🍖 الولائم والعزائم',
    description: 'خاروف كامل، نصف خاروف، ضلعة',
    kind: 'hierarchy'
  },
  {
    id: 'frozen',
    title: '❄️ المفرزات',
    description: 'أصناف مفرزة جاهزة للحفظ',
    kind: 'direct'
  }
];

const ROOT_ALIASES = {
  cooked: 'bundles',
  bundles: 'bundles',
  bundle: 'bundles',
  chicken: 'bundles',
  main_chicken: 'bundles',
  meat: 'bundles',
  main_meat: 'bundles',
  mahashi: 'bundles',
  yalangi: 'bundles',
  maftoul: 'bundles',
  individual: 'bundles',
  salads: 'bundles',
  soups: 'bundles',
  fried: 'bundles',
  catering: 'catering',
  frozen: 'frozen'
};

const STATUS_LABELS = {
  ready: 'مطبوخ',
  raw: 'جاهز للطبخ',
  frozen: 'مفرز',
  made_to_order: 'حسب الطلب',
  bundle: 'عرض'
};

const CATEGORY_ORDER = {
  bundles: [
    '🥬 المحاشي',
    '🍗 أطباق الدجاج',
    '🥩 أطباق اللحوم',
    '🍛 الطبخات البيتية',
    '🥗 السلطات',
    '🍲 الشوربات'
  ],
  catering: [
    'خاروف كامل',
    'نصف خاروف',
    'ضلعة'
  ],
  frozen: [
    '❄️ المفرزات'
  ]
};

const TYPE_ORDER = ['بلدي', 'روماني', 'مستورد', 'دجاج'];

function normalizeArabic(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    const key = keyFn(item);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function sortByReference(values = [], reference = []) {
  const indexMap = new Map(reference.map((value, index) => [normalizeArabic(value), index]));

  return [...values].sort((a, b) => {
    const aIndex = indexMap.has(normalizeArabic(a)) ? indexMap.get(normalizeArabic(a)) : 999;
    const bIndex = indexMap.has(normalizeArabic(b)) ? indexMap.get(normalizeArabic(b)) : 999;

    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(a || '').localeCompare(String(b || ''), 'ar');
  });
}

export function resolveRootId(rootId = '') {
  return ROOT_ALIASES[String(rootId || '').trim()] || String(rootId || '').trim();
}

export function getRootDefinitions() {
  return ROOT_DEFINITIONS;
}

export function getMenuData(rootDir) {
  return readJsonFile(path.join(rootDir, 'data', 'menu.api_items.json'), []);
}

export function getMetaCatalog(rootDir) {
  return readJsonFile(path.join(rootDir, 'data', 'meta_catalog.json'), []);
}

export function getMenuSummary(rootDir) {
  return readJsonFile(path.join(rootDir, 'data', 'menu.summary.json'), {});
}

export function getSections(rootDir) {
  const items = getMenuData(rootDir).filter(item => item.menu_root !== 'modifiers');
  const map = new Map();

  for (const item of items) {
    if (!map.has(item.section_ar)) map.set(item.section_ar, []);
    map.get(item.section_ar).push(item);
  }

  return [...map.entries()].map(([section_ar, sectionItems]) => ({
    section_ar,
    count: sectionItems.length,
    slug: slugify(section_ar),
    items: sectionItems
  }));
}

export function getSectionBySlug(rootDir, sectionSlug) {
  return getSections(rootDir).find(section => section.slug === slugify(sectionSlug)) || null;
}

export function getItemsBySection(rootDir, sectionName) {
  return getMenuData(rootDir).filter(item => item.section_ar === sectionName);
}

export function getMenuItemById(rootDir, itemId) {
  const wanted = String(itemId || '').trim();
  if (!wanted) return null;

  const normalizedWanted = normalizeArabic(wanted);

  return getMenuData(rootDir).find(item => (
    item.record_id === wanted ||
    item.id === wanted ||
    item.sku === wanted ||
    normalizeArabic(item.display_name_ar) === normalizedWanted ||
    normalizeArabic(item.item_name_ar) === normalizedWanted
  )) || null;
}

export function searchMenu(rootDir, q) {
  const query = normalizeArabic(q);
  const items = getMenuData(rootDir).filter(item => item.menu_root !== 'modifiers');

  if (!query) return items.slice(0, 20);

  return items.filter(item => {
    const haystack = normalizeArabic([
      item.record_id,
      item.sku,
      item.section_ar,
      item.item_name_ar,
      item.display_name_ar,
      item.category_ar,
      item.type_ar,
      item.unit_ar,
      item.notes_ar
    ].filter(Boolean).join(' '));

    return haystack.includes(query);
  }).slice(0, 50);
}

function baseItemsForRoot(rootDir, rootId) {
  const items = getMenuData(rootDir);
  const resolved = resolveRootId(rootId);

  if (resolved === 'bundles') {
    return items.filter(item => item.menu_root === 'bundles');
  }

  if (resolved === 'catering') {
    return items.filter(item => item.menu_root === 'catering');
  }

  if (resolved === 'frozen') {
    return items.filter(item => item.menu_root === 'frozen');
  }

  return [];
}

function mapStatusFilter(statusFilter = '') {
  const normalized = normalizeArabic(statusFilter);
  if (!normalized) return '';

  if (['ready', 'مطبوخ'].includes(normalized)) return 'ready';
  if (['raw', 'جاهز للطبخ', 'غير مطبوخ'].includes(normalized)) return 'raw';
  if (['frozen', 'مفرز'].includes(normalized)) return 'frozen';
  if (['made_to_order', 'حسب الطلب'].includes(normalized)) return 'made_to_order';

  return normalized;
}

function mapTypeFilter(typeValue = '') {
  const normalized = normalizeArabic(typeValue);
  if (!normalized) return '';

  if (['بلدي'].includes(normalized)) return 'بلدي';
  if (['روماني', 'رماني'].includes(normalized)) return 'روماني';
  if (['مستورد'].includes(normalized)) return 'مستورد';
  if (['دجاج'].includes(normalized)) return 'دجاج';

  return typeValue;
}

function statusMatches(item, statusFilter) {
  const wanted = mapStatusFilter(statusFilter);
  if (!wanted) return true;

  if (wanted === 'ready') return item.status === 'ready' || item.status === 'made_to_order';
  if (wanted === 'raw') return item.status === 'raw';
  if (wanted === 'frozen') return item.status === 'frozen';
  if (wanted === 'made_to_order') return item.status === 'made_to_order';

  return item.status === wanted;
}

export function getItemsForRoot(rootDir, filters = {}) {
  const filterObject = typeof filters === 'string'
    ? { rootId: filters }
    : { ...(filters || {}) };

  const rootId = resolveRootId(filterObject.rootId);
  let items = baseItemsForRoot(rootDir, rootId);

  if (filterObject.categoryFilter) {
    const wantedCategory = normalizeArabic(filterObject.categoryFilter);
    items = items.filter(item => normalizeArabic(item.category_ar) === wantedCategory);
  }

  if (filterObject.meatType) {
    const wantedType = normalizeArabic(mapTypeFilter(filterObject.meatType));
    items = items.filter(item => normalizeArabic(item.type_ar) === wantedType);
  }

  if (filterObject.statusFilter) {
    items = items.filter(item => statusMatches(item, filterObject.statusFilter));
  }

  return items;
}

export function getBotRoots(rootDir) {
  return ROOT_DEFINITIONS
    .map(root => ({
      ...root,
      count: baseItemsForRoot(rootDir, root.id).length
    }))
    .filter(root => root.count > 0);
}

export function getRootById(rootId) {
  const resolved = resolveRootId(rootId);
  return ROOT_DEFINITIONS.find(root => root.id === resolved) || null;
}

export function getRootCategoryOptions(rootDir, rootId, filters = {}) {
  const resolved = resolveRootId(rootId);
  const items = getItemsForRoot(rootDir, {
    rootId: resolved,
    statusFilter: filters.statusFilter,
    meatType: filters.meatType
  });

  const values = uniqueBy(
    items.filter(item => item.category_ar),
    item => item.category_ar
  ).map(item => item.category_ar);

  return sortByReference(values, CATEGORY_ORDER[resolved] || []).map(value => ({
    value,
    label: value,
    slug: slugify(value),
    count: items.filter(candidate => normalizeArabic(candidate.category_ar) === normalizeArabic(value)).length
  }));
}

export function getRootTypeOptions(rootDir, rootId, filters = {}) {
  const items = getItemsForRoot(rootDir, {
    rootId,
    categoryFilter: filters.categoryFilter,
    statusFilter: filters.statusFilter
  });

  const values = uniqueBy(
    items.filter(item => item.type_ar),
    item => item.type_ar
  ).map(item => item.type_ar);

  return sortByReference(values, TYPE_ORDER).map(value => ({
    value,
    label: value,
    slug: slugify(value),
    count: items.filter(candidate => normalizeArabic(candidate.type_ar) === normalizeArabic(value)).length
  }));
}

export function getRootStatusOptions(rootDir, rootId) {
  const items = baseItemsForRoot(rootDir, rootId);
  const ordered = uniqueBy(
    items.map(item => item.status).filter(Boolean),
    value => value
  );

  return ordered.map(status => ({
    value: status,
    label: STATUS_LABELS[status] || status,
    slug: slugify(status),
    count: items.filter(item => item.status === status).length
  }));
}

export function getDisplayUnit(item) {
  const unit = String(item?.unit_ar || '').trim();
  if (!unit) return 'وحدة';
  if (/دجاج/.test(unit)) return 'دجاجة';
  if (/كيلو/.test(unit)) return 'كيلو';
  if (/شخص/.test(unit)) return 'طلب';
  if (/حبه|حبات/.test(unit)) return 'حبة';
  if (/صحن/.test(unit)) return 'صحن';
  if (/300 ml/i.test(unit)) return '300 ml';
  if (/عرض/.test(unit)) return 'عرض';
  if (/خاروف/.test(unit) && !/نصف/.test(unit)) return 'خاروف';
  if (/نصف خاروف/.test(unit)) return 'نصف خاروف';
  if (/ضلعه|ضلعة/.test(normalizeArabic(unit))) return 'ضلعة';
  return unit;
}

export function getItemExtras(rootDir, item) {
  if (!item) return [];

  const items = getMenuData(rootDir);
  const title = `${item.display_name_ar || ''} ${item.item_name_ar || ''}`;
  const extras = [];

  if (/مسخن/.test(title)) {
    const bread = items.find(candidate =>
      /رغيف مسخن إضافي|رغيف مسخن اضافي/.test(candidate.display_name_ar || candidate.item_name_ar || '')
    );

    if (bread) {
      extras.push({
        id: bread.record_id,
        label: bread.display_name_ar || bread.item_name_ar,
        price: Number(bread.price_1_jod || 0)
      });
    }
  }

  if (/مفتول/.test(title)) {
    const vegetables = items.find(candidate =>
      /إضافة خضروات للمفتول|اضافه خضروات للمفتول/.test(candidate.display_name_ar || candidate.item_name_ar || '')
    );

    if (vegetables) {
      extras.push({
        id: vegetables.record_id,
        label: vegetables.display_name_ar || vegetables.item_name_ar,
        price: Number(vegetables.price_1_jod || 0)
      });
    }
  }

  return uniqueBy(extras, extra => extra.id);
}
