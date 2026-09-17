<script lang="ts">
import SocialIcon from './social-icon.svelte'

// Pastel tiles reuse the gift card colors from the sections above.
const socials = [
  {
    name: 'x',
    label: 'X',
    handle: '@trymorrow',
    href: 'https://x.com/trymorrow',
    color: 'bg-sun',
    tilt: '-rotate-2',
  },
  {
    name: 'reddit',
    label: 'Reddit',
    handle: 'r/TRYMORROW',
    href: 'https://www.reddit.com/r/TRYMORROW/',
    color: 'bg-[#ded1f1]',
    tilt: 'rotate-1',
  },
  {
    name: 'linkedin',
    label: 'LinkedIn',
    handle: 'Morrow',
    href: 'https://www.linkedin.com/company/trymorrow',
    color: 'bg-[#dbe7c9]',
    tilt: '-rotate-1',
  },
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
  <div class="mx-auto max-w-page px-5 pt-16 md:px-10 md:pt-24">
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

      <ul class="grid gap-3 sm:grid-cols-3 lg:w-150">
        {#each socials as social}
          <li>
            <a
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Morrow on ${social.label}`}
              class="footer-pop group flex min-h-20 items-center gap-3 rounded-card p-3 text-ink focus-visible:outline-cream sm:min-h-36 sm:flex-col sm:items-start sm:justify-between sm:p-4 {social.color} {social.tilt}"
            >
              <span class="flex size-11 items-center justify-center rounded-button bg-surface"
                ><SocialIcon name={social.name} /></span
              >
              <span class="flex flex-1 items-end justify-between gap-2 self-stretch sm:flex-none">
                <span>
                  <span class="block font-sans text-lg leading-tight">{social.label}</span>
                  <span class="block text-xs text-ink/60">{social.handle}</span>
                </span>
                <span
                  class="text-lg transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true">↗</span
                >
              </span>
            </a>
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
        <p>© {year} Morrow. A little gift, a big tomorrow.</p>
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
    class="pointer-events-none mt-6 translate-y-[18%] text-center font-sans text-[26vw] leading-[0.8] tracking-[-0.08em] text-cream/[0.07] select-none"
    aria-hidden="true"
  >
    morrow<span class="text-orange/70">*</span>
  </p>
</footer>
