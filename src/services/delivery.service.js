import path from 'node:path';
import { readJsonFile, slugify } from '../utils/core.js';

export function getDeliveryZones(rootDir) {
  return readJsonFile(path.join(rootDir, 'data', 'delivery_zones.json'), []);
}

export function getDeliveryZoneGroups(rootDir) {
  return readJsonFile(path.join(rootDir, 'data', 'delivery_zones_grouped.json'), []);
}

export function getDeliveryGroupList(rootDir) {
  return getDeliveryZoneGroups(rootDir).map(group => ({
    key: slugify(group.group),
    title: group.group,
    count: Array.isArray(group.zones) ? group.zones.length : 0
  }));
}

export function getDeliveryGroupByKey(rootDir, key) {
  return getDeliveryZoneGroups(rootDir).find(group => slugify(group.group) === slugify(key)) || null;
}

export function getDeliveryZoneById(rootDir, zoneId) {
  return getDeliveryZones(rootDir).find(zone => zone.zone_id === zoneId) || null;
}
