import path from 'node:path';
import { readJsonFile } from '../utils/core.js';

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
  return [...map.entries()].map(([section_ar, items]) => ({ section_ar, count: items.length, items }));
}

export function searchMenu(rootDir, q) {
  const query = String(q || '').trim();
  const items = getMenuData(rootDir);
  if (!query) return items.slice(0, 20);
  return items.filter(item => JSON.stringify(item).includes(query)).slice(0, 50);
}
