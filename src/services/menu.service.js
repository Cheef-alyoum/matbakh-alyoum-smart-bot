import path from 'node:path';
import { readJsonFile, slugify } from '../utils/core.js';

const ROOT_DEFINITIONS = [
  { id: 'meat', title: 'أطباق لحوم', description: 'بلدي أو روماني', kind: 'hierarchy' },
  { id: 'chicken', title: 'أطباق دجاج', description: 'وجبات الدجاج', kind: 'hierarchy' },
  { id: 'mahashi', title: 'عالم المحاشي', description: 'مطبوخ أو جاهز', kind: 'hierarchy' },
  { id: 'yalangi', title: 'عالم اليالنجي', description: 'مطبوخ أو جاهز', kind: 'hierarchy' },
  { id: 'maftoul', title: 'عالم المفتول', description: 'مفتول وإضافاته', kind: 'hierarchy' },
  { id: 'individual', title: 'أطباق نفرات', description: 'صحن لشخصين', kind: 'direct' },
  { id: 'salads', title: 'السلطات', description: 'أطباق جانبية', kind: 'direct' },
  { id: 'soups', title: 'الشوربات', description: 'كاسات 300 مل', kind: 'direct' },
  { id: 'fried', title: 'المقالي', description: 'مقليات جاهزة', kind: 'direct' },
  { id: 'frozen', title: 'المفرزات', description: 'مفرزات جاهزة', kind: 'direct' },
  { id: 'bundles', title: 'العروض', description: 'عروض مجمعة', kind: 'direct' },
  { id: 'catering', title: 'الولائم', description: 'طلبات كبيرة', kind: 'hierarchy' }
];

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
  return [...map.entries()].map(([section_ar, items]) => ({ section_ar, count: items.length, slug: slugify(section_ar), items }));
}

export function getSectionBySlug(rootDir, sectionSlug) {
  return getSections(rootDir).find(section => section.slug === slugify(sectionSlug)) || null;
}

export function getItemsBySection(rootDir, sectionName) {
  return getMenuData(rootDir).filter(item => item.section_ar === sectionName);
}

export function getMenuItemById(rootDir, itemId) {
  return getMenuData(rootDir).find(item => item.record_id === itemId || item.id === itemId || item.sku === itemId) || null;
}

export function searchMenu(rootDir, q) {
  const query = String(q || '').trim();
  const items = getMenuData(rootDir);
  if (!query) return items.slice(0, 20);
  return items.filter(item => JSON.stringify(item).includes(query)).slice(0, 50);
}

export function getBotRoots(rootDir) {
  const items = getMenuData(rootDir);
  const counts = {
    meat: items.filter(item => item.section_ar === 'الأطباق الرئيسية' && /لحم/.test(item.category_ar || '')).length,
    chicken: items.filter(item => item.section_ar === 'الأطباق الرئيسية' && item.category_ar === 'على الدجاج').length,
    mahashi: items.filter(item => item.section_ar === 'عالم المحاشي').length,
    yalangi: items.filter(item => item.section_ar === 'عالم اليالنجي').length,
    maftoul: items.filter(item => item.section_ar === 'عالم المفتول').length,
    individual: items.filter(item => item.section_ar === 'أطباق نفرات').length,
    salads: items.filter(item => item.section_ar === 'السلطات').length,
    soups: items.filter(item => item.section_ar === 'الشوربات').length,
    fried: items.filter(item => item.section_ar === 'المقالي').length,
    frozen: items.filter(item => item.section_ar === 'المفرزات').length,
    bundles: items.filter(item => item.section_ar === 'العروض المجمعة').length,
    catering: items.filter(item => item.section_ar === 'ولائم ومحاشي الذبائح').length
  };
  return ROOT_DEFINITIONS.map(root => ({ ...root, count: counts[root.id] || 0 })).filter(root => root.count > 0);
}

export function getItemsForRoot(rootDir, rootId) {
  const items = getMenuData(rootDir);
  switch (rootId) {
    case 'meat':
      return items.filter(item => item.section_ar === 'الأطباق الرئيسية' && /لحم/.test(item.category_ar || ''));
    case 'chicken':
      return items.filter(item => item.section_ar === 'الأطباق الرئيسية' && item.category_ar === 'على الدجاج');
    case 'mahashi':
      return items.filter(item => item.section_ar === 'عالم المحاشي');
    case 'yalangi':
      return items.filter(item => item.section_ar === 'عالم اليالنجي');
    case 'maftoul':
      return items.filter(item => item.section_ar === 'عالم المفتول');
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

export function getItemExtras(rootDir, item) {
  if (!item) return [];
  const items = getMenuData(rootDir);
  const title = `${item.display_name_ar || ''} ${item.item_name_ar || ''}`;
  const extras = [];
  if (/مسخن/.test(title)) {
    const bread = items.find(candidate => /رغيف مسخن إضافي/.test(candidate.display_name_ar || candidate.item_name_ar || ''));
    if (bread) extras.push(bread);
  }
  if (/مفتول/.test(title)) {
    const vegetables = items.find(candidate => /إضافة خضروات للمفتول/.test(candidate.display_name_ar || candidate.item_name_ar || ''));
    const soup = items.find(candidate => /شوربة المفتول/.test(candidate.display_name_ar || candidate.item_name_ar || ''));
    if (vegetables) extras.push(vegetables);
    if (soup) extras.push(soup);
  }
  return extras;
}
