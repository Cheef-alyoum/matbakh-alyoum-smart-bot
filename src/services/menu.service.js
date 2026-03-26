import path from 'node:path';
import { readJsonFile, slugify } from '../utils/core.js';

const ROOT_DEFINITIONS = [
  { id: 'chicken', title: 'قسم الدجاج', description: 'أطباق على الدجاج', kind: 'hierarchy' },
  { id: 'meat', title: 'قسم اللحوم', description: 'بلدي أو روماني', kind: 'hierarchy' },
  { id: 'mahashi', title: 'عالم المحاشي', description: 'مطبوخ أو جاهز للطبخ', kind: 'hierarchy' },
  { id: 'yalangi', title: 'عالم اليالنجي', description: 'مطبوخ أو جاهز للطبخ', kind: 'hierarchy' },
  { id: 'maftoul', title: 'عالم المفتول', description: 'مفتول وإضافاته', kind: 'hierarchy' },
  { id: 'individual', title: 'أطباق النفرات', description: 'طلبات شخصين', kind: 'direct' },
  { id: 'salads', title: 'السلطات', description: 'أطباق جانبية', kind: 'direct' },
  { id: 'soups', title: 'الشوربات', description: '300 مل', kind: 'direct' },
  { id: 'fried', title: 'المقالي', description: 'مقليات جاهزة', kind: 'direct' },
  { id: 'frozen', title: 'المفرزات', description: 'مفرزات جاهزة', kind: 'direct' },
  { id: 'bundles', title: 'العروض', description: 'عروض مجمعة', kind: 'hierarchy' },
  { id: 'catering', title: 'الولائم', description: 'خاروف أو نصف أو ضلعة', kind: 'hierarchy' }
];

const ROOT_ALIASES = {
  main_chicken: 'chicken',
  chicken: 'chicken',
  main_meat: 'meat',
  meat: 'meat',
  mahashi: 'mahashi',
  yalangi: 'yalangi',
  maftoul: 'maftoul',
  individual: 'individual',
  salads: 'salads',
  soups: 'soups',
  fried: 'fried',
  frozen: 'frozen',
  bundles: 'bundles',
  catering: 'catering'
};

const STATUS_LABELS = {
  ready: 'مطبوخ',
  raw: 'جاهز للطبخ',
  frozen: 'مفرز',
  made_to_order: 'حسب الطلب',
  bundle: 'عرض'
};

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
  const items = getMenuData(rootDir);
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
  const items = getMenuData(rootDir);
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

  switch (resolved) {
    case 'chicken':
      return items.filter(item =>
        item.section_ar === 'الأطباق الرئيسية' &&
        item.category_ar === 'على الدجاج' &&
        item.type_ar === 'دجاج'
      );
    case 'meat':
      return items.filter(item =>
        item.section_ar === 'الأطباق الرئيسية' &&
        (
          /لحم/.test(item.category_ar || '') ||
          item.category_ar === 'أطباق باللحم'
        )
      );
    case 'mahashi':
      return items.filter(item => item.section_ar === 'عالم المحاشي');
    case 'yalangi':
      return items.filter(item => item.section_ar === 'عالم اليالنجي');
    case 'maftoul':
      return items.filter(item => item.section_ar === 'عالم المفتول' && item.unit_ar !== 'إضافة');
    case 'individual':
      return items.filter(item => item.section_ar === 'أطباق نفرات');
    case 'salads':
      return items.filter(item => item.section_ar === 'السلطات');
    case 'soups':
      return items.filter(item => item.section_ar === 'الشوربات');
    case 'fried':
      return items.filter(item => item.section_ar === 'المقالي');
    case 'frozen':
      return items.filter(item => item.section_ar === 'المفرزات');
    case 'bundles':
      return items.filter(item => item.section_ar === 'العروض المجمعة');
    case 'catering':
      return items.filter(item => item.section_ar === 'ولائم ومحاشي الذبائح');
    default:
      return [];
  }
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

function statusMatches(item, statusFilter, rootId) {
  const wanted = mapStatusFilter(statusFilter);
  if (!wanted) return true;
  const resolved = resolveRootId(rootId);

  if (wanted === 'ready') {
    return item.status === 'ready' || (resolved === 'chicken' || resolved === 'meat' || resolved === 'individual' || resolved === 'catering' ? item.status === 'made_to_order' : false);
  }

  if (wanted === 'raw') return item.status === 'raw';
  if (wanted === 'frozen') return item.status === 'frozen';
  if (wanted === 'made_to_order') return item.status === 'made_to_order';
  return item.status === wanted;
}

export function getItemsForRoot(rootDir, filters = {}) {
  const filterObject = typeof filters === 'string' ? { rootId: filters } : { ...(filters || {}) };
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
    items = items.filter(item => statusMatches(item, filterObject.statusFilter, rootId));
  }

  return items;
}

export function getBotRoots(rootDir) {
  return ROOT_DEFINITIONS
    .map(root => ({ ...root, count: baseItemsForRoot(rootDir, root.id).length }))
    .filter(root => root.count > 0);
}

export function getRootById(rootId) {
  const resolved = resolveRootId(rootId);
  return ROOT_DEFINITIONS.find(root => root.id === resolved) || null;
}

export function getRootCategoryOptions(rootDir, rootId, filters = {}) {
  const items = getItemsForRoot(rootDir, { rootId, statusFilter: filters.statusFilter, meatType: filters.meatType });
  return uniqueBy(items.filter(item => item.category_ar), item => item.category_ar).map(item => ({
    value: item.category_ar,
    label: item.category_ar,
    slug: slugify(item.category_ar),
    count: items.filter(candidate => candidate.category_ar === item.category_ar).length
  }));
}

export function getRootTypeOptions(rootDir, rootId, filters = {}) {
  const items = getItemsForRoot(rootDir, { rootId, categoryFilter: filters.categoryFilter, statusFilter: filters.statusFilter });
  return uniqueBy(items.filter(item => item.type_ar), item => item.type_ar).map(item => ({
    value: item.type_ar,
    label: item.type_ar,
    slug: slugify(item.type_ar),
    count: items.filter(candidate => candidate.type_ar === item.type_ar).length
  }));
}

export function getRootStatusOptions(rootDir, rootId) {
  const items = baseItemsForRoot(rootDir, rootId);
  const ordered = uniqueBy(items.map(item => item.status).filter(Boolean), value => value);
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
  if (/عرض/.test(unit)) return 'عرض';
  if (/خاروف/.test(unit)) return 'خاروف';
  if (/نصف خاروف/.test(unit)) return 'نصف خاروف';
  if (/ضلعه/.test(normalizeArabic(unit))) return 'ضلعة';
  return unit;
}

export function getItemExtras(rootDir, item) {
  if (!item) return [];
  const items = getMenuData(rootDir);
  const title = `${item.display_name_ar || ''} ${item.item_name_ar || ''}`;
  const extras = [];

  if (/مسخن/.test(title)) {
    const bread = items.find(candidate => /رغيف مسخن إضافي|رغيف مسخن اضافي/.test(candidate.display_name_ar || candidate.item_name_ar || ''));
    if (bread) extras.push({
      id: bread.record_id,
      label: bread.display_name_ar || bread.item_name_ar,
      price: Number(bread.price_1_jod || 0)
    });
  }

  if (/مفتول/.test(title)) {
    const vegetables = items.find(candidate => /إضافة خضروات للمفتول|اضافه خضروات للمفتول/.test(candidate.display_name_ar || candidate.item_name_ar || ''));
    const soup = items.find(candidate => /شوربة المفتول|شوربه المفتول/.test(candidate.display_name_ar || candidate.item_name_ar || ''));
    if (vegetables) {
      extras.push({
        id: vegetables.record_id,
        label: vegetables.display_name_ar || vegetables.item_name_ar,
        price: Number(vegetables.price_1_jod || 0)
      });
    }
    if (soup) {
      extras.push({
        id: soup.record_id,
        label: soup.display_name_ar || soup.item_name_ar,
        price: Number(soup.price_1_jod || 0)
      });
    }
  }

  if (/مع اضافات|مع إضافات/.test(title)) {
    const candidateExtras = items.filter(candidate =>
      candidate.section_ar === item.section_ar &&
      candidate.category_ar === 'إضافات'
    );
    for (const extra of candidateExtras) {
      extras.push({
        id: extra.record_id,
        label: extra.display_name_ar || extra.item_name_ar,
        price: Number(extra.price_1_jod || 0)
      });
    }
  }

  return uniqueBy(extras, extra => extra.id);
}
