export function buildHomepageData(config) {
  return {
    brand: config.business,
    phone: config.site.businessPhoneDisplay,
    phoneIntl: config.site.businessPhoneIntl,
    city: config.site.city,
    district: config.site.district,
    email: config.site.email,
    orderWindow: config.orderWindow,
    deliveryTimeSlots: config.deliveryTimeSlots,
    keywords: config.seo.primaryKeywords,
    description: config.seo.brandDescription
  };
}

export function buildSeoConfig(config) {
  return {
    title: 'مطبخ اليوم المركزي | أكل بيتي في عمّان',
    description: config.seo.brandDescription,
    keywords: config.seo.primaryKeywords,
    canonical: config.site.baseUrl,
    openGraph: {
      title: 'مطبخ اليوم المركزي',
      description: config.seo.brandDescription,
      image: `${config.site.baseUrl}/assets/og-default.svg`,
      url: config.site.baseUrl
    },
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: config.business,
        url: config.site.baseUrl,
        logo: `${config.site.baseUrl}/assets/logo-wordmark.svg`,
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
        name: config.business,
        image: `${config.site.baseUrl}/assets/og-default.svg`,
        telephone: config.site.businessPhoneIntl,
        email: config.site.email,
        address: {
          '@type': 'PostalAddress',
          addressLocality: config.site.city,
          addressRegion: config.site.district,
          addressCountry: config.site.country
        },
        areaServed: config.site.deliveryArea,
        openingHoursSpecification: [
          {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
            opens: config.orderWindow.start,
            closes: config.orderWindow.lastDelivery
          }
        ],
        servesCuisine: ['Jordanian', 'Levantine', 'Homestyle']
      }
    ]
  };
}
