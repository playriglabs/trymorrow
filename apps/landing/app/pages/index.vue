<script setup lang="ts">
const site = useSiteConfig()
const canonicalUrl = new URL('/', site.url).href

// TODO: set real landing copy
const title = 'Morrow'
const description = ''

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogType: 'website',
  ogUrl: canonicalUrl,
  twitterCard: 'summary_large_image',
})

useHead({
  // Home page shows the bare title, not "%s — Morrow"
  titleTemplate: '%s',
  link: [{ rel: 'canonical', href: canonicalUrl }],
})
</script>

<template>
  <main></main>
</template>
