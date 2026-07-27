const SITE_NAME = 'JO Transportation'

const DEFAULT_DESCRIPTION =
  'Premium ride service in Dallas–Fort Worth. Book luxury Chevrolet Suburban transfers with professional chauffeurs, upfront pricing, and 24/7 support.'

const DEFAULT_OG_IMAGE = '/welcome-hero.png'

export const PUBLIC_INDEXABLE_PATHS = ['/', '/about', '/contact', '/gallery', '/ride', '/privacy']

export const PAGE_SEO = {
  home: {
    title: 'JO Transportation | Luxury Rides in Dallas–Fort Worth',
    description: DEFAULT_DESCRIPTION,
    path: '/',
    index: true,
  },
  about: {
    title: 'About Us | JO Transportation',
    description:
      'Learn how JO Transportation delivers safe, reliable luxury rides with verified drivers, live dispatch, and community-first mobility in Dallas–Fort Worth.',
    path: '/about',
    index: true,
  },
  contact: {
    title: 'Contact Us | JO Transportation',
    description:
      'Contact JO Transportation for ride support, partnerships, and billing questions. Email jotransportation2@gmail.com or call +1 (682) 786-1241.',
    path: '/contact',
    index: true,
  },
  privacy: {
    title: 'Privacy Policy | JO Transportation',
    description:
      'Read how JO Transportation collects, uses, and protects personal information for ride booking, location, payments, and account services.',
    path: '/privacy',
    index: true,
  },
  gallery: {
    title: 'Gallery | JO Transportation',
    description:
      'Browse photos of the JO Transportation fleet and luxury Suburban rides across Dallas–Fort Worth.',
    path: '/gallery',
    index: true,
  },

  rider: {
    title: 'Book a Ride | JO Transportation',
    description:
      'Book a luxury ride in Dallas–Fort Worth. Enter pickup and dropoff, see upfront pricing, and get matched with a professional driver in minutes.',
    path: '/ride',
    index: true,
  },
  driver: {
    title: 'Driver Dashboard | JO Transportation',
    description: 'Driver tools for JO Transportation chauffeurs.',
    path: '/driver',
    index: false,
  },
  admin: {
    title: 'Admin | JO Transportation',
    description: 'JO Transportation administration.',
    path: '/admin',
    index: false,
  },
  profile: {
    title: 'Your Profile | JO Transportation',
    description: 'Manage your JO Transportation account.',
    path: '/profile',
    index: false,
  },
}

export function resolveSiteUrl() {
  const configured = import.meta.env.VITE_SITE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

function upsertMeta(attribute, key, content) {
  if (content == null || content === '') return
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

function upsertLink(rel, href) {
  if (!href) return
  let element = document.head.querySelector(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.setAttribute('rel', rel)
    document.head.appendChild(element)
  }
  element.setAttribute('href', href)
}

function upsertJsonLd(id, data) {
  let element = document.getElementById(id)
  if (!element) {
    element = document.createElement('script')
    element.id = id
    element.type = 'application/ld+json'
    document.head.appendChild(element)
  }
  element.textContent = JSON.stringify(data)
}

function buildOrganizationSchema(siteUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${siteUrl}/#organization`,
    name: SITE_NAME,
    url: siteUrl,
    logo: `${siteUrl}/favicon.svg`,
    image: `${siteUrl}${DEFAULT_OG_IMAGE}`,
    description: DEFAULT_DESCRIPTION,
    email: 'jotransportation2@gmail.com',
    telephone: '+1-682-786-1241',
    areaServed: {
      '@type': 'GeoCircle',
      geoMidpoint: {
        '@type': 'GeoCoordinates',
        latitude: 32.7767,
        longitude: -96.797,
      },
      geoRadius: 80000,
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Dallas',
      addressRegion: 'TX',
      addressCountry: 'US',
    },
    sameAs: [],
  }
}

function buildWebPageSchema(siteUrl, page) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${siteUrl}${page.path}#webpage`,
    url: `${siteUrl}${page.path}`,
    name: page.title,
    description: page.description,
    isPartOf: { '@id': `${siteUrl}/#organization` },
    inLanguage: 'en-US',
  }
}

export function applyPageSeo(pageKey) {
  if (typeof document === 'undefined') return

  const page = PAGE_SEO[pageKey] ?? PAGE_SEO.home
  const siteUrl = resolveSiteUrl()
  const canonicalUrl = siteUrl ? `${siteUrl}${page.path}` : page.path
  const ogImage = siteUrl ? `${siteUrl}${DEFAULT_OG_IMAGE}` : DEFAULT_OG_IMAGE
  const robotsContent = page.index ? 'index, follow' : 'noindex, nofollow'

  document.title = page.title

  upsertMeta('name', 'description', page.description)
  upsertMeta('name', 'robots', robotsContent)
  upsertMeta('property', 'og:site_name', SITE_NAME)
  upsertMeta('property', 'og:type', 'website')
  upsertMeta('property', 'og:title', page.title)
  upsertMeta('property', 'og:description', page.description)
  upsertMeta('property', 'og:image', ogImage)
  upsertMeta('property', 'og:url', canonicalUrl)
  upsertMeta('property', 'og:locale', 'en_US')
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', page.title)
  upsertMeta('name', 'twitter:description', page.description)
  upsertMeta('name', 'twitter:image', ogImage)

  upsertLink('canonical', canonicalUrl)

  if (siteUrl && page.index) {
    upsertJsonLd('jo-organization-jsonld', buildOrganizationSchema(siteUrl))
    upsertJsonLd('jo-webpage-jsonld', buildWebPageSchema(siteUrl, page))
  } else {
    document.getElementById('jo-organization-jsonld')?.remove()
    document.getElementById('jo-webpage-jsonld')?.remove()
  }
}
