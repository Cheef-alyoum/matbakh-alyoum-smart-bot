import crypto from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../utils/core.js';
import {
  deleteRows,
  insertRows,
  isSupabaseEnabled,
  patchRows,
  selectRows,
  upsertRow
} from './supabase.service.js';
import { trackOrderStatusChanged } from './meta-capi.service.js';

const STORAGE_FILES = {
  orders: 'orders.json',
  leads: 'leads.json',
  messages: 'messages.json',
  customers: 'customers.json',
  sessions: 'sessions.json'
};

const TERMINAL_STATUSES = ['delivered', 'cancelled', 'rejected', 'customer_exit'];

function storagePath(rootDir, key) {
  return path.join(rootDir, 'storage', STORAGE_FILES[key]);
}

function readCollection(rootDir, key) {
  return readJsonFile(storagePath(rootDir, key), []);
}

function writeCollection(rootDir, key, items) {
  return writeJsonFile(storagePath(rootDir, key), items);
}

function nowIso() {
  return new Date().toISOString();
}

function consentFlags(consentStatus = 'service_only') {
  return {
    consent_status: consentStatus,
    marketing_opt_in: consentStatus === 'marketing_opt_in'
  };
}

function jordanDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Amman',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value || 0);
  const month = Number(parts.find(part => part.type === 'month')?.value || 0);
  const day = Number(parts.find(part => part.type === 'day')?.value || 0);

  if (!year || !month || !day) return null;
  return { year, month, day };
}

function jordanDayKey(value = new Date()) {
  const parts = jordanDateParts(value);
  if (!parts) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function jordanDayNumber(value = new Date()) {
  const parts = jordanDateParts(value);
  if (!parts) return null;
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
}

function isWithinJordanPeriod(value, period = 'today', referenceDate = new Date()) {
  const item = jordanDateParts(value);
  const ref = jordanDateParts(referenceDate);

  if (!item || !ref) return false;

  if (period === 'today') {
    return item.year === ref.year && item.month === ref.month && item.day === ref.day;
  }

  if (period === 'month') {
    return item.year === ref.year && item.month === ref.month;
  }

  if (period === 'week') {
    const itemNumber = jordanDayNumber(value);
    const refNumber = jordanDayNumber(referenceDate);
    if (itemNumber == null || refNumber == null) return false;
    const diff = refNumber - itemNumber;
    return diff >= 0 && diff <= 6;
  }

  return false;
}

function isDuplicateIdError(error) {
  return (
    error?.status === 409 &&
    (
      error?.payload?.code === '23505' ||
      /duplicate key value/i.test(String(error?.message || ''))
    )
  );
}

function normalizeOrderRow(order, customerId = null) {
  return {
    id: order.id,
    customer_id: order.customerId || customerId || null,
    customer_name: order.customerName || order.customer_name || null,
    phone: order.phone,
    status: order.status,
    status_label_ar: order.statusLabelAr || order.status_label_ar || 'قيد المراجعة',
    delivery_type: order.deliveryType || order.delivery_type || 'delivery',
    delivery_day: order.deliveryDay || order.delivery_day || null,
    delivery_slot: order.deliverySlot || order.delivery_slot || null,
    delivery_sector: order.deliverySector || order.delivery_sector || null,
    delivery_zone_id: order.deliveryZoneId || order.delivery_zone_id || null,
    delivery_zone_name: order.deliveryZoneName || order.delivery_zone_name || null,
    payment_method: order.paymentMethod || order.payment_method || 'cash',
    payment_status: order.paymentStatus || order.payment_status || 'pending',
    address_text: order.address || order.address_text || null,
    order_notes: order.notes || order.order_notes || null,
    admin_notes: order.adminNotes || order.admin_notes || null,
    subtotal_jod: Number(order.subtotalJod || order.subtotal_jod || 0),
    delivery_fee_jod: Number(order.deliveryFeeJod || order.delivery_fee_jod || 0),
    total_jod: Number(order.totalJod || order.total_jod || 0),
    approved_by_phone: order.approvedByPhone || order.approved_by_phone || null,
    approved_at: order.approvedAt || order.approved_at || null,
    created_at: order.createdAt || order.created_at || nowIso(),
    updated_at: order.updatedAt || order.updated_at || nowIso()
  };
}

function normalizeOrderItems(order) {
  return (order.items || []).map(item => {
    const sourceMenuId = item.id || item.record_id || null;
    const notesParts = [
      item.notes || null,
      sourceMenuId ? `source_menu_id:${sourceMenuId}` : null
    ].filter(Boolean);

    return {
      order_id: order.id,
      menu_item_id: null,
      display_name_ar: item.display_name_ar || item.displayNameAr || item.name || 'صنف',
      quantity: Number(item.quantity || 1),
      unit_ar: item.unit_ar || item.unit || null,
      unit_price_jod: Number(item.price_1_jod || item.price || 0),
      line_total_jod: Number(item.lineTotalJod || item.line_total_jod || item.total || 0),
      notes: notesParts.length ? notesParts.join(' | ') : null
    };
  });
}

async function upsertCustomerInternal(rootDir, payload) {
  const row = {
    phone: payload.phone,
    full_name: payload.fullName || payload.full_name || null,
    preferred_language: payload.preferredLanguage || payload.preferred_language || 'ar',
    notes: payload.notes || null,
    tags: payload.tags || undefined,
    ...consentFlags(payload.consentStatus || payload.consent_status || 'service_only')
  };

  if (isSupabaseEnabled()) {
    return upsertRow('customers', row, { onConflict: 'phone' });
  }

  const customers = readCollection(rootDir, 'customers');
  const index = customers.findIndex(item => item.phone === row.phone);

  const record = {
    id: customers[index]?.id || crypto.randomUUID(),
    ...customers[index],
    ...row,
    updated_at: nowIso(),
    created_at: customers[index]?.created_at || nowIso()
  };

  if (index === -1) {
    customers.unshift(record);
  } else {
    customers[index] = record;
  }

  writeCollection(rootDir, 'customers', customers);
  return record;
}

export async function getCustomerByPhone(rootDir, phone) {
  if (!phone) return null;

  if (isSupabaseEnabled()) {
    const rows = await selectRows('customers', { phone }, { limit: 1 });
    return rows[0] || null;
  }

  const customers = readCollection(rootDir, 'customers');
  return customers.find(item => item.phone === phone) || null;
}

export async function upsertCustomer(rootDir, payload) {
  return upsertCustomerInternal(rootDir, payload);
}

export async function getConversationSession(rootDir, phone) {
  if (!phone) return null;

  if (isSupabaseEnabled()) {
    const rows = await selectRows('conversation_sessions', { phone }, { limit: 1 });
    return rows[0] || null;
  }

  const sessions = readCollection(rootDir, 'sessions');
  return sessions.find(item => item.phone === phone) || null;
}

export async function setConversationSession(rootDir, phone, payload = {}) {
  const row = {
    phone,
    current_state: payload.current_state || payload.currentState || 'idle',
    preferred_language: payload.preferred_language || payload.preferredLanguage || 'ar',
    consent_status: payload.consent_status || payload.consentStatus || 'pending',
    last_menu_section: payload.last_menu_section || payload.lastMenuSection || null,
    session_data: payload.session_data || payload.sessionData || {},
    last_order_id: payload.last_order_id || payload.lastOrderId || null,
    last_interaction_at: nowIso()
  };

  if (isSupabaseEnabled()) {
    return upsertRow('conversation_sessions', row, { onConflict: 'phone' });
  }

  const sessions = readCollection(rootDir, 'sessions');
  const index = sessions.findIndex(item => item.phone === phone);

  const record = {
    id: sessions[index]?.id || `${Date.now()}-${phone}`,
    ...sessions[index],
    ...row,
    created_at: sessions[index]?.created_at || nowIso()
  };

  if (index === -1) {
    sessions.unshift(record);
  } else {
    sessions[index] = record;
  }

  writeCollection(rootDir, 'sessions', sessions);
  return record;
}

export async function createOrder(rootDir, order) {
  const customer = await upsertCustomerInternal(rootDir, {
    phone: order.phone,
    fullName: order.customerName,
    preferredLanguage: order.preferredLanguage || 'ar',
    consentStatus: order.consentStatus || 'service_only',
    tags: order.customerTags || undefined
  });

  if (isSupabaseEnabled()) {
    let currentOrder = { ...order };
    let attempts = 0;
    let lastError = null;

    while (attempts < 5) {
      try {
        const orderRow = normalizeOrderRow(currentOrder, customer?.id || null);
        const insertedOrder = await insertRows('orders', orderRow);
        const items = normalizeOrderItems(currentOrder);

        if (items.length) {
          await insertRows('order_items', items, { returnMinimal: true });
        }

        return Array.isArray(insertedOrder) ? insertedOrder[0] : insertedOrder;
      } catch (error) {
        lastError = error;

        if (!isDuplicateIdError(error)) {
          throw error;
        }

        attempts += 1;

        console.warn('ORDER_ID_CONFLICT_RETRY', {
          attempt: attempts,
          previousId: currentOrder.id,
          message: error?.message || null,
          payload: error?.payload || null
        });

        currentOrder = {
          ...currentOrder,
          id: await generateNextOrderCode(rootDir),
          updatedAt: nowIso()
        };
      }
    }

    throw lastError;
  }

  const orders = readCollection(rootDir, 'orders');
  const localRecord = {
    ...order,
    customerId: customer?.id || null
  };

  orders.unshift(localRecord);
  writeCollection(rootDir, 'orders', orders);
  return localRecord;
}

export async function replaceOrder(rootDir, orderId, order) {
  if (isSupabaseEnabled()) {
    const updated = await patchRows(
      'orders',
      { id: orderId },
      normalizeOrderRow(order, order.customerId || null)
    );

    await deleteRows('order_items', { order_id: orderId });

    const items = normalizeOrderItems(order);
    if (items.length) {
      await insertRows('order_items', items, { returnMinimal: true });
    }

    return updated;
  }

  const orders = readCollection(rootDir, 'orders');
  const index = orders.findIndex(item => item.id === orderId);

  if (index === -1) return null;

  orders[index] = {
    ...orders[index],
    ...order,
    updatedAt: nowIso()
  };

  writeCollection(rootDir, 'orders', orders);
  return orders[index];
}

export async function getOrderById(rootDir, orderId) {
  if (isSupabaseEnabled()) {
    const rows = await selectRows('orders', { id: orderId }, { limit: 1 });
    return rows[0] || null;
  }

  const orders = readCollection(rootDir, 'orders');
  return orders.find(item => item.id === orderId) || null;
}

export async function getOrderItems(rootDir, orderId) {
  if (isSupabaseEnabled()) {
    return selectRows(
      'order_items',
      { order_id: orderId },
      { orderBy: 'created_at', ascending: true, limit: 100 }
    );
  }

  const orders = readCollection(rootDir, 'orders');
  return orders.find(item => item.id === orderId)?.items || [];
}

export async function findOrdersByPhone(rootDir, phone) {
  if (isSupabaseEnabled()) {
    return selectRows(
      'orders',
      { phone },
      { orderBy: 'created_at', ascending: false, limit: 200 }
    );
  }

  const orders = readCollection(rootDir, 'orders');

  return orders
    .filter(item => item.phone === phone)
    .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
}

export async function getOrdersByStatus(rootDir, status, limit = 20) {
  if (isSupabaseEnabled()) {
    return selectRows(
      'orders',
      { status },
      { orderBy: 'created_at', ascending: false, limit }
    );
  }

  const orders = readCollection(rootDir, 'orders');
  return orders.filter(item => item.status === status).slice(0, limit);
}

export async function getAllOrders(rootDir, limit = 5000) {
  if (isSupabaseEnabled()) {
    return selectRows('orders', {}, { orderBy: 'created_at', ascending: false, limit });
  }

  return readCollection(rootDir, 'orders')
    .sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0))
    .slice(0, limit);
}

export async function getAllCustomers(rootDir, limit = 5000) {
  if (isSupabaseEnabled()) {
    return selectRows('customers', {}, { orderBy: 'created_at', ascending: false, limit });
  }

  return readCollection(rootDir, 'customers')
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

export async function getAllMessages(rootDir, limit = 5000) {
  if (isSupabaseEnabled()) {
    return selectRows('messages_log', {}, { orderBy: 'created_at', ascending: false, limit });
  }

  return readCollection(rootDir, 'messages')
    .sort((a, b) => {
      const bTs = b.created_at || b.createdAt || b.receivedAt || 0;
      const aTs = a.created_at || a.createdAt || a.receivedAt || 0;
      return new Date(bTs) - new Date(aTs);
    })
    .slice(0, limit);
}

export async function getOperationalReport(rootDir, period = 'today') {
  const [orders, messages] = await Promise.all([
    getAllOrders(rootDir, 5000),
    getAllMessages(rootDir, 10000)
  ]);

  const filteredOrders = orders.filter(order =>
    isWithinJordanPeriod(order.created_at || order.createdAt, period)
  );

  const filteredMessages = messages.filter(message =>
    isWithinJordanPeriod(message.created_at || message.createdAt || message.receivedAt, period)
  );

  const ordersByStatus = {
    awaiting_admin_review: 0,
    awaiting_customer_edit: 0,
    approved: 0,
    preparing: 0,
    ready: 0,
    out_for_delivery: 0,
    delivered: 0,
    rejected: 0
  };

  for (const order of filteredOrders) {
    const status = order.status;
    if (Object.prototype.hasOwnProperty.call(ordersByStatus, status)) {
      ordersByStatus[status] += 1;
    }
  }

  const deliveredSales = filteredOrders
    .filter(order => order.status === 'delivered')
    .reduce((sum, order) => sum + Number(order.total_jod || order.totalJod || 0), 0);

  const phoneMap = new Map();

  for (const message of filteredMessages) {
    const phone = String(message.phone || message.from || message.to || '').trim();
    if (!phone) continue;

    if (!phoneMap.has(phone)) {
      phoneMap.set(phone, {
        phone,
        total: 0,
        inbound: 0,
        outbound: 0,
        last_at: null
      });
    }

    const entry = phoneMap.get(phone);
    entry.total += 1;

    if ((message.direction || '').toLowerCase() === 'inbound') {
      entry.inbound += 1;
    }

    if ((message.direction || '').toLowerCase() === 'outbound') {
      entry.outbound += 1;
    }

    const ts = message.created_at || message.createdAt || message.receivedAt || null;
    if (ts && (!entry.last_at || new Date(ts) > new Date(entry.last_at))) {
      entry.last_at = ts;
    }
  }

  const phones = [...phoneMap.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return String(b.last_at || '').localeCompare(String(a.last_at || ''));
  });

  const inboundCount = filteredMessages.filter(
    item => (item.direction || '').toLowerCase() === 'inbound'
  ).length;

  const outboundCount = filteredMessages.filter(
    item => (item.direction || '').toLowerCase() === 'outbound'
  ).length;

  return {
    period,
    day_key_jordan: jordanDayKey(new Date()),
    orders: {
      total: filteredOrders.length,
      ...ordersByStatus,
      delivered_sales_jod: deliveredSales
    },
    messages: {
      total: filteredMessages.length,
      inbound: inboundCount,
      outbound: outboundCount,
      unique_phones: phones.length,
      phones
    }
  };
}

export async function getCampaignAudiencePreview(rootDir, groupKey = 'all') {
  const [customers, orders] = await Promise.all([
    getAllCustomers(rootDir, 5000),
    getAllOrders(rootDir, 5000)
  ]);

  const audience = new Map();

  function ensurePhone(phone) {
    const normalized = String(phone || '').trim();
    if (!normalized) return null;

    if (!audience.has(normalized)) {
      audience.set(normalized, {
        phone: normalized,
        orders_count: 0,
        total_spent_jod: 0,
        last_order_at: null,
        last_zone_name: null
      });
    }

    return audience.get(normalized);
  }

  for (const customer of customers) {
    ensurePhone(customer.phone);
  }

  for (const order of orders) {
    const entry = ensurePhone(order.phone);
    if (!entry) continue;

    entry.orders_count += 1;
    entry.total_spent_jod += Number(order.total_jod || order.totalJod || 0);

    const orderTs = order.created_at || order.createdAt || null;
    if (orderTs && (!entry.last_order_at || new Date(orderTs) > new Date(entry.last_order_at))) {
      entry.last_order_at = orderTs;
    }

    if (order.delivery_zone_name) {
      entry.last_zone_name = order.delivery_zone_name;
    }
  }

  const all = [...audience.values()];
  const now = Date.now();
  const inactiveAfterDays = 30;

  const grouped = {
    all,
    returning: all.filter(item => item.orders_count >= 2),
    new: all.filter(item => item.orders_count === 1),
    inactive: all.filter(item =>
      item.last_order_at &&
      ((now - new Date(item.last_order_at).getTime()) / 86400000) > inactiveAfterDays
    ),
    value: all.filter(item => item.total_spent_jod >= 25)
  };

  const zonesMap = new Map();

  for (const item of all) {
    const zone = item.last_zone_name || 'غير محدد';
    zonesMap.set(zone, (zonesMap.get(zone) || 0) + 1);
  }

  const zones = [...zonesMap.entries()]
    .map(([zone, count]) => ({ zone, count }))
    .sort((a, b) => b.count - a.count);

  const labels = {
    all: 'جميع العملاء',
    returning: 'العملاء المتكررون',
    new: 'العملاء الجدد',
    inactive: 'العملاء غير النشطين',
    value: 'العملاء الأعلى إنفاقًا',
    zone: 'حسب المنطقة'
  };

  if (groupKey === 'zone') {
    return {
      groupKey,
      label: labels[groupKey],
      count: all.length,
      phones: all.map(item => item.phone),
      zones
    };
  }

  const selected = grouped[groupKey] || all;

  return {
    groupKey,
    label: labels[groupKey] || groupKey,
    count: selected.length,
    phones: selected.map(item => item.phone),
    sample: selected.slice(0, 20)
  };
}

export async function getLatestOpenOrderByPhone(rootDir, phone) {
  const orders = await findOrdersByPhone(rootDir, phone);
  return orders.find(order => !TERMINAL_STATUSES.includes(order.status)) || null;
}

export async function updateOrderStatus(rootDir, orderId, status, statusLabelAr, extra = {}) {
  const before = await getOrderById(rootDir, orderId);
  if (!before) return null;

  let updated = null;

  if (isSupabaseEnabled()) {
    updated = await patchRows('orders', { id: orderId }, {
      status,
      status_label_ar: statusLabelAr,
      approved_by_phone: extra.approvedByPhone || undefined,
      approved_at: extra.approvedAt || undefined,
      admin_notes: extra.adminNotes || undefined,
      updated_at: nowIso()
    });
  } else {
    const orders = readCollection(rootDir, 'orders');
    const index = orders.findIndex(order => order.id === orderId);

    if (index === -1) return null;

    orders[index].status = status;
    orders[index].statusLabelAr = statusLabelAr;
    orders[index].updatedAt = nowIso();

    if (extra.adminNotes) orders[index].adminNotes = extra.adminNotes;
    if (extra.approvedByPhone) orders[index].approvedByPhone = extra.approvedByPhone;
    if (extra.approvedAt) orders[index].approvedAt = extra.approvedAt;

    writeCollection(rootDir, 'orders', orders);
    updated = orders[index];
  }

  const previousStatus = String(before?.status || '').trim();
  const currentStatus = String(updated?.status || status || '').trim();

  if (updated && currentStatus && currentStatus !== previousStatus) {
    const metaResult = await trackOrderStatusChanged(
      { site: { baseUrl: process.env.BASE_URL || 'https://matbakh-alyoum.site' } },
      {
        order: updated,
        status: currentStatus,
        actionSource: 'system_generated',
        eventSourceUrl: `${process.env.BASE_URL || 'https://matbakh-alyoum.site'}/track.html`,
        userData: {
          phone: updated.phone || before.phone,
          external_id: updated.id || before.id
        },
        customData: {
          approved_by_phone:
            extra.approvedByPhone ||
            updated.approved_by_phone ||
            updated.approvedByPhone ||
            undefined
        }
      }
    );

    if (metaResult?.ok === false) {
      console.error('META_ORDER_STATUS_EVENT_FAILED', JSON.stringify({
        orderId,
        previousStatus,
        currentStatus,
        reason: metaResult.error || metaResult.data || null
      }));
    } else if (metaResult?.skipped) {
      console.info('META_ORDER_STATUS_EVENT_SKIPPED', JSON.stringify({
        orderId,
        previousStatus,
        currentStatus,
        reason: metaResult.reason
      }));
    } else {
      console.info('META_ORDER_STATUS_EVENT_SENT', JSON.stringify({
        orderId,
        previousStatus,
        currentStatus,
        statusCode: metaResult.status
      }));
    }
  }

  return updated;
}

export async function generateNextOrderCode(rootDir) {
  let ids = [];

  if (isSupabaseEnabled()) {
    const rows = await selectRows(
      'orders',
      {},
      { select: 'id', orderBy: 'created_at', ascending: false, limit: 5000 }
    );
    ids = rows.map(item => item.id).filter(Boolean);
  } else {
    ids = readCollection(rootDir, 'orders').map(item => item.id).filter(Boolean);
  }

  const maxNumber = ids.reduce((max, id) => {
    const match = String(id).match(/^MAE(\d+)$/i);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  return `MAE${String(maxNumber + 1).padStart(3, '0')}`;
}

export async function getCustomerProfileSummary(rootDir, phone) {
  const customer = await getCustomerByPhone(rootDir, phone);
  const orders = await findOrdersByPhone(rootDir, phone);

  return {
    customer,
    ordersCount: orders.length,
    isReturning: orders.length > 0,
    customerType: customer?.tags?.[0] || (orders.length > 0 ? 'returning_customer' : 'new_customer')
  };
}

export async function createLead(rootDir, lead) {
  const row = {
    id: lead.id,
    source: lead.source || 'website',
    full_name: lead.name || lead.fullName || null,
    phone: lead.phone || null,
    preferred_channel: lead.preferredChannel || 'whatsapp',
    notes: lead.notes || null,
    created_at: lead.createdAt || nowIso()
  };

  if (isSupabaseEnabled()) {
    const inserted = await insertRows('leads', row);
    return Array.isArray(inserted) ? inserted[0] : inserted;
  }

  const leads = readCollection(rootDir, 'leads');
  const localLead = {
    ...lead,
    createdAt: lead.createdAt || nowIso()
  };

  leads.unshift(localLead);
  writeCollection(rootDir, 'leads', leads);
  return localLead;
}

async function saveMessage(rootDir, message, direction = 'inbound') {
  const row = {
    id: message.id,
    channel: 'whatsapp',
    direction,
    phone: message.from || message.to || null,
    message_type: message.type || 'text',
    content: message.text || message.content || null,
    media_id: message.audioId || message.mediaId || null,
    raw_payload: message.payload || null,
    created_at: message.receivedAt || message.createdAt || nowIso()
  };

  if (isSupabaseEnabled()) {
    try {
      return await upsertRow('messages_log', row, { onConflict: 'id' });
    } catch (error) {
      console.error('MESSAGES_LOG_SUPABASE_ERROR', {
        phone: row.phone,
        id: row.id,
        direction,
        message: error.message,
        status: error.status,
        payload: error.payload || null
      });
    }
  }

  const messages = readCollection(rootDir, 'messages');
  messages.unshift({
    ...message,
    direction,
    failed_supabase_sync: isSupabaseEnabled()
  });

  writeCollection(rootDir, 'messages', messages);
  return row;
}

export async function saveIncomingMessage(rootDir, message) {
  return saveMessage(rootDir, message, 'inbound');
}

export async function saveOutgoingMessage(rootDir, message) {
  return saveMessage(rootDir, message, 'outbound');
}
