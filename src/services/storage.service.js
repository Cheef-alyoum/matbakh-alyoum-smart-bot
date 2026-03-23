import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../utils/core.js';

const files = {
  orders: 'orders.json',
  leads: 'leads.json',
  messages: 'messages.json'
};

function loadCollection(rootDir, name) {
  return readJsonFile(path.join(rootDir, 'storage', files[name]), []);
}

function saveCollection(rootDir, name, items) {
  return writeJsonFile(path.join(rootDir, 'storage', files[name]), items);
}

export function createOrder(rootDir, order) {
  const orders = loadCollection(rootDir, 'orders');
  orders.unshift(order);
  saveCollection(rootDir, 'orders', orders);
  return order;
}

export function getOrderById(rootDir, orderId) {
  const orders = loadCollection(rootDir, 'orders');
  return orders.find(order => order.id === orderId) || null;
}

export function findOrdersByPhone(rootDir, phone) {
  const orders = loadCollection(rootDir, 'orders');
  return orders.filter(order => order.phone === phone);
}

export function updateOrderStatus(rootDir, orderId, status, statusLabelAr) {
  const orders = loadCollection(rootDir, 'orders');
  const index = orders.findIndex(order => order.id === orderId);
  if (index === -1) return null;
  orders[index].status = status;
  orders[index].statusLabelAr = statusLabelAr;
  orders[index].updatedAt = new Date().toISOString();
  saveCollection(rootDir, 'orders', orders);
  return orders[index];
}

export function createLead(rootDir, lead) {
  const leads = loadCollection(rootDir, 'leads');
  leads.unshift(lead);
  saveCollection(rootDir, 'leads', leads);
  return lead;
}

export function saveIncomingMessage(rootDir, message) {
  const messages = loadCollection(rootDir, 'messages');
  messages.unshift(message);
  saveCollection(rootDir, 'messages', messages);
  return message;
}
