// src/utils/seo.js — IRONPULSE SEO & Metadata Configuration

const SITE_URL = 'https://ironpulse.app'
const SITE_NAME = 'IRONPULSE'
const DEFAULT_DESC = 'IRONPULSE is a modern gym management platform — member management, trainer tools, attendance tracking, payment processing, diet & workout plans, and analytics for fitness businesses.'
const DEFAULT_OG_IMAGE = '/icons/icon-512.png'

export const SEO_DEFAULTS = {
  title: 'IRONPULSE — Gym Management Platform',
  description: DEFAULT_DESC,
  canonical: SITE_URL,
  ogImage: DEFAULT_OG_IMAGE,
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterSite: '@ironpulse',
}

export const PAGE_META = {
  '/': {
    title: 'IRONPULSE — Modern Gym Management Platform',
    description: 'Run your fitness business smarter. Member management, attendance, trainer tools, payments, diet & workout plans — all in one platform.',
    ogType: 'website',
    canonical: SITE_URL,
  },
  '/auth': {
    title: 'Sign In — IRONPULSE Gym Management',
    description: 'Sign in to your IRONPULSE gym dashboard or create a new gym account.',
    ogType: 'website',
    canonical: `${SITE_URL}/auth`,
    noindex: true,
  },
  '/features': {
    title: 'Features — IRONPULSE Gym Management Platform',
    description: 'Explore all IRONPULSE features: member management, QR attendance, trainer tools, payment processing, diet & workout plans, reports, and more.',
    ogType: 'website',
    canonical: `${SITE_URL}/features`,
  },
  '/pricing': {
    title: 'Pricing — IRONPULSE Gym Management Plans',
    description: 'Simple, transparent pricing for gyms of all sizes. Standard, Premium, and Enterprise plans with no hidden fees.',
    ogType: 'website',
    canonical: `${SITE_URL}/pricing`,
  },
  '/contact': {
    title: 'Contact Us — IRONPULSE Support',
    description: 'Get in touch with the IRONPULSE team. We\'re here to help with questions, support, and partnerships.',
    ogType: 'website',
    canonical: `${SITE_URL}/contact`,
  },
  '/about': {
    title: 'About — IRONPULSE Gym Management',
    description: 'Learn about IRONPULSE — our mission to simplify gym management with powerful, intuitive tools for fitness businesses worldwide.',
    ogType: 'website',
    canonical: `${SITE_URL}/about`,
  },
  '/privacy': {
    title: 'Privacy Policy — IRONPULSE',
    description: 'IRONPULSE privacy policy. Learn how we collect, use, and protect your data.',
    ogType: 'website',
    canonical: `${SITE_URL}/privacy`,
    noindex: true,
  },
  '/terms': {
    title: 'Terms of Service — IRONPULSE',
    description: 'IRONPULSE terms of service governing the use of our gym management platform.',
    ogType: 'website',
    canonical: `${SITE_URL}/terms`,
    noindex: true,
  },
  '/dashboard': {
    title: 'Dashboard — IRONPULSE',
    description: 'Your IRONPULSE dashboard — attendance, revenue, members, and key metrics at a glance.',
    noindex: true,
  },
}

export function buildPageMeta(pathname) {
  const route = PAGE_META[pathname] || {}
  const meta = {
    title: route.title || SEO_DEFAULTS.title,
    description: route.description || SEO_DEFAULTS.description,
    canonical: route.canonical || `${SITE_URL}${pathname}`,
    ogImage: route.ogImage || SEO_DEFAULTS.ogImage,
    ogType: route.ogType || SEO_DEFAULTS.ogType,
    twitterCard: route.twitterCard || SEO_DEFAULTS.twitterCard,
    twitterSite: route.twitterSite || SEO_DEFAULTS.twitterSite,
    noindex: route.noindex || false,
  }
  return meta
}

export { SITE_URL, SITE_NAME }
