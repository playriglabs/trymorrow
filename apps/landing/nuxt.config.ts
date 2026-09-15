import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  devtools: { enabled: true },
  modules: ['@nuxtjs/sitemap', '@nuxtjs/robots'],
  css: ['@morrow/ui/styles.css'],
  vite: {
    plugins: [tailwindcss()],
  },

  // Override in production with NUXT_SITE_URL
  site: {
    url: 'https://trymorrow.money',
    name: 'Morrow',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      titleTemplate: '%s · Morrow',
      meta: [{ name: 'theme-color', content: '#fff7e9' }],
    },
  },

  // Landing pages are static HTML at build time for SEO
  routeRules: {
    '/': { prerender: true },
  },

  nitro: {
    prerender: { crawlLinks: true },
  },

  typescript: {
    strict: true,
  },
})
