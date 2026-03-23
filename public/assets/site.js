const api = {
  status: '/api/status',
  menu: '/api/menu',
  sections: '/api/menu/sections',
  search: '/api/menu/search',
  order: '/api/orders',
  track: '/api/orders/track',
  lead: '/api/leads'
};

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  return res.json();
}

function formatPrice(value) {
  const num = Number(value || 0);
  return `${num.toFixed(3)} د.أ`;
}

function byId(id) {
  return document.getElementById(id);
}

async function loadStatusBanner() {
  const el = byId('status-banner');
  if (!el) return;
  const data = await fetchJson(api.status);
  el.innerHTML = `
    <div class="badge">موثوقية رقمية مفعلة</div>
    <div class="small muted" style="margin-top:8px">
      الطلبات تبدأ من ${data.orderWindow.start} — آخر طلب لنفس اليوم ${data.orderWindow.lastSameDayOrder} — آخر تسليم ${data.orderWindow.lastDelivery}
    </div>
  `;
}

async function renderMenuList({ query = '' } = {}) {
  const mount = byId('menu-list');
  if (!mount) return;
  const data = query ? await fetchJson(`${api.search}?q=${encodeURIComponent(query)}`) : await fetchJson(api.menu);
  const items = data.items || [];
  if (!items.length) {
    mount.innerHTML = '<div class="notice">لا توجد نتائج مطابقة حاليًا.</div>';
    return;
  }
  mount.innerHTML = items.map(item => `
    <article class="card menu-item" id="item-${item.record_id}">
      <div class="chips">
        <span class="chip">${item.section_ar}</span>
        <span class="chip">${item.status}</span>
        <span class="chip">${item.unit_ar}</span>
      </div>
      <h3 style="margin-top:14px">${item.display_name_ar}</h3>
      <div class="price">${formatPrice(item.price_1_jod)}</div>
      <p class="muted">${item.notes_ar || ''}</p>
      <div class="small muted">SKU: ${item.sku}</div>
    </article>
  `).join('');
}

async function initMenuPage() {
  const input = byId('menu-search');
  if (!input) return;
  await renderMenuList();
  input.addEventListener('input', () => renderMenuList({ query: input.value }));
}

async function initHomeSections() {
  const mount = byId('home-sections');
  if (!mount) return;
  const data = await fetchJson(api.sections);
  mount.innerHTML = data.sections.map(section => `
    <div class="card p-20">
      <h3>${section.section_ar}</h3>
      <p class="muted">${section.count} صنف</p>
      <a class="btn secondary" href="/menu.html#section-${encodeURIComponent(section.section_ar)}">استعرض القسم</a>
    </div>
  `).join('');
}

async function initTrackForm() {
  const form = byId('track-form');
  const result = byId('track-result');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    result.innerHTML = '<div class="notice">جاري البحث...</div>';
    const formData = new FormData(form);
    const orderId = formData.get('orderId');
    const phone = formData.get('phone');
    const data = await fetchJson(`${api.track}?orderId=${encodeURIComponent(orderId || '')}&phone=${encodeURIComponent(phone || '')}`);
    if (data.order) {
      result.innerHTML = `
        <div class="okbox">
          <strong>رقم الطلب: ${data.order.id}</strong><br>
          الحالة الحالية: ${data.order.statusLabelAr || data.order.status}<br>
          آخر تحديث: ${new Date(data.order.updatedAt || data.order.createdAt).toLocaleString('ar-JO')}
        </div>`;
      return;
    }
    if (data.orders?.length) {
      result.innerHTML = data.orders.map(order => `
        <div class="notice" style="margin-top:12px">
          <strong>${order.id}</strong><br>
          ${order.statusLabelAr || order.status}<br>
          ${new Date(order.updatedAt || order.createdAt).toLocaleString('ar-JO')}
        </div>`).join('');
      return;
    }
    result.innerHTML = `<div class="note">${data.message || 'لم يتم العثور على طلبات.'}</div>`;
  });
}

async function initOrderForm() {
  const form = byId('order-form');
  const result = byId('order-result');
  if (!form) return;
  const status = await fetchJson(api.status);
  const slotSelect = byId('deliverySlot');
  if (slotSelect) {
    slotSelect.innerHTML = '<option value="">اختر نافذة التوصيل</option>' +
      status.deliveryTimeSlots.map(slot => `<option value="${slot}">${slot}</option>`).join('');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    result.innerHTML = '<div class="notice">جاري إرسال الطلب...</div>';
    const fd = new FormData(form);
    const payload = {
      customerName: fd.get('customerName'),
      phone: fd.get('phone'),
      address: fd.get('address'),
      deliverySlot: fd.get('deliverySlot'),
      deliveryType: fd.get('deliveryType'),
      paymentMethod: fd.get('paymentMethod'),
      notes: fd.get('notes'),
      items: [{ display_name_ar: fd.get('itemsText') || 'طلب عام من الموقع', quantity: 1 }]
    };
    const data = await fetchJson(api.order, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    result.innerHTML = `
      <div class="okbox">
        <strong>تم استلام طلبك بنجاح.</strong><br>
        رقم الطلب: ${data.order.id}<br>
        الحالة: ${data.order.statusLabelAr}<br>
        ملاحظة: ${data.policy}
      </div>
    `;
    form.reset();
  });
}

async function initLeadForm() {
  const form = byId('lead-form');
  const result = byId('lead-result');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    result.innerHTML = '<div class="notice">جاري الإرسال...</div>';
    const fd = new FormData(form);
    const payload = {
      name: fd.get('name'),
      phone: fd.get('phone'),
      notes: fd.get('notes'),
      preferredChannel: fd.get('preferredChannel'),
      source: 'website_contact'
    };
    const data = await fetchJson(api.lead, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    result.innerHTML = `<div class="okbox">${data.message}</div>`;
    form.reset();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadStatusBanner();
  await initHomeSections();
  await initMenuPage();
  await initTrackForm();
  await initOrderForm();
  await initLeadForm();
});
