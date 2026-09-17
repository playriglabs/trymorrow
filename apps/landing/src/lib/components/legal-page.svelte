<script lang="ts">
import type { Snippet } from 'svelte'
import HomeFooter from './home-footer.svelte'
import SeoHead from './seo-head.svelte'

let {
  title,
  description,
  path,
  updated,
  lead,
  children,
}: {
  title: string
  description: string
  path: string
  updated: string
  lead: Snippet
  children: Snippet
} = $props()
</script>

<SeoHead title={`${title} — Morrow`} {description} {path} />

<header
  class="mx-auto flex max-w-page items-center justify-between gap-4 px-5 pt-6 md:px-10 md:pt-8"
>
  <a
    href="/"
    aria-label="Morrow home"
    class="flex min-h-11 items-center font-sans text-2xl leading-none tracking-tighter md:text-3xl"
    >morrow<span class="text-orange">*</span></a
  >
  <a
    href="https://app.trymorrow.money/login"
    class="cta inline-flex min-h-11 items-center rounded-full px-5 text-sm text-cream">Open app</a
  >
</header>

<!-- Bottom padding leaves room for the footer, which overlaps the section above it. -->
<main id="main-content" class="mx-auto max-w-225 px-5 pt-16 pb-32 md:px-10 md:pt-24 md:pb-40">
  <a
    href="/"
    class="group inline-flex min-h-11 items-center gap-2 text-sm text-ink transition-colors hover:text-orange"
    ><span class="transition-transform group-hover:-translate-x-1" aria-hidden="true">←</span>
    Back</a
  >
  <h1
    class="mt-6 font-sans text-[clamp(40px,6vw,64px)] leading-[1.05] tracking-[-0.045em] text-balance"
  >
    {title}
  </h1>
  <p class="mt-4 text-sm text-stone">Last updated: {updated}</p>
  <div
    class="mt-8 text-lg leading-relaxed text-stone md:text-xl [&_strong]:font-normal [&_strong]:text-ink"
  >
    {@render lead()}
  </div>
  <!-- Section headings are numbered in the content, so the list reads like a contract. -->
  <div
    class="mt-12 text-body leading-relaxed text-ink/85 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-orange [&_h2]:mt-16 [&_h2]:font-sans [&_h2]:text-[clamp(26px,3vw,34px)] [&_h2]:leading-tight [&_h2]:tracking-[-0.03em] [&_h2]:text-ink [&_li]:mt-3 [&_li]:pl-1 [&_p]:mt-5 [&_strong]:font-normal [&_strong]:text-ink [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:pl-6"
  >
    {@render children()}
  </div>
</main>

<HomeFooter />
