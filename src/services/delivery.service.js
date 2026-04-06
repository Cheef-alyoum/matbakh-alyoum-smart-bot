import path from 'node:path';
import { readJsonFile, slugify } from '../utils/core.js';

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value, fallback = '') {
  const result = value == null ? '' : String(value).trim();
  return result || fallback;
}

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

function zonesFile(rootDir) {
  return path.join(rootDir, 'data', 'delivery_zones.json');
}

function groupedZonesFile(rootDir) {
  return path.join(rootDir, 'data', 'delivery_zones_grouped.json');
}

function loadDeliveryZones(rootDir) {
  return safeArray(readJsonFile(zonesFile(rootDir), []))
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      zone_id: safeString(item.zone_id || item.id),
      zone_name_ar: safeString(item.zone_name_ar || item.zone_name || item.name_ar),
      zone_name_en: safeString(item.zone_name_en || item.name_en),
      zone_type: safeString(item.zone_type || item.type || 'منطقة'),
      sector_or_governorate: safeString(item.sector_or_governorate || item.sector || item.governorate || 'غير محدد'),
      delivery_fee_jod: Number(item.delivery_fee_jod || item.delivery_fee || 0),
      eta_minutes_min: Number(item.eta_minutes_min || item.eta_min || 0),
      eta_minutes_max: Number(item.eta_minutes_max || item.eta_max || 0)
    }))
    .filter(item => item.zone_id && item.zone_name_ar);
}

function buildGroupKey(group = {}) {
  const raw = safeString(group.group || group.title || group.sector_or_governorate || group.zone_type || 'group');
  return slugify(raw);
}

function normalizeGroupRecord(group = {}) {
  const zones = safeArray(group.zones)
    .filter(zone => zone && typeof zone === 'object')
    .map(zone => ({
      zone_id: safeString(zone.zone_id || zone.id),
      zone_name_ar: safeString(zone.zone_name_ar || zone.zone_name || zone.name_ar),
      zone_name_en: safeString(zone.zone_name_en || zone.name_en),
      zone_type: safeString(zone.zone_type || zone.type || 'منطقة'),
      sector_or_governorate: safeString(zone.sector_or_governorate || zone.sector || group.title || group.group || 'غير محدد'),
      delivery_fee_jod: Number(zone.delivery_fee_jod || zone.delivery_fee || 0),
      eta_minutes_min: Number(zone.eta_minutes_min || zone.eta_min || 0),
      eta_minutes_max: Number(zone.eta_minutes_max || zone.eta_max || 0)
    }))
    .filter(zone => zone.zone_id && zone.zone_name_ar);

  const title = safeString(group.title || group.group || group.sector_or_governorate || 'القطاع');
  const key = safeString(group.key || buildGroupKey(group), buildGroupKey(group));

  return {
    key,
    title,
    count: Number(group.count || zones.length || 0),
    zones
  };
}

function inferGroupsFromZones(zones = []) {
  const map = new Map();

  for (const zone of safeArray(zones)) {
    const title = safeString(zone.sector_or_governorate || zone.zone_type || 'القطاع');
    const key = slugify(title);

    if (!map.has(key)) {
      map.set(key, {
        key,
        title,
        zones: []
      });
    }

    map.get(key).zones.push(zone);
  }

  return [...map.values()]
    .map(group => ({
      ...group,
      count: group.zones.length
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.title.localeCompare(b.title, 'ar');
    });
}

function loadGroupedZones(rootDir) {
  const rawGroups = safeArray(readJsonFile(groupedZonesFile(rootDir), []))
    .filter(item => item && typeof item === 'object')
    .map(normalizeGroupRecord)
    .filter(group => group.key && group.title);

  if (rawGroups.length) {
    return rawGroups.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.title.localeCompare(b.title, 'ar');
    });
  }

  return inferGroupsFromZones(loadDeliveryZones(rootDir));
}

export function getDeliveryZones(rootDir) {
  return loadDeliveryZones(rootDir);
}

export function getDeliveryGroupList(rootDir) {
  return loadGroupedZones(rootDir);
}

export function getDeliveryGroupByKey(rootDir, key) {
  const wanted = slugify(key || '');
  if (!wanted) return null;

  return loadGroupedZones(rootDir).find(group => slugify(group.key) === wanted) || null;
}

export function getDeliveryZoneById(rootDir, zoneId) {
  const wanted = safeString(zoneId);
  if (!wanted) return null;

  return loadDeliveryZones(rootDir).find(zone => zone.zone_id === wanted) || null;
}

export function searchDeliveryZones(rootDir, q) {
  const query = normalizeArabic(q);
  const zones = loadDeliveryZones(rootDir);

  if (!query) return zones.slice(0, 50);

  return zones.filter(zone => {
    const haystack = normalizeArabic([
      zone.zone_id,
      zone.zone_name_ar,
      zone.zone_name_en,
      zone.zone_type,
      zone.sector_or_governorate
    ].filter(Boolean).join(' '));

    return haystack.includes(query);
  }).slice(0, 50);
}

export default {
  getDeliveryZones,
  getDeliveryGroupList,
  getDeliveryGroupByKey,
  getDeliveryZoneById,
  searchDeliveryZones
};
