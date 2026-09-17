# Morrow homepage metadata

These homepage tags accompany the existing JSON-LD structured data and app-specific PWA tags. Both documents use `<html lang="en">`. The JPEG assets are 1200×630 and 64,267 bytes each.

## Landing

```html
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#fff7e9" />
  <title>Morrow — Gift stocks and cash</title>
  <meta
    name="description"
    content="Give a piece of a real company or send cash with Morrow. Share a gift with someone you care about, or start a fund for their future."
  />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="application-name" content="Morrow" />
  <link rel="canonical" href="https://trymorrow.money/" />
  <link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/trymorrow-logo-rounded.png?v=5" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Morrow" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content="Morrow — Gift stocks and cash" />
  <meta
    property="og:description"
    content="Give a piece of a real company or send cash with Morrow. Share a gift with someone you care about, or start a fund for their future."
  />
  <meta property="og:url" content="https://trymorrow.money/" />
  <meta property="og:image" content="https://trymorrow.money/og-image.jpg" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:alt" content="Morrow — gift stocks and cash" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@trymorrow" />
  <meta name="twitter:creator" content="@trymorrow" />
  <meta name="twitter:title" content="Morrow — Gift stocks and cash" />
  <meta
    name="twitter:description"
    content="Give a piece of a real company or send cash with Morrow. Share a gift with someone you care about, or start a fund for their future."
  />
  <meta name="twitter:image" content="https://trymorrow.money/og-image.jpg" />
  <meta name="twitter:image:alt" content="Morrow — gift stocks and cash" />
</head>
```

## App

```html
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#fff7e9" />
  <title>Morrow — Gift stocks and cash</title>
  <meta
    name="description"
    content="Give a piece of a real company or send cash with Morrow. Share a gift with someone you care about, or start a fund for their future."
  />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="application-name" content="Morrow" />
  <link rel="canonical" href="https://app.trymorrow.money/" />
  <link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/trymorrow-logo-rounded.png?v=5" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Morrow" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content="Morrow — Gift stocks and cash" />
  <meta
    property="og:description"
    content="Give a piece of a real company or send cash with Morrow. Share a gift with someone you care about, or start a fund for their future."
  />
  <meta property="og:url" content="https://app.trymorrow.money/" />
  <meta property="og:image" content="https://app.trymorrow.money/og-image.jpg" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:alt" content="Morrow — gift stocks and cash" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@trymorrow" />
  <meta name="twitter:creator" content="@trymorrow" />
  <meta name="twitter:title" content="Morrow — Gift stocks and cash" />
  <meta
    name="twitter:description"
    content="Give a piece of a real company or send cash with Morrow. Share a gift with someone you care about, or start a fund for their future."
  />
  <meta name="twitter:image" content="https://app.trymorrow.money/og-image.jpg" />
  <meta name="twitter:image:alt" content="Morrow — gift stocks and cash" />
</head>
```

## Heading and performance

An H1 belongs in the body, outside the head. Both homepages now have one server-rendered H1. The app balance is an H2 so hydration does not add a second H1.

The supplied 171 ms response and 10 KB HTML do not indicate a server performance problem. The share-image conversion reduces the image from the reported 1.50 MB to about 64 KB. Keep these public images accessible without authentication and serve them through the hosting CDN. The new filename also avoids reuse of cached PNG previews. Deploy both sites and rescan their live URLs to verify the score and platform previews.
