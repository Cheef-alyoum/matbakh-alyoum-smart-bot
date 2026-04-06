function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeString(value, fallback = '') {
  const result = value == null ? '' : String(value).trim();
  return result || fallback;
}

function normalizeUrl(value) {
  const raw = safeString(value);
  if (!raw) return '';

  try {
    return new URL(raw).toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function buildAbsoluteUrl(baseUrl, targetPath = '/') {
  const normalizedBase = normalizeUrl(baseUrl);
  if (!normalizedBase) return '';

  try {
    return new URL(targetPath, `${normalizedBase}/`).toString();
  } catch {
    return '';
  }
}

function toYoutubeUrl(handle) {
  const raw = safeString(handle);
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const clean = raw.replace(/^@/, '');
  return clean ? `https://www.youtube.com/@${clean}` : '';
}

function buildSameAs(channels = {}) {
  const items = [
    safeString(channels.facebook),
    safeString(channels.instagram),
    safeString(channels.snapchat),
    toYoutubeUrl(channels.youtubeHandle)
  ].filter(Boolean);

  return [...new Set(items)];
}

function getPrimaryBaseUrl(config = {}) {
  const channels = safeObject(config.channels);
  const site = safeObject(config.site);

  return (
    normalizeUrl(channels.website) ||
    normalizeUrl(site.baseUrl) ||
    'https://matbakh-alyoum.site'
  );
}

function buildMediaAssets(config = {}) {
  const seo = safeObject(config.seo);
  const site = safeObject(config.site);
  const baseUrl = getPrimaryBaseUrl(config);

  const ogImage =
    normalizeUrl(seo.ogImageUrl) ||
    normalizeUrl(site.ogImageUrl) ||
    '';

  const logo =
    normalizeUrl(seo.logoUrl) ||
    normalizeUrl(site.logoUrl) ||
    '';

  return {
    ogImage,
    logo,
    baseUrl
  };
}

function buildContactPoints(config = {}) {
  const site = safeObject(config.site);
  const channels = safeObject(config.channels);

  const phoneDisplay = safeString(site.businessPhoneDisplay || config.directCallPhone);
  const phoneIntl = safeString(site.businessPhoneIntl || channels.whatsappPhoneIntl);
  const email = safeString(site.email || channels.email);

  return {
    phoneDisplay,
    phoneIntl,
    email
  };
}

export function buildHomepageData(config = {}) {
  const site = safeObject(config.site);
  const seo = safeObject(config.seo);
  const orderWindow = safeObject(config.orderWindow);
  const channels = safeObject(config.channels);
  const businessConfig = safeObject(config.businessConfig);
  const operations = safeObject(config.operations);
  const experience = safeObject(config.customerExperience);
  const contact = buildContactPoints(config);
  const baseUrl = getPrimaryBaseUrl(config);

  return {
    brand: safeString(config.business, 'مطبخ اليوم المركزي'),
    brandEn: safeString(businessConfig.brandNameEn, 'Matbakh Al Youm Central Kitchen'),
    shortDescription: safeString(
      businessConfig.shortDescription,
      seo.brandDescription || 'مطبخ اليوم المركزي في عمّان للأكلات البيتية المحلية وخدمة الطلب عبر واتساب.'
    ),
    toneOfVoice: safeString(businessConfig.toneOfVoice),
    phone: contact.phoneDisplay,
    phoneIntl: contact.phoneIntl,
    email: contact.email,
    city: safeString(site.city, 'عمّان'),
    district: safeString(site.district, 'أم السماق'),
    country: safeString(site.country, 'الأردن'),
    orderWindow,
    deliveryTimeSlots: safeArray(config.deliveryTimeSlots),
    paymentMethodsAllowed: safeString(businessConfig.paymentMethodsAllowed, 'الدفع عند الاستلام - كاش'),
    sameDayRule: safeString(businessConfig.sameDayRule),
    scheduledRule: safeString(businessConfig.scheduledRule),
    finalConfirmationRule: safeString(businessConfig.finalConfirmationRule),
    greetingGoal: safeString(experience.greetingGoal),
    responseStyle: safeString(experience.responseStyle),
    escalationRule: safeString(experience.escalationRule),
    orderStatuses: safeArray(operations.orderStatuses),
    customerVisibleStatuses: safeObject(operations.customerVisibleStatuses),
    keywords: safeArray(seo.primaryKeywords),
    description: safeString(seo.brandDescription),
    channels: {
      website: normalizeUrl(channels.website) || baseUrl,
      menu: normalizeUrl(channels.menu),
      order: normalizeUrl(channels.order),
      tracking: normalizeUrl(channels.tracking),
      whatsappClick: normalizeUrl(channels.whatsappClick),
      facebook: normalizeUrl(channels.facebook),
      instagram: normalizeUrl(channels.instagram),
      snapchat: normalizeUrl(channels.snapchat),
      youtube: toYoutubeUrl(channels.youtubeHandle),
      email: contact.email
    }
  };
}

export function buildSeoConfig(config = {}) {
  const site = safeObject(config.site);
  const seo = safeObject(config.seo);
  const channels = safeObject(config.channels);
  const orderWindow = safeObject(config.orderWindow);
  const businessConfig = safeObject(config.businessConfig);
  const brand = safeString(config.business, 'مطبخ اليوم المركزي');
  const baseUrl = getPrimaryBaseUrl(config);
  const sameAs = buildSameAs(channels);
  const contact = buildContactPoints(config);
  const assets = buildMediaAssets(config);

  const title = safeString(
    seo.title,
    `${brand} | أكلات بيتية محلية وطلب عبر واتساب في عمّان`
  );

  const description = safeString(
    seo.brandDescription,
    businessConfig.shortDescription ||
      'مطبخ اليوم المركزي في عمّان متخصص بالأكلات البيتية المحلية وخدمة الطلب والمتابعة عبر واتساب.'
  );

  const openGraph = {
    title,
    description,
    url: baseUrl,
    type: 'website',
    site_name: brand
  };

  if (assets.ogImage) {
    openGraph.image = assets.ogImage;
  }

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: brand,
    url: baseUrl
  };

  if (assets.logo) {
    organizationJsonLd.logo = assets.logo;
  }

  if (sameAs.length) {
    organizationJsonLd.sameAs = sameAs;
  }

  if (contact.phoneIntl) {
    organizationJsonLd.telephone = contact.phoneIntl;
  }

  if (contact.email) {
    organizationJsonLd.email = contact.email;
  }

  const localBusinessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: brand,
    url: baseUrl,
    description,
    telephone: contact.phoneIntl || undefined,
    email: contact.email || undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: safeString(site.city, 'عمّان'),
      addressRegion: safeString(site.district, 'أم السماق'),
      addressCountry: safeString(site.country, 'JO')
    },
    areaServed: safeString(site.deliveryArea, 'Amman'),
    servesCuisine: ['Jordanian', 'Levantine', 'Homestyle'],
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday'
        ],
        opens: safeString(orderWindow.start, '10:00'),
        closes: safeString(orderWindow.lastDelivery, '18:30')
      }
    ]
  };

  if (assets.ogImage) {
    localBusinessJsonLd.image = assets.ogImage;
  }

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: brand,
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/menu.html?search={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };

  const contactPage = normalizeUrl(channels.website) ? buildAbsoluteUrl(baseUrl, '/contact') : '';
  if (contactPage) {
    websiteJsonLd.mainEntityOfPage = contactPage;
  }

  return {
    title,
    description,
    keywords: safeArray(seo.primaryKeywords),
    canonical: baseUrl,
    robots: 'index, follow',
    openGraph,
    contact: {
      phoneDisplay: contact.phoneDisplay,
      phoneIntl: contact.phoneIntl,
      email: contact.email
    },
    links: {
      website: normalizeUrl(channels.website) || baseUrl,
      menu: normalizeUrl(channels.menu) || buildAbsoluteUrl(baseUrl, '/menu.html'),
      order: normalizeUrl(channels.order) || buildAbsoluteUrl(baseUrl, '/order.html'),
      tracking: normalizeUrl(channels.tracking) || buildAbsoluteUrl(baseUrl, '/track.html'),
      whatsappClick: normalizeUrl(channels.whatsappClick),
      facebook: normalizeUrl(channels.facebook),
      instagram: normalizeUrl(channels.instagram),
      snapchat: normalizeUrl(channels.snapchat),
      youtube: toYoutubeUrl(channels.youtubeHandle)
    },
    jsonLd: [organizationJsonLd, localBusinessJsonLd, websiteJsonLd]
  };
}

export default {
  buildHomepageData,
  buildSeoConfig
};
