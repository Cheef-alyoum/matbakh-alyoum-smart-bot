const api = {
  status: '/api/status',
  menu: '/api/menu',
  sections: '/api/menu/sections',
  search: '/api/menu/search',
  order: '/api/orders',
  track: '/api/orders/track',
  lead: '/api/leads',
  deliveryZones: '/api/delivery/zones'
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

function getCookieValue(name) {
  const part = document.cookie
    .split('; ')
    .find(item => item.startsWith(`${name}=`));

  if (!part) return '';
  return decodeURIComponent(part.split('=').slice(1).join('='));
}

function setCookieValue(name, value, maxAgeDays = 90) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeDays * 24 * 60 * 60}; SameSite=Lax`;
}

function getMetaContext() {
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get('fbclid') || '';

  let fbc = getCookieValue('_fbc');
  if (!fbc && fbclid) {
    fbc = `fb.1.${Date.now()}.${fbclid}`;
    setCookieValue('_fbc', fbc);
  }

  return {
    fbp: getCookieValue('_fbp'),
    fbc,
    fbclid,
    eventSourceUrl: window.location.href
  };
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
      address: [fd.get('zoneName'), fd.get('address')].filter(Boolean).join(' — '),
      deliverySlot: fd.get('deliverySlot'),
      deliveryType: fd.get('deliveryType'),
      paymentMethod: fd.get('paymentMethod'),
      notes: [fd.get('notes'), fd.get('zoneName') ? `المنطقة المختارة: ${fd.get('zoneName')}` : '', fd.get('deliveryFeeHint') ? `رسوم التوصيل: ${fd.get('deliveryFeeHint')}` : ''].filter(Boolean).join(' | '),
      items: [{ display_name_ar: fd.get('itemsText') || 'طلب عام من الموقع', quantity: 1 }],
      source: 'website_order',
      pagePath: window.location.pathname,
      meta: getMetaContext()
    };
    const data = await fetchJson(api.order, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    result.innerHTML = `
      <div class="okbox">
        <strong>تم استلام طلبك بنجاح ✅</strong><br>
        طلبك الآن قيد المعالجة، وجارٍ تثبيت التفاصيل النهائية.<br>
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
      source: 'website_contact',
      pagePath: window.location.pathname,
      formName: 'contact_form',
      meta: getMetaContext()
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


async function initDeliveryZonesPage() {
  const mount = byId('delivery-zones');
  if (!mount) return;
  const data = await fetchJson(api.deliveryZones);
  const grouped = data.groupedZones || [];
  if (!grouped.length) {
    mount.innerHTML = '<div class="notice">سيتم نشر مناطق التوصيل قريبًا.</div>';
    return;
  }
  mount.innerHTML = grouped.map(group => `
    <section class="card p-20" style="margin-top:16px">
      <h3>${group.group}</h3>
      <div class="table-like">
        ${(group.zones || []).map(zone => `
          <div class="table-row">
            <span>${zone.zone_name_ar}</span>
            <strong>${formatPrice(zone.delivery_fee_jod)}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `).join('');
}

async function initZoneSelect() {
  const select = byId('zoneName');
  const fee = byId('zone-fee');
  const feeInput = byId('deliveryFeeHint');
  if (!select) return;
  const data = await fetchJson(api.deliveryZones);
  const zones = (data.zones || []).filter(z => z.is_active);
  select.innerHTML = '<option value="">اختر منطقة التوصيل</option>' + zones.map(zone => `<option value="${zone.zone_name_ar}" data-fee="${zone.delivery_fee_jod || 0}" data-min="${zone.min_order_jod || ''}">${zone.zone_name_ar} — ${formatPrice(zone.delivery_fee_jod || 0)}</option>`).join('');
  select.addEventListener('change', () => {
    const opt = select.options[select.selectedIndex];
    if (!fee) return;
    if (!opt || !opt.value) {
      fee.innerHTML = '';
      if (feeInput) feeInput.value = '';
      return;
    }
    const min = opt.dataset.min ? ` — حد أدنى ${formatPrice(opt.dataset.min)}` : '';
    if (feeInput) feeInput.value = formatPrice(opt.dataset.fee || 0);
    fee.innerHTML = `<div class="notice">رسوم التوصيل لهذه المنطقة: <strong>${formatPrice(opt.dataset.fee || 0)}</strong>${min}</div>`;
  });
}


document.addEventListener('DOMContentLoaded', async () => {
  await loadStatusBanner();
  await initHomeSections();
  await initMenuPage();
  await initTrackForm();
  await initOrderForm();
  await initZoneSelect();
  await initDeliveryZonesPage();
  await initLeadForm();
});
