<script lang="ts">
import SocialIcon from './social-icon.svelte'

const socials = [
  { name: 'x', label: 'Morrow on X', href: 'https://x.com/trymorrow' },
  { name: 'reddit', label: 'Morrow on Reddit', href: 'https://www.reddit.com/r/TRYMORROW/' },
] as const
</script>

<header class="fixed inset-x-0 top-3 z-40 px-3 md:top-4">
  <nav aria-label="Main navigation" class="nav-glass mx-auto max-w-135 rounded-3xl p-1.5">
    <div class="flex items-center justify-between gap-1 md:gap-5">
      <a
        href="/"
        aria-label="Morrow home"
        class="flex min-h-10 items-center pl-2 font-sans text-2xl leading-none tracking-tighter md:pl-3 md:text-3xl"
        ><img
          src="/trymorrow-logo-rounded.png"
          alt=""
          width="29"
          height="29"
          class="rounded-lg min-[360px]:hidden"
        /><span class="hidden min-[360px]:inline">morrow<span class="text-orange">*</span></span></a
      >
      <div class="-mx-0.5 flex items-center">
        {#each socials as social}
          <a
            href={social.href}
            aria-label={social.label}
            target="_blank"
            rel="noopener noreferrer"
            class="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-cream hover:text-orange"
            ><SocialIcon name={social.name} small /></a
          >
        {/each}
      </div>
      <a
        href="https://app.trymorrow.money/login"
        class="app-glow relative isolate shrink-0 overflow-hidden rounded-card p-0.5"
      >
        <span
          class="relative z-10 flex min-h-10 items-center gap-2 rounded-[16px] bg-[#efe8dc] p-1 pr-3 text-xs md:gap-3 md:pr-4 md:text-sm"
          ><span class="flex size-9 items-center justify-center rounded-[12px] bg-ink"
            ><img
              src="/trymorrow-logo-rounded.png"
              width="29"
              height="29"
              alt=""
              class="size-6.5 rounded-lg"
            /></span
          >Open app</span
        >
      </a>
    </div>
  </nav>
</header>
