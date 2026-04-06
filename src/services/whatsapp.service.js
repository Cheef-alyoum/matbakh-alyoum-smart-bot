import path from 'node:path';
import { readJsonFile, normalizePhone } from '../utils/core.js';

const ROLE_LABELS = {
  super_admin: 'إدارة عليا',
  operations_admin: 'إدارة التشغيل',
  marketing_admin: 'إدارة التسويق',
  viewer_admin: 'مشاهدة فقط'
};

const ROLE_PERMISSIONS = {
  super_admin: [
    'admin.home',
    'admin.orders.view',
    'admin.orders.approve',
    'admin.orders.status',
    'admin.reports.view',
    'admin.campaigns.view',
    'admin.campaigns.manage',
    'admin.groups.view'
  ],
  operations_admin: [
    'admin.home',
    'admin.orders.view',
    'admin.orders.approve',
    'admin.orders.status',
    'admin.reports.view'
  ],
  marketing_admin: [
    'admin.home',
    'admin.campaigns.view',
    'admin.campaigns.manage',
    'admin.groups.view'
  ],
  viewer_admin: [
    'admin.home',
    'admin.reports.view'
  ]
};

function normalizeAdminPhone(phone) {
  return normalizePhone(phone).replace(/^\+/, '');
}

function uniqueByPhone(entries = []) {
  const map = new Map();

  for (const entry of entries) {
    if (!entry?.phone) continue;
    const normalizedPhone = normalizeAdminPhone(entry.phone);
    if (!normalizedPhone) continue;

    map.set(normalizedPhone, {
      ...entry,
      phone: normalizedPhone
    });
  }

  return [...map.values()];
}

function getRolesFilePath(rootDir, config = {}) {
  return path.join(rootDir, config.adminRolesFile || 'data/admin_roles.json');
}

function loadRawRoleEntries(rootDir, config = {}) {
  const fromFile = readJsonFile(getRolesFilePath(rootDir, config), []);
  const fileEntries = Array.isArray(fromFile) ? fromFile : [];
  const adminPhones = Array.isArray(config.adminPhones) ? config.adminPhones : [];

  const normalizedFileEntries = fileEntries
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      phone: normalizeAdminPhone(entry.phone),
      displayName: String(entry.displayName || '').trim() || 'إدارة',
      role: String(entry.role || 'super_admin').trim() || 'super_admin',
      enabled: entry.enabled !== false,
      permissions: Array.isArray(entry.permissions) ? entry.permissions : [],
      notes: String(entry.notes || '').trim()
    }))
    .filter(entry => entry.phone);

  const fallbackEntries = adminPhones.map(phone => ({
    phone: normalizeAdminPhone(phone),
    displayName: 'إدارة',
    role: 'super_admin',
    enabled: true,
    permissions: [],
    notes: 'Fallback from config.app.json'
  }));

  return uniqueByPhone([...normalizedFileEntries, ...fallbackEntries]);
}

function buildProfile(entry) {
  if (!entry) return null;

  const basePermissions = ROLE_PERMISSIONS[entry.role] || [];
  const customPermissions = Array.isArray(entry.permissions) ? entry.permissions : [];

  return {
    phone: entry.phone,
    displayName: entry.displayName || 'إدارة',
    role: entry.role || 'super_admin',
    roleLabel: ROLE_LABELS[entry.role] || entry.role || 'إدارة',
    enabled: entry.enabled !== false,
    permissions: [...new Set([...basePermissions, ...customPermissions])],
    notes: entry.notes || ''
  };
}

export function profileCan(profile, permission) {
  if (!profile || profile.enabled === false) return false;
  if (!permission) return true;
  return profile.permissions.includes(permission) || profile.permissions.includes('*');
}

export function getAdminProfile(rootDir, phone, config = {}) {
  const normalizedPhone = normalizeAdminPhone(phone);
  if (!normalizedPhone) return null;

  const entries = loadRawRoleEntries(rootDir, config);
  const match = entries.find(entry => entry.phone === normalizedPhone && entry.enabled !== false);

  return buildProfile(match);
}

export function isAdminAuthorized(rootDir, phone, config = {}) {
  return Boolean(getAdminProfile(rootDir, phone, config));
}

export function adminCan(rootDir, phone, permission, config = {}) {
  return profileCan(getAdminProfile(rootDir, phone, config), permission);
}

export function getActiveAdminPhones(rootDir, config = {}) {
  return loadRawRoleEntries(rootDir, config)
    .filter(entry => entry.enabled !== false)
    .map(entry => entry.phone);
}

export default {
  getAdminProfile,
  isAdminAuthorized,
  adminCan,
  getActiveAdminPhones,
  profileCan
};
