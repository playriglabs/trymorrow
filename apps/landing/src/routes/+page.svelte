<script lang="ts">
import { siteUrl } from '$lib/site'

const title = 'Morrow — Gift stocks and cash'
const description =
  'Give a piece of a real company or send cash with Morrow. Share a gift with someone you care about, or start a fund for their future.'
const imageAlt = 'Morrow — gift stocks and cash'
const robots = 'index, follow, max-image-preview:large'
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

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content={robots} />
  <meta name="application-name" content="Morrow" />
  <link rel="canonical" href={url} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Morrow" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={imageUrl} />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:alt" content={imageAlt} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@trymorrow" />
  <meta name="twitter:creator" content="@trymorrow" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={imageUrl} />
  <meta name="twitter:image:alt" content={imageAlt} />
  {@html `<script type="application/ld+json">${structuredData}</script>`}
</svelte:head>

<main
  class="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-6 py-16 text-center"
>
  <img src="/favicon.svg" alt="Morrow" width="56" height="56" />
  <h1 class="font-sans text-[48px] leading-[1.08] font-medium tracking-[-0.02em] text-balance">
    Gift stocks and cash with Morrow.
  </h1>
  <p class="max-w-xl text-[18px] leading-relaxed text-stone">{description}</p>
  <a
    href="https://app.trymorrow.money/login"
    class="inline-flex min-h-14 items-center justify-center rounded-button bg-orange px-6 py-3 font-sans text-[17px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
    >Get started with Morrow</a
  >
</main>
