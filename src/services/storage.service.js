import crypto from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../utils/core.js';
import { deleteRows, insertRows, isSupabaseEnabled, patchRows, selectRows, upsertRow } from './supabase.service.js';

const files = {
  orders: 'orders.json',
  leads: 'leads.json',
  messages: 'messages.json',
  customers: 'customers.json',
  sessions: 'sessions.json'
};

const TERMINAL_STATUSES = ['delivered', 'cancelled', 'rejected', 'customer_exit'];

function loadCollection(rootDir, name) {
  return readJsonFile(path.join(rootDir, 'storage', files[name]), []);
}

function saveCollection(rootDir, name, items) {
  return writeJsonFile(path.join(rootDir, 'storage', files[name]), items);
}

function mapConsentToFlags(consentStatus = 'service_only') {
  return {
    consent_status: consentStatus,
    marketing_opt_in: consentStatus === 'marketing_opt_in'
  };
}

function getJordanParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Amman',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(p => p.type === 'year')?.value || 0);
  const month = Number(parts.find(p => p.type === 'month')?.value || 0);
  const day = Number(parts.find(p => p.type === 'day')?.value || 0);

  if (!year || !month || !day) return null;
  return { year, month, day };
}

function jordanDayKey(value = new Date()) {
  const parts = getJordanParts(value);
  if (!parts) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function jordanDayNumber(value = new Date()) {
  const parts = getJordanParts(value);
  if (!parts) return null;
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
}

function isWithinJordanPeriod(value, period = 'today', referenceDate = new Date()) {
  const itemParts = getJordanParts(value);
  const refParts = getJordanParts(referenceDate);

  if (!itemParts || !refParts) return false;

  if (period === 'today') {
    return (
      itemParts.year === refParts.year &&
      itemParts.month === refParts.month &&
      itemParts.day === refParts.day
    );
  }

  if (period === 'month') {
    return (
      itemParts.year === refParts.year &&
      itemParts.month === refParts.month
    );
  }

  if (period === 'week') {
    const itemNum = jordanDayNumber(value);
    const refNum = jordanDayNumber(referenceDate);
    if (itemNum == null || refNum == null) return false;
    const diff = refNum - itemNum;
    return diff >= 0 && diff <= 6;
  }

  return false;
}

function isDuplicateOrderIdError(error) {
  return (
    error?.status === 409 &&
    (
      error?.payload?.code === '23505' ||
      /duplicate key value/i.test(String(error?.message || ''))
    )
  );
}

async function upsertCustomerInternal(rootDir, payload) {
  const row = {
    phone: payload.phone,
    full_name: payload.fullName || payload.full_name || null,
    preferred_language: payload.preferredLanguage || payload.preferred_language || 'ar',
    notes: payload.notes || null,
    tags: payload.tags || undefined,
    ...mapConsentToFlags(payload.consentStatus || payload.consent_status || 'service_only')
  };

  if (isSupabaseEnabled()) {
    return upsertRow('customers', row, { onConflict: 'phone' });
  }

  const customers = loadCollection(rootDir, 'customers');
  const index = customers.findIndex(item => item.phone === row.phone);
  const record = {
    id: customers[index]?.id || crypto.randomUUID?.() || `${Date.now()}`,
    ...customers[index],
    ...row,
    updated_at: new Date().toISOString(),
    created_at: customers[index]?.created_at || new Date().toISOString()
  };
  if (index === -1) customers.unshift(record);
  else customers[index] = record;
  saveCollection(rootDir, 'customers', customers);
  return record;
}

export async function getCustomerByPhone(rootDir, phone) {
  if (!phone) return null;
  if (isSupabaseEnabled()) {
    const rows = await selectRows('customers', { phone }, { limit: 1 });
    return rows[0] || null;
  }
  const customers = loadCollection(rootDir, 'customers');
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
  const sessions = loadCollection(rootDir, 'sessions');
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
    last_interaction_at: new Date().toISOString()
  };

  if (isSupabaseEnabled()) {
    return upsertRow('conversation_sessions', row, { onConflict: 'phone' });
  }

  const sessions = loadCollection(rootDir, 'sessions');
  const index = sessions.findIndex(item => item.phone === phone);
  const record = {
    id: sessions[index]?.id || `${Date.now()}-${phone}`,
    ...sessions[index],
    ...row,
    created_at: sessions[index]?.created_at || new Date().toISOString()
  };
  if (index === -1) sessions.unshift(record);
  else sessions[index] = record;
  saveCollection(rootDir, 'sessions', sessions);
  return record;
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
    created_at: order.createdAt || order.created_at || new Date().toISOString(),
    updated_at: order.updatedAt || order.updated_at || new Date().toISOString()
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
        const orderItems = normalizeOrderItems(currentOrder);

        if (orderItems.length) {
          await insertRows('order_items', orderItems, { returnMinimal: true });
        }

        return Array.isArray(insertedOrder) ? insertedOrder[0] : insertedOrder;
      } catch (error) {
        lastError = error;

        if (!isDuplicateOrderIdError(error)) {
          throw error;
        }

        attempts += 1;

        console.warn('ORDER_ID_CONFLICT_RETRY', {
          attempt: attempts,
          previousId: currentOrder.id,
          message: error?.message || null,
          payload: error?.payload || null
        });

        const freshId = await generateNextOrderCode(rootDir);
        currentOrder = {
          ...currentOrder,
          id: freshId,
          updatedAt: new Date().toISOString()
        };
      }
    }

    throw lastError;
  }

  const orders = loadCollection(rootDir, 'orders');
  orders.unshift({ ...order, customerId: customer?.id || null });
  saveCollection(rootDir, 'orders', orders);
  return order;
}

export async function replaceOrder(rootDir, orderId, order) {
  if (isSupabaseEnabled()) {
    const updated = await patchRows('orders', { id: orderId }, normalizeOrderRow(order, order.customerId || null));
    await deleteRows('order_items', { order_id: orderId });
    const orderItems = normalizeOrderItems(order);
    if (orderItems.length) await insertRows('order_items', orderItems, { returnMinimal: true });
    return updated;
  }

  const orders = loadCollection(rootDir, 'orders');
  const index = orders.findIndex(item => item.id === orderId);
  if (index === -1) return null;
  orders[index] = { ...orders[index], ...order, updatedAt: new Date().toISOString() };
  saveCollection(rootDir, 'orders', orders);
  return orders[index];
}

export async function getOrderById(rootDir, orderId) {
  if (isSupabaseEnabled()) {
    const rows = await selectRows('orders', { id: orderId }, { limit: 1 });
    return rows[0] || null;
  }
  const orders = loadCollection(rootDir, 'orders');
  return orders.find(order => order.id === orderId) || null;
}

export async function getOrderItems(rootDir, orderId) {
  if (isSupabaseEnabled()) {
    return selectRows('order_items', { order_id: orderId }, { orderBy: 'created_at', ascending: true, limit: 100 });
  }
  const orders = loadCollection(rootDir, 'orders');
  return orders.find(order => order.id === orderId)?.items || [];
}

export async function findOrdersByPhone(rootDir, phone) {
  if (isSupabaseEnabled()) {
    return selectRows('orders', { phone }, { orderBy: 'created_at', ascending: false, limit: 200 });
  }
  const orders = loadCollection(rootDir, 'orders');
  return orders
    .filter(order => order.phone === phone)
    .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
}

export async function getOrdersByStatus(rootDir, status, limit = 20) {
  if (isSupabaseEnabled()) {
    return selectRows('orders', { status }, { orderBy: 'created_at', ascending: false, limit });
  }
  const orders = loadCollection(rootDir, 'orders');
  return orders.filter(order => order.status === status).slice(0, limit);
}

export async function getAllOrders(rootDir, limit = 5000) {
  if (isSupabaseEnabled()) {
    return selectRows('orders', {}, { orderBy: 'created_at', ascending: false, limit });
  }
  return loadCollection(rootDir, 'orders')
    .sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0))
    .slice(0, limit);
}

export async function getAllCustomers(rootDir, limit = 5000) {
  if (isSupabaseEnabled()) {
    return selectRows('customers', {}, { orderBy: 'created_at', ascending: false, limit });
  }
  return loadCollection(rootDir, 'customers')
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, limit);
}

export async function getAllMessages(rootDir, limit = 5000) {
  if (isSupabaseEnabled()) {
    return selectRows('messages_log', {}, { orderBy: 'created_at', ascending: false, limit });
  }
  return loadCollection(rootDir, 'messages')
    .sort((a, b) => new Date(b.created_at || b.createdAt || b.receivedAt || 0) - new Date(a.created_at || a.createdAt || a.receivedAt || 0))
    .slice(0, limit);
}

export async function getOperationalReport(rootDir, period = 'today') {
  const [orders, messages] = await Promise.all([
    getAllOrders(rootDir, 5000),
    getAllMessages(rootDir, 10000)
  ]);

  const filteredOrders = orders.filter(order => isWithinJordanPeriod(order.created_at || order.createdAt, period));
  const filteredMessages = messages.filter(message => isWithinJordanPeriod(message.created_at || message.createdAt || message.receivedAt, period));

  const byStatus = {
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
    if (Object.prototype.hasOwnProperty.call(byStatus, status)) {
      byStatus[status] += 1;
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

    const current = phoneMap.get(phone);
    current.total += 1;
    if ((message.direction || '').toLowerCase() === 'inbound') current.inbound += 1;
    if ((message.direction || '').toLowerCase() === 'outbound') current.outbound += 1;

    const ts = message.created_at || message.createdAt || message.receivedAt || null;
    if (ts && (!current.last_at || new Date(ts) > new Date(current.last_at))) {
      current.last_at = ts;
    }
  }

  const phones = [...phoneMap.values()].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return String(b.last_at || '').localeCompare(String(a.last_at || ''));
  });

  const inboundCount = filteredMessages.filter(message => (message.direction || '').toLowerCase() === 'inbound').length;
  const outboundCount = filteredMessages.filter(message => (message.direction || '').toLowerCase() === 'outbound').length;

  return {
    period,
    day_key_jordan: jordanDayKey(new Date()),
    orders: {
      total: filteredOrders.length,
      ...byStatus,
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
  const inactiveDays = 30;

  const grouped = {
    all,
    returning: all.filter(item => item.orders_count >= 2),
    new: all.filter(item => item.orders_count === 1),
    inactive: all.filter(item => item.last_order_at && ((now - new Date(item.last_order_at).getTime()) / 86400000) > inactiveDays),
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
  if (isSupabaseEnabled()) {
    return patchRows('orders', { id: orderId }, {
      status,
      status_label_ar: statusLabelAr,
      approved_by_phone: extra.approvedByPhone || undefined,
      approved_at: extra.approvedAt || undefined,
      admin_notes: extra.adminNotes || undefined,
      updated_at: new Date().toISOString()
    });
  }

  const orders = loadCollection(rootDir, 'orders');
  const index = orders.findIndex(order => order.id === orderId);
  if (index === -1) return null;
  orders[index].status = status;
  orders[index].statusLabelAr = statusLabelAr;
  orders[index].updatedAt = new Date().toISOString();
  if (extra.adminNotes) orders[index].adminNotes = extra.adminNotes;
  if (extra.approvedByPhone) orders[index].approvedByPhone = extra.approvedByPhone;
  if (extra.approvedAt) orders[index].approvedAt = extra.approvedAt;
  saveCollection(rootDir, 'orders', orders);
  return orders[index];
}

export async function generateNextOrderCode(rootDir) {
  let ids = [];
  if (isSupabaseEnabled()) {
    const rows = await selectRows('orders', {}, { select: 'id', orderBy: 'created_at', ascending: false, limit: 5000 });
    ids = rows.map(item => item.id).filter(Boolean);
  } else {
    ids = loadCollection(rootDir, 'orders').map(item => item.id).filter(Boolean);
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
    created_at: lead.createdAt || new Date().toISOString()
  };

  if (isSupabaseEnabled()) {
    const inserted = await insertRows('leads', row);
    return Array.isArray(inserted) ? inserted[0] : inserted;
  }

  const leads = loadCollection(rootDir, 'leads');
  leads.unshift(lead);
  saveCollection(rootDir, 'leads', leads);
  return lead;
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
    created_at: message.receivedAt || message.createdAt || new Date().toISOString()
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

  const messages = loadCollection(rootDir, 'messages');
  messages.unshift({ ...message, direction, failed_supabase_sync: isSupabaseEnabled() });
  saveCollection(rootDir, 'messages', messages);
  return row;
}

export async function saveIncomingMessage(rootDir, message) {
  return saveMessage(rootDir, message, 'inbound');
}

export async function saveOutgoingMessage(rootDir, message) {
  return saveMessage(rootDir, message, 'outbound');
}
