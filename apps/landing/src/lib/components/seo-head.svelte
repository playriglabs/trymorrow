<script lang="ts">
import { siteUrl } from '$lib/site'

// Every page shares the default share image, so links preview the same way on Google, X,
// LinkedIn, Reddit, WhatsApp, and anything else that reads Open Graph tags.
let {
  title,
  description,
  path,
  structuredData,
}: { title: string; description: string; path: string; structuredData?: string } = $props()

const imageUrl = new URL('/og-image.jpg', siteUrl).href
const imageAlt = 'Morrow — gift stocks and cash'
const url = $derived(new URL(path, siteUrl).href)

// Pages without their own graph still say which site they belong to, with a breadcrumb.
const jsonLd = $derived(
  structuredData ??
    JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          url,
          name: title,
          description,
          inLanguage: 'en',
          isPartOf: { '@id': `${siteUrl}#website` },
          primaryImageOfPage: { '@type': 'ImageObject', url: imageUrl },
          breadcrumb: { '@id': `${url}#breadcrumb` },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${url}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Morrow', item: new URL('/', siteUrl).href },
            { '@type': 'ListItem', position: 2, name: title.split(' — ')[0], item: url },
          ],
        },
      ],
    }).replace(/</g, '\\u003c'),
)
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="application-name" content="Morrow" />
  <link rel="canonical" href={url} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Morrow" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={imageUrl} />
  <meta property="og:image:secure_url" content={imageUrl} />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:alt" content={imageAlt} />
  <meta property="og:image:width" content="1300" />
  <meta property="og:image:height" content="683" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@trymorrow" />
  <meta name="twitter:creator" content="@trymorrow" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={imageUrl} />
  <meta name="twitter:image:alt" content={imageAlt} />
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>
