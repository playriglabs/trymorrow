import { injectAnalytics } from '@vercel/analytics/sveltekit'
import { dev } from '$app/environment'

// Visits, referrers and countries, cookieless. In dev it only logs to the console
injectAnalytics({ mode: dev ? 'development' : 'production' })

// Landing pages are static HTML at build time for SEO
export const prerender = true
