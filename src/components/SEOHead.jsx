// src/components/SEOHead.jsx — Dynamic head tags + structured data
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'
import { buildPageMeta, SITE_URL, SITE_NAME } from '../utils/seo'
import { SUPPORT_WHATSAPP } from '../config/support'

const SUPPORT_PHONE = `+91-${SUPPORT_WHATSAPP}`

const SCHEMA_ORG = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512.png`,
      description: 'IRONPULSE is a modern gym management platform for fitness businesses.',
      foundingDate: '2024',
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: SUPPORT_PHONE,
        contactType: 'customer support',
        availableLanguage: ['English', 'Hindi'],
      },
      sameAs: [
        'https://x.com/ironpulse',
        'https://linkedin.com/company/ironpulse',
        'https://instagram.com/ironpulse',
      ],
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'IRONPULSE',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Android, iOS',
      description: 'Comprehensive gym management platform with member management, attendance tracking, trainer tools, payments, and analytics.',
      offers: {
        '@type': 'Offer',
        price: '999',
        priceCurrency: 'INR',
        priceValidUntil: '2027-12-31',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '156',
        bestRating: '5',
      },
      author: {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: 'Modern gym management platform for fitness businesses.',
      publisher: {
        '@id': `${SITE_URL}/#organization`,
      },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ],
}

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is IRONPULSE?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'IRONPULSE is a comprehensive gym management platform that helps fitness businesses manage members, trainers, attendance, payments, diet plans, workout plans, and analytics — all in one place.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does IRONPULSE cost?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'IRONPULSE offers flexible pricing plans starting from ₹999/month for Standard, ₹1,999/month for Premium, and custom Enterprise plans for large fitness chains. All plans include a free trial period.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does IRONPULSE work on mobile?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, IRONPULSE is fully responsive and works on all devices. It also supports PWA (Progressive Web App) installation for an app-like experience on mobile and desktop.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I track member attendance with IRONPULSE?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, IRONPULSE supports multiple check-in methods including QR code scanning, manual check-in, and reception mode. Attendance data is tracked in real-time with detailed analytics.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does IRONPULSE support payment processing?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, IRONPULSE integrates with PhonePe for secure payment processing. Members can pay subscriptions, renewals, and upgrades online. All transactions are recorded and synced with financial reports.',
      },
    },
  ],
}

export default function SEOHead() {
  const { pathname } = useLocation()
  const meta = buildPageMeta(pathname)
  const isPublic = pathname === '/' || pathname === '/auth' || pathname === '/features' || pathname === '/pricing' || pathname === '/contact' || pathname === '/about' || pathname === '/privacy' || pathname === '/terms'

  return (
    <Helmet>
      <html lang="en" />
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={meta.canonical} />

      {meta.noindex && <meta name="robots" content="noindex, nofollow" />}
      {!meta.noindex && <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />}

      {/* Open Graph */}
      <meta property="og:type" content={meta.ogType} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={meta.canonical} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={`${SITE_URL}${meta.ogImage}`} />
      <meta property="og:image:width" content="512" />
      <meta property="og:image:height" content="512" />
      <meta property="og:locale" content="en_IN" />

      {/* Twitter Card */}
      <meta name="twitter:card" content={meta.twitterCard} />
      <meta name="twitter:site" content={meta.twitterSite} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={`${SITE_URL}${meta.ogImage}`} />

      {/* Schema.org — only on public pages to avoid duplication */}
      {isPublic && (
        <script type="application/ld+json">
          {JSON.stringify(SCHEMA_ORG)}
        </script>
      )}

      {/* FAQ Schema — only on landing page */}
      {pathname === '/' && (
        <script type="application/ld+json">
          {JSON.stringify(FAQ_SCHEMA)}
        </script>
      )}
    </Helmet>
  )
}
