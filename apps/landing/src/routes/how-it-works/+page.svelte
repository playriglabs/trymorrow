<script lang="ts">
import HomeFooter from '$lib/components/home-footer.svelte'
import HomeNav from '$lib/components/home-nav.svelte'
import Icon from '$lib/components/landing-icon.svelte'
import LockMark from '$lib/components/lock-mark.svelte'
import SeoHead from '$lib/components/seo-head.svelte'

const description =
  'Send a gift of shares or cash, open one, start a fund together, buy or sell with cash, and earn on what you have not spent. Here is how each one works.'

// Panel colors are the same pastels the landing cards use for each idea.
const flows = [
  {
    id: 'send',
    chip: 'Send a gift',
    icon: 'gift',
    color: 'bg-[#f1dfc7]',
    accent: 'bg-orange text-cream',
    title: 'Send a little gift.',
    text: 'Shares of a company they love, a bit of cash, or both, wrapped with your own words.',
    steps: [
      {
        title: 'Pick what to give',
        text: 'Choose up to three companies, add cash, or mix them in one gift.',
      },
      {
        title: 'Choose who it’s for',
        text: 'Send to their email or their Morrow handle, and write a note.',
      },
      {
        title: 'Send it',
        text: 'Big gift, tiny fee: usually just $0.19 to $0.48, shown before you confirm. Then it’s reserved for them alone.',
      },
    ],
    note: 'Not opened in 30 days? It comes back to you. You can also take it back any time before they open it.',
  },
  {
    id: 'open',
    chip: 'Open a gift',
    icon: 'heart',
    color: 'bg-[#dfe7d6]',
    accent: 'bg-[#486839] text-cream',
    title: 'Open what’s yours.',
    text: 'Someone thought of your tomorrow. Opening it takes a minute.',
    steps: [
      {
        title: 'Sign in',
        text: 'Use the email the gift was sent to. We send you a code, so there’s no password.',
      },
      {
        title: 'Find your gift',
        text: 'It’s waiting in Morrow with their note, ready to open.',
      },
      {
        title: 'Open it',
        text: 'The shares and cash move into your account and are yours to keep.',
      },
    ],
    note: 'Gifts sent to an email only open for that email. Signing in another way creates a different account.',
  },
  {
    id: 'fund',
    chip: 'Start a fund',
    icon: 'grow',
    color: 'bg-[#e0d5ed]',
    accent: 'bg-[#6f548d] text-cream',
    title: 'Build a future together.',
    text: 'A fund grows over time with help from the people who care, then unlocks on a day you choose.',
    steps: [
      {
        title: 'Set it up',
        text: 'Choose who it’s for and the date it unlocks. Neither can change later.',
      },
      {
        title: 'Invite your people',
        text: 'Anyone can add cash or shares they already own, up to six companies.',
      },
      {
        title: 'Unlock the day it’s due',
        text: 'Only the person it’s for can take it out, and only from the unlock date.',
      },
    ],
    note: 'Set up a college fund, a first-home fund, or a birthday that’s years away.',
  },
  {
    id: 'trade',
    chip: 'Buy and sell',
    icon: 'chart',
    color: 'bg-[#f6cfa9]',
    accent: 'bg-ink text-cream',
    title: 'Own a little piece.',
    text: 'Buy shares of well-known companies with cash, starting from a fraction of a share.',
    steps: [
      {
        title: 'Add cash',
        text: 'Move cash into your account from an exchange or another account.',
      },
      {
        title: 'Find a company',
        text: 'Search 142 stocks and Pre-IPO stocks and check live prices and simple charts.',
      },
      {
        title: 'Buy or sell',
        text: 'Pick an amount and confirm. Sell back to cash whenever you like.',
      },
    ],
    note: 'Cash out any time to an address you enter. You see any fee before you confirm.',
  },
]

const promises = [
  {
    icon: 'lock',
    title: 'You approve every move',
    text: 'Money only moves when you say so. Morrow can’t move it on its own and never holds it.',
  },
  {
    icon: 'person',
    title: 'No ID or selfie',
    text: 'Sign in with your email and start. No paperwork to get going.',
  },
  {
    icon: 'send',
    title: 'Private when you want',
    text: 'Choose to make a gift or transfer private, so its details stay off the public record.',
  },
]

const faqs = [
  {
    q: 'What do I actually own?',
    a: 'Shares on Morrow track the price of the real company’s stock. They’re issued by a partner and aren’t the same as holding the stock at a broker, so they may not come with voting rights.',
  },
  {
    q: 'What does it cost?',
    a: 'Almost nothing. Sending a gift or gift card usually costs just $0.19 to $0.48, even with three stocks and cash packed inside. That’s what delivery costs, passed on at cost. Buying or selling may add a small trading fee, and you always see the fee before you confirm.',
  },
  {
    q: 'What if they never open my gift?',
    a: 'After 30 days it comes back to you automatically. You can also take it back yourself any time before it’s opened.',
  },
  {
    q: 'What if they don’t have Morrow yet?',
    a: 'Send it to their email anyway. The gift waits for them, and it opens when they sign in with the code sent to that same email address — no app to install first, nothing for you to set up on their side.',
  },
  {
    q: 'What happens to cash I haven’t spent?',
    a: 'It can earn while it waits. Morrow lends it out on Solana at whichever rate is best that day, it never leaves your own account, and you take it back whenever you want. The rate moves with the market, so it isn’t a savings account and it isn’t a promise — and cash that’s earning can’t be spent on stocks or gifts until you move it back.',
  },
  {
    q: 'Can I change a fund after I start it?',
    a: 'No. Who it’s for and the unlock date are fixed, so everyone who adds to it knows exactly where it’s going.',
  },
]
</script>

<SeoHead title="How it works — Morrow" {description} path="/how-it-works" />

<HomeNav />

<main id="main-content">
  <section class="mx-auto max-w-page px-5 pt-36 pb-16 text-center md:px-10 md:pt-44 md:pb-20">
    <p class="text-[10px] tracking-widest text-stone">HOW IT WORKS</p>
    <h1
      class="mx-auto mt-4 max-w-220 font-sans text-[clamp(48px,8vw,112px)] leading-[0.95] tracking-[-0.065em] text-balance"
    >
      A little effort.<br /><span class="text-orange">A lot of good.</span>
    </h1>
    <p class="mx-auto mt-7 max-w-110 text-sm leading-relaxed text-stone md:text-base">
      Everything in Morrow takes a few taps. Here’s what happens when you give, open, grow, and
      trade.
    </p>
    <nav aria-label="On this page" class="mt-10 flex flex-wrap justify-center gap-2">
      {#each flows as flow}
        <a
          href={`#${flow.id}`}
          class="footer-pop flex min-h-11 items-center gap-2 rounded-full px-4 text-sm text-ink {flow.color}"
          ><Icon name={flow.icon} size={18} />{flow.chip}</a
        >
      {/each}
    </nav>
  </section>

  <div class="mx-auto flex max-w-page flex-col gap-5 px-5 md:gap-6 md:px-10">
    {#each flows as flow}
      <section
        id={flow.id}
        aria-labelledby={`${flow.id}-title`}
        class="scroll-mt-28 rounded-[32px] p-6 md:rounded-[40px] md:p-10 lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:gap-12 lg:p-14 {flow.color}"
      >
        <div class="flex flex-col">
          <span class="flex size-12 items-center justify-center rounded-[15px] {flow.accent}"
            ><Icon name={flow.icon} /></span
          >
          <h2
            id={`${flow.id}-title`}
            class="mt-8 font-sans text-[clamp(36px,5vw,60px)] leading-[1.02] tracking-[-0.055em] text-balance"
          >
            {flow.title}
          </h2>
          <p class="mt-4 max-w-100 text-sm leading-relaxed text-ink/70 md:text-base">{flow.text}</p>
          <p
            class="mt-8 max-w-100 rounded-card bg-surface/60 p-4 text-xs leading-relaxed text-ink/75 lg:mt-auto"
          >
            {flow.note}
          </p>
        </div>

        <ol class="mt-8 flex flex-col gap-3 lg:mt-0">
          {#each flow.steps as step, i}
            <li
              class="flex gap-4 rounded-3xl bg-surface p-5 md:gap-5 md:p-6 {i % 2 === 0
                ? 'lg:-rotate-1'
                : 'lg:rotate-1'}"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-cream font-sans text-lg"
                >{i + 1}</span
              >
              <div>
                <h3 class="font-sans text-xl tracking-tight">{step.title}</h3>
                <p class="mt-1 text-sm leading-relaxed text-stone">{step.text}</p>
              </div>
            </li>
          {/each}
        </ol>
      </section>
    {/each}
  </div>

  <section
    aria-labelledby="control-title"
    class="mx-auto max-w-page px-5 pt-24 pb-10 md:px-10 md:pt-32"
  >
    <h2 id="control-title" class="section-title max-w-160 text-balance">Your money stays yours.</h2>
    <ul class="mt-10 grid gap-3 md:grid-cols-3 md:gap-5">
      {#each promises as promise}
        <li class="rounded-3xl border border-line bg-surface p-6">
          <span
            class="flex size-12 items-center justify-center rounded-[15px] bg-orange-wash text-orange"
            >{#if promise.icon === 'lock'}<LockMark class="size-7" />{:else}<Icon
                name={promise.icon}
              />{/if}</span
          >
          <h3 class="mt-6 font-sans text-xl tracking-tight">{promise.title}</h3>
          <p class="mt-2 text-sm leading-relaxed text-stone">{promise.text}</p>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="faq-title" class="mx-auto max-w-225 px-5 pt-16 pb-24 md:px-10 md:pb-32">
    <h2 id="faq-title" class="section-title">Good to know.</h2>
    <div class="mt-10 divide-y divide-line border-y border-line">
      {#each faqs as faq}
        <details class="faq-row group">
          <summary
            class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 font-sans text-lg tracking-tight md:text-xl [&::-webkit-details-marker]:hidden"
            >{faq.q}<span
              class="flex size-9 shrink-0 items-center justify-center rounded-full bg-cream transition-transform duration-300 group-open:rotate-45"
              ><Icon name="plus" size={18} /></span
            ></summary
          >
          <p class="max-w-160 pb-6 text-sm leading-relaxed text-stone md:text-base">{faq.a}</p>
        </details>
      {/each}
    </div>
  </section>

  <!-- Bottom padding leaves room for the footer, which overlaps the section above it. -->
  <section class="bg-orange px-5 pt-20 pb-32 text-center text-cream md:pt-28 md:pb-40">
    <h2
      class="mx-auto max-w-200 font-sans text-[clamp(42px,7vw,96px)] leading-[1.02] tracking-tighter text-balance"
    >
      Ready to give a little?
    </h2>
    <a
      href="https://app.trymorrow.money/login"
      class="cta group mt-10 inline-flex min-h-13 items-center justify-center gap-4 rounded-full bg-ink px-7 text-sm text-cream"
      >Try it out <span class="transition-transform group-hover:translate-x-1"
        ><Icon size={19} /></span
      ></a
    >
  </section>
</main>

<HomeFooter />
