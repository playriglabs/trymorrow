<script lang="ts">
import { telegramUrl } from '$lib/site'
import SocialIcon from './social-icon.svelte'

const socials = [
  { name: 'telegram', label: 'Telegram', href: telegramUrl },
  { name: 'x', label: 'X', href: 'https://x.com/trymorrow' },
  { name: 'reddit', label: 'Reddit', href: 'https://www.reddit.com/r/TRYMORROW/' },
  { name: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/company/trymorrow' },
] as const

const pageLinks = [
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Privacy Policy', href: '/privacy-policy' },
  { label: 'Terms & Conditions', href: '/terms-conditions' },
]

const year = new Date().getFullYear()
</script>

<!-- Rounded top lifts the footer over the orange section like a sheet. -->
<footer
  class="relative z-10 -mt-10 overflow-hidden rounded-t-[40px] bg-ink text-cream md:-mt-14 md:rounded-t-[56px]"
>
  <div class="footer-ornaments pointer-events-none absolute inset-0" aria-hidden="true">
    <div class="footer-orbit absolute">
      <svg viewBox="0 0 240 240" fill="none" class="size-full">
        <circle cx="120" cy="120" r="82" stroke="currentColor" stroke-opacity=".2" />
        <ellipse
          cx="120"
          cy="120"
          rx="108"
          ry="56"
          stroke="currentColor"
          stroke-opacity=".42"
          stroke-dasharray="4 9"
          transform="rotate(-28 120 120)"
        />
        <ellipse
          cx="120"
          cy="120"
          rx="108"
          ry="56"
          stroke="currentColor"
          stroke-opacity=".25"
          transform="rotate(32 120 120)"
        />
        <circle cx="211" cy="68" r="8" fill="#f66f00" />
        <circle cx="44" cy="181" r="5" fill="#d3e7bb" />
      </svg>
    </div>

    <div class="footer-stamp absolute flex items-center justify-center">
      <span class="font-sans text-[64px] leading-none text-orange">*</span>
    </div>

    <div
      class="footer-pill absolute flex items-center gap-2 rounded-full bg-[#d3e7bb] px-4 py-2.5 text-[10px] tracking-[0.16em] text-ink"
    >
      <span class="size-2 rounded-full bg-orange"></span> FOR WHAT’S NEXT
    </div>

    <svg class="footer-squiggle absolute" viewBox="0 0 210 110" fill="none">
      <path
        d="M7 77c31-62 60 39 91-20s61 33 105-45"
        stroke="#f66f00"
        stroke-width="5"
        stroke-linecap="round"
      />
      <path d="m186 14 18-2-3 18" stroke="#f66f00" stroke-width="5" stroke-linecap="round" />
    </svg>
  </div>

  <div class="relative z-10 mx-auto max-w-page px-5 pt-16 md:px-10 md:pt-24">
    <div class="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-[10px] tracking-widest text-steel">COME SAY HI</p>
        <p
          class="mt-4 max-w-120 font-sans text-[clamp(40px,6vw,76px)] leading-[1.02] tracking-[-0.055em] text-balance"
        >
          See you tomorrow<span class="text-orange">*</span>
        </p>
        <a
          href="https://app.trymorrow.money/login"
          class="app-glow footer-pop relative isolate mt-8 inline-flex overflow-hidden rounded-full p-0.5 focus-visible:outline-cream"
        >
          <span
            class="relative z-10 flex min-h-12 items-center gap-3 rounded-full bg-cream py-1 pr-5 pl-1 text-sm text-ink"
            ><img
              src="/trymorrow-logo-rounded.png"
              width="29"
              height="29"
              alt=""
              class="size-10 rounded-full"
            />Open Morrow</span
          >
        </a>
      </div>

      <ul class="flex items-center gap-2">
        {#each socials as social}
          <li>
            <a
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Morrow on ${social.label}`}
              class="flex size-12 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream focus-visible:outline-cream"
              ><SocialIcon name={social.name} /></a
            >
          </li>
        {/each}
      </ul>
    </div>

    <p class="mt-14 max-w-160 text-xs leading-relaxed text-steel">
      Morrow is not a bank, broker, or financial adviser.
    </p>

    <div
      class="mt-6 flex flex-col-reverse gap-4 border-t border-cream/10 pt-6 text-xs text-steel sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <p>© {year} Morrow. Buy, gift, grow.</p>
        <nav aria-label="Footer" class="flex flex-wrap gap-x-5">
          {#each pageLinks as link}
            <a
              href={link.href}
              class="flex min-h-11 items-center text-cream/80 underline-offset-4 transition-colors hover:text-cream hover:underline focus-visible:outline-cream"
              >{link.label}</a
            >
          {/each}
        </nav>
      </div>
      <a
        href="#main-content"
        class="footer-pop flex min-h-11 w-fit items-center gap-2 rounded-full bg-cream/10 px-4 text-cream focus-visible:outline-cream"
        >Back to top <span aria-hidden="true">↑</span></a
      >
    </div>
  </div>

  <!-- Oversized wordmark, cut off by the bottom edge on purpose. -->
  <p
    class="pointer-events-none relative mt-6 translate-y-[18%] text-center font-sans text-[26vw] leading-[0.8] tracking-[-0.08em] text-cream/[0.07] select-none"
    aria-hidden="true"
  >
    morrow<span class="text-orange/70">*</span>
  </p>
</footer>
