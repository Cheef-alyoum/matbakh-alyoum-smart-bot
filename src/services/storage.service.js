import crypto from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../utils/core.js';
import { insertRows, isSupabaseEnabled, patchRows, selectRows, upsertRow } from './supabase.service.js';

const files = {
  orders: 'orders.json',
  leads: 'leads.json',
  messages: 'messages.json',
  customers: 'customers.json',
  sessions: 'sessions.json'
};

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

async function upsertCustomerInternal(rootDir, payload) {
  const row = {
    phone: payload.phone,
    full_name: payload.fullName || payload.full_name || null,
    preferred_language: payload.preferredLanguage || payload.preferred_language || 'ar',
    notes: payload.notes || null,
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

export async function createOrder(rootDir, order) {
  const customer = await upsertCustomerInternal(rootDir, {
    phone: order.phone,
    fullName: order.customerName,
    preferredLanguage: order.preferredLanguage || 'ar',
    consentStatus: order.consentStatus || 'service_only'
  });

  const orderRow = {
    id: order.id,
    customer_id: customer?.id || null,
    customer_name: order.customerName || null,
    phone: order.phone,
    status: order.status,
    status_label_ar: order.statusLabelAr,
    delivery_type: order.deliveryType,
    delivery_slot: order.deliverySlot || null,
    payment_method: order.paymentMethod || 'cash',
    payment_status: order.paymentStatus || 'pending',
    address_text: order.address || null,
    order_notes: order.notes || null,
    admin_notes: order.adminNotes || null,
    created_at: order.createdAt,
    updated_at: order.updatedAt,
    subtotal_jod: order.subtotalJod || 0,
    delivery_fee_jod: order.deliveryFeeJod || 0,
    total_jod: order.totalJod || 0
  };

  if (isSupabaseEnabled()) {
    const insertedOrder = await insertRows('orders', orderRow);
    const orderItems = (order.items || []).map(item => ({
      order_id: order.id,
      menu_item_id: item.id || item.record_id || null,
      display_name_ar: item.display_name_ar || item.displayNameAr || item.name || 'صنف',
      quantity: Number(item.quantity || 1),
      unit_ar: item.unit_ar || item.unit || null,
      unit_price_jod: Number(item.price_1_jod || item.price || 0),
      line_total_jod: Number(item.lineTotalJod || item.line_total_jod || item.total || 0),
      notes: item.notes || null
    }));
    if (orderItems.length) await insertRows('order_items', orderItems, { returnMinimal: true });
    return Array.isArray(insertedOrder) ? insertedOrder[0] : insertedOrder;
  }

  const orders = loadCollection(rootDir, 'orders');
  orders.unshift(order);
  saveCollection(rootDir, 'orders', orders);
  return order;
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
    return selectRows('orders', { phone }, { orderBy: 'created_at', ascending: false, limit: 20 });
  }
  const orders = loadCollection(rootDir, 'orders');
  return orders.filter(order => order.phone === phone);
}

export async function getOrdersByStatus(rootDir, status, limit = 20) {
  if (isSupabaseEnabled()) {
    return selectRows('orders', { status }, { orderBy: 'created_at', ascending: false, limit });
  }
  const orders = loadCollection(rootDir, 'orders');
  return orders.filter(order => order.status === status).slice(0, limit);
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
    return insertRows('messages_log', row, { returnMinimal: true });
  }

  const messages = loadCollection(rootDir, 'messages');
  messages.unshift({ ...message, direction });
  saveCollection(rootDir, 'messages', messages);
  return row;
}

export async function saveIncomingMessage(rootDir, message) {
  return saveMessage(rootDir, message, 'inbound');
}

export async function saveOutgoingMessage(rootDir, message) {
  return saveMessage(rootDir, message, 'outbound');
}
