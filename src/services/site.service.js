function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function buildHomepageData(config = {}) {
  const site = safeObject(config.site);
  const seo = safeObject(config.seo);
  const orderWindow = safeObject(config.orderWindow);

  return {
    brand: config.business || 'مطبخ اليوم المركزي',
    phone: site.businessPhoneDisplay || site.phone || '',
    phoneIntl: site.businessPhoneIntl || '',
    city: site.city || 'عمّان',
    district: site.district || 'أم السماق',
    email: site.email || '',
    orderWindow,
    deliveryTimeSlots: safeArray(config.deliveryTimeSlots),
    keywords: safeArray(seo.primaryKeywords),
    description: seo.brandDescription || ''
  };
}

export function buildSeoConfig(config = {}) {
  const site = safeObject(config.site);
  const seo = safeObject(config.seo);
  const orderWindow = safeObject(config.orderWindow);
  const baseUrl = site.baseUrl || 'https://matbakh-alyoum.site';
  const brand = config.business || 'مطبخ اليوم المركزي';

  return {
    title: 'مطبخ اليوم المركزي | أكل بيتي في عمّان',
    description: seo.brandDescription || '',
    keywords: safeArray(seo.primaryKeywords),
    canonical: baseUrl,
    openGraph: {
      title: brand,
      description: seo.brandDescription || '',
      image: `${baseUrl}/assets/og-default.svg`,
      url: baseUrl
    },
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: brand,
        url: baseUrl,
        logo: `${baseUrl}/assets/logo-wordmark.svg`,
        sameAs: [
          'https://www.facebook.com/MatbakhAlYoum',
          'https://www.instagram.com/matbakhalyoum',
          'https://www.snapchat.com/add/matbakhalyoum',
          'https://www.youtube.com/@matbakhalyoum'
        ]
      },
      {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: brand,
        image: `${baseUrl}/assets/og-default.svg`,
        telephone: site.businessPhoneIntl || '',
        email: site.email || '',
        address: {
          '@type': 'PostalAddress',
          addressLocality: site.city || 'عمّان',
          addressRegion: site.district || 'أم السماق',
          addressCountry: site.country || 'JO'
        },
        areaServed: site.deliveryArea || 'Amman',
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            opens: orderWindow.start || '10:00',
            closes: orderWindow.lastDelivery || '18:30'
          }
        ],
        servesCuisine: ['Jordanian', 'Levantine', 'Homestyle']
      }
    ]
  };
}

export default {
  buildHomepageData,
  buildSeoConfig
};
