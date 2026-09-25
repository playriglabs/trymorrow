<script lang="ts">
import HomeContent from '$lib/components/home-content.svelte'
import SeoHead from '$lib/components/seo-head.svelte'
import { siteUrl } from '$lib/site'

const title = 'Morrow — Money should move like a message'
const description =
  'Buy and sell shares from a few dollars, send cash, tip people you follow, or gift stocks to someone you care about—all from Morrow.'
const url = new URL('/', siteUrl).href
const imageUrl = new URL('/og-image.jpg', siteUrl).href
const structuredData = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}#organization`,
      name: 'Morrow',
      url: siteUrl,
      logo: new URL('/trymorrow-logo-rounded.png', siteUrl).href,
      sameAs: ['https://x.com/trymorrow', 'https://www.linkedin.com/company/trymorrow'],
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}#website`,
      name: 'Morrow',
      url: siteUrl,
      inLanguage: 'en',
      publisher: { '@id': `${siteUrl}#organization` },
    },
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: title,
      description,
      inLanguage: 'en',
      isPartOf: { '@id': `${siteUrl}#website` },
      primaryImageOfPage: { '@type': 'ImageObject', url: imageUrl },
    },
  ],
}).replace(/</g, '\\u003c')
</script>

<SeoHead {title} {description} path="/" {structuredData} />

<HomeContent />
