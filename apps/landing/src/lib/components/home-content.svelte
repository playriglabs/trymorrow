<script lang="ts">
import CurrencyDolarIcon from 'phosphor-svelte/lib/CurrencyDollarIcon'
import GiftIcon from 'phosphor-svelte/lib/GiftIcon'
import LinkSimpleIcon from 'phosphor-svelte/lib/LinkSimpleIcon'
import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon'
import PaperPlaneTiltIcon from 'phosphor-svelte/lib/PaperPlaneTiltIcon'
import PiggyBankIcon from 'phosphor-svelte/lib/PiggyBankIcon'
import { onMount } from 'svelte'
import { appUrl, telegramUrl } from '$lib/site'
import CardOrnament from './card-ornament.svelte'
import GiftPreview from './gift-preview.svelte'
import HomeFooter from './home-footer.svelte'
import HomeNav from './home-nav.svelte'
import Icon from './landing-icon.svelte'
import LockMark from './lock-mark.svelte'
import SocialIcon from './social-icon.svelte'
import StockMark from './stock-mark.svelte'

// The marks beside the two ways in: where Morrow is, in one narrow column
const appSocials = [
  { name: 'telegram', label: 'Telegram', href: telegramUrl },
  { name: 'x', label: 'X', href: 'https://x.com/trymorrow' },
  { name: 'reddit', label: 'Reddit', href: 'https://www.reddit.com/r/TRYMORROW/' },
  { name: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/company/trymorrow' },
] as const

const giftSteps = [
  {
    title: 'Pick what goes inside',
    text: 'A share of a company they love, some cash, or a little of both.',
  },
  {
    title: 'Say it in your own words',
    text: 'A short note travels with it, so the gift sounds like you.',
  },
  {
    title: 'They open it',
    text: 'Send it to an email, a Morrow handle or a Telegram name. Only they can open it.',
  },
]

const tourScreens = [
  {
    src: '/images/buy-screen.png',
    title: 'Buy a little',
    text: 'Search 188 stocks, Pre-IPO ones included, then start trade.',
    icon: MagnifyingGlassIcon,
  },
  {
    src: '/images/trade-screen.png',
    title: 'Trade in a tap',
    text: 'Live prices, simple charts, and one-tap buys.',
    icon: CurrencyDolarIcon,
  },
  {
    src: '/images/fund-screen.png',
    title: 'Funds that grow',
    text: 'Set a goal, invite family, and watch it build together.',
    icon: PiggyBankIcon,
  },
  {
    src: '/images/sendgift-screen.png',
    title: 'Send a gift',
    text: 'Cash or shares, wrapped in a personal note.',
    icon: PaperPlaneTiltIcon,
  },
  {
    src: '/images/giftcard-screen.png',
    title: 'Gift cards, remixed',
    text: 'Bundle stocks and cash into one little card.',
    icon: GiftIcon,
  },
  {
    src: '/images/profile-screen.png',
    title: 'Your gift link',
    text: 'One link that lets anyone send you a gift.',
    icon: LinkSimpleIcon,
  },
]

let root: HTMLElement
onMount(() => {
  let dispose: (() => void) | undefined
  let cancelled = false
  import('$lib/home-motion')
    .then(({ initHomeMotion }) => {
      if (!cancelled) dispose = initHomeMotion(root)
    })
    .catch(() => {
      /* The prerendered page stays fully usable if animation cannot load. */
    })
  return () => {
    cancelled = true
    dispose?.()
  }
})
</script>

<div bind:this={root}>
  <HomeNav />
  <main id="main-content">
    <section
      id="home"
      aria-labelledby="hero-title"
      class="relative overflow-hidden pt-36.25 text-center md:pt-41"
    >
      <div class="hero-intro relative z-10 mx-auto px-5">
        <h1
          id="hero-title"
          class="mx-auto max-w-page font-sans text-[clamp(48px,8.8vw,126px)] leading-[0.92] tracking-[-0.075em]"
        >
          <span class="block">Buy, gift, grow.</span><span class="block text-orange"
            >A big tomorrow.</span
          >
        </h1>
        <p
          class="mx-auto mt-7 max-w-90 text-sm leading-relaxed text-stone md:max-w-110 md:text-base"
        >
          Send cash, Buy stocks, Gift them. Build a future together.<br class="hidden sm:block" /> A little
          today can mean a lot tomorrow.
        </p>
        <a
          href="https://app.trymorrow.money/login"
          class="cta group mt-6 inline-flex min-h-13 items-center justify-center gap-4 rounded-full bg-ink px-7 text-sm text-cream"
          >Try it out <span class="transition-transform group-hover:translate-x-1"
            ><Icon size={19} /></span
          ></a
        >
      </div>
      <div
        class="hero-art relative mx-auto mt-12 h-138.75 max-w-262.5 md:mt-14 md:h-165"
        aria-hidden="true"
      >
        <div
          class="hero-halo absolute top-32 left-1/2 h-125 w-212.5 -translate-x-1/2 rounded-[50%] bg-[#f5ddbd]/50 blur-3xl"
        ></div>
        <div class="hero-gift absolute top-28 left-[8%] z-20 w-65 -rotate-12 md:z-0 lg:z-20">
          <GiftPreview />
        </div>
        <!-- Add your app screenshot inside this reserved hero slot. -->
        <div class="hero-screenshot absolute top-0 left-1/2 z-10 h-165 w-82.5 -translate-x-1/2">
          <img
            src="/images/app-preview.png"
            alt="Morrow app home screen"
            width="822"
            height="1743"
            class="h-full w-full object-contain object-top"
            loading="eager"
          />
        </div>
        <div
          class="hero-stock absolute top-24 right-[7%] z-20 w-55 rotate-10 rounded-3xl bg-[#ded1f1] p-5 text-left md:z-0 lg:z-20"
        >
          <div class="flex justify-between">
            <StockMark stock="apple" color="#fffefb" size={45} /><Icon name="diagonal" size={19} />
          </div>
          <p class="mt-7 text-xs text-ink/70">A piece of something big.</p>
          <p class="mt-0.5 font-sans text-[44px] leading-none tracking-[-0.06em]">Apple</p>
          <div class="mt-4 flex items-baseline gap-2 border-t border-ink/15 pt-3">
            <span class="font-sans text-lg tracking-tight">$2.50</span><span class="text-[11px]"
              >a share, or less</span
            >
          </div>
        </div>
        <!-- The gift card, the other way to send one: a code anyone can redeem. -->
        <div
          class="hero-redeem absolute top-107.5 left-[11%] z-20 w-52 rotate-6 overflow-hidden rounded-3xl bg-surface text-left shadow-[0_18px_40px_-22px_rgb(76_40_6/0.45)]"
        >
          <div class="bg-orange px-4 pt-4 pb-5 text-white">
            <div class="flex items-center justify-between text-[10px]">
              <span>Morrow gift card</span><Icon name="gift" size={15} />
            </div>
            <p class="mt-3 font-sans text-[28px] leading-none tracking-[-0.05em]">$50.00</p>
          </div>
          <div class="border-t border-dashed border-line px-4 py-3">
            <div class="flex items-end justify-between gap-2">
              <div>
                <p class="text-[10px] text-stone">Redeem code</p>
                <p class="mt-0.5 font-sans text-sm tracking-tight">7QF4-2M9K-8RD3</p>
              </div>
              <!-- What's inside the card, so the code isn't the only thing it says. -->
              <div class="flex shrink-0 items-center -space-x-1.5">
                <span class="inline-flex rounded-full ring-2 ring-surface"
                  ><StockMark stock="openai" size={22} /></span
                >
                <span class="inline-flex rounded-full ring-2 ring-surface"
                  ><StockMark stock="anthropic" size={22} /></span
                >
                <span class="inline-flex rounded-full ring-2 ring-surface"
                  ><StockMark stock="nvidia" size={22} scale={0.6} /></span
                >
              </div>
            </div>
          </div>
        </div>
        <div
          class="hero-note absolute top-103.75 right-[12%] z-20 -rotate-6 rounded-full bg-[#d9e9c8] px-5 py-3 text-xs"
        >
          <span class="mr-2">✳</span> A future worth sharing.
        </div>
      </div>
      <p class="relative z-30 mt-6 hidden px-5 pb-2 text-xs text-stone md:block">
        <span class="mr-1.5 rounded-full bg-sun px-2.5 py-1 text-ink">Tiny fees</span> Most gifts and
        trades cost under 50¢.
      </p>
      <div
        class="relative z-30 mx-auto hidden max-w-page items-center justify-between gap-4 px-6 pt-2 pb-10 text-[10px] text-stone sm:flex md:px-10 md:text-xs"
      >
        <span>For your people. For what’s next.</span><a
          href="#how-it-works"
          class="flex min-h-11 items-center gap-3"
          >A little more below <span class="rotate-90"><Icon size={17} /></span></a
        >
      </div>
    </section>

    <section
      id="how-it-works"
      aria-labelledby="how-title"
      class="mx-auto max-w-page scroll-mt-10 px-5 py-20 md:px-10 md:py-28"
    >
      <div class="reveal mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <h2 id="how-title" class="section-title mt-4">
            Small gestures.<br />Bigger possibilities.
          </h2>
        </div>
        <p class="max-w-66.25 text-sm leading-relaxed text-stone">
          For birthdays, new beginnings,<br />and the just-because moments.
        </p>
      </div>
      <!-- Below lg the cards swipe sideways and bleed to the screen edge, so the next one peeks in. -->
      <div
        class="reveal -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:-mx-10 md:scroll-px-10 md:gap-5 md:px-10 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        <article class="w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
          <div
            class="group relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#f1dfc7] px-8"
          >
            <div
              class="w-full max-w-65 rotate-[-9deg] transition-transform duration-500 group-hover:scale-105 group-hover:rotate-0"
            >
              <GiftPreview compact />
            </div>
            <span
              class="absolute right-4 bottom-5 rotate-[-10deg] rounded-full bg-[#d3e7bb] px-4 py-2 font-sans text-sm"
              >Less stuff. More future.</span
            >
          </div>
          <div class="px-2 pt-5">
            <h3 class="text-xl">Give a little ownership.</h3>
            <p class="mt-2 max-w-70 text-sm leading-relaxed text-stone">
              A piece of a company they love. A personal note from you. A gift that’s theirs.
            </p>
          </div>
        </article>
        <article class="w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
          <div
            class="group relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#dfe7d6]"
          >
            <div class="relative w-61.25">
              <div
                class="absolute -top-16 -right-1 rotate-12 rounded-[22px] bg-[#bacaaf] px-8 py-6 font-sans text-6xl text-[#345839] transition-transform duration-500 group-hover:-translate-y-2.5"
              >
                $
              </div>
              <div
                class="relative -rotate-6 rounded-[22px] bg-surface p-5 transition-transform duration-500 group-hover:rotate-0"
              >
                <div class="flex items-center gap-3">
                  <span
                    class="flex size-10 items-center justify-center rounded-full bg-orange-wash text-orange"
                    ><Icon name="send" size={20} /></span
                  ><span class="text-sm">A little pick-me-up</span>
                </div>
                <p
                  class="my-6 flex items-baseline gap-1 font-sans leading-none tabular-nums"
                  aria-label="$25.00"
                >
                  <span class="text-[60px] tracking-[-0.06em]">$25</span>
                  <span class="text-3xl tracking-normal text-stone">.00</span>
                </p>
                <div class="flex items-center justify-between border-t border-line pt-4 text-xs">
                  <span>For Jamie, from Alex</span><span class="text-gain"
                    ><Icon name="check" size={17} /></span
                  >
                </div>
              </div>
              <div
                class="absolute -right-3 -bottom-10 rotate-6 rounded-full bg-sun px-5 py-3 font-sans text-sm"
              >
                Coffee’s on me ☀
              </div>
            </div>
          </div>
          <div class="px-2 pt-5">
            <h3 class="text-xl">Send a little happiness.</h3>
            <p class="mt-2 max-w-70 text-sm leading-relaxed text-stone">
              Coffee money or a birthday surprise. Send cash with a little extra thought.
            </p>
          </div>
        </article>
        <article class="w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
          <div
            class="group relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#ded4ef] px-7"
          >
            <div
              class="relative mt-7 w-full max-w-70 rotate-6 rounded-[22px] bg-surface p-5 transition-transform duration-500 group-hover:rotate-0"
            >
              <div class="mb-5 flex items-center justify-between">
                <span
                  class="flex size-11 items-center justify-center rounded-full bg-[#ede4f7] text-[#775298]"
                  ><Icon name="grow" /></span
                ><span class="rounded-full bg-cream px-3 py-1 text-[10px] text-stone"
                  >Made together</span
                >
              </div>
              <p class="font-sans text-xl">Maya’s next chapter</p>
              <p class="mt-1 text-xs text-stone">A family fund for a bright future</p>
              <p class="mt-7 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-sans tabular-nums">
                <span class="text-4xl leading-none tracking-tighter">$2,450</span>
                <span class="text-xs tracking-normal whitespace-nowrap text-stone">of $5,000</span>
              </p>
              <div class="mt-3 h-2 rounded-full bg-cream">
                <div class="h-full w-[49%] rounded-full bg-[#ad8dcc]"></div>
              </div>
              <div class="mt-5 flex items-center justify-between text-[10px] text-stone">
                <span class="flex -space-x-2"
                  >{#each ['A', 'J', 'M'] as letter}<span
                      class="flex size-7 items-center justify-center rounded-full border-2 border-surface bg-line text-ink"
                      >{letter}</span
                    >{/each}</span
                ><span>A little from all of us</span>
              </div>
            </div>
          </div>
          <div class="px-2 pt-5">
            <h3 class="text-xl">Build a little, together.</h3>
            <p class="mt-2 max-w-70 text-sm leading-relaxed text-stone">
              Start a fund for someone’s future. Invite your people. Give it time.
            </p>
          </div>
        </article>
      </div>
    </section>

    <!-- The gift itself, start to finish: the one flow everything else on this page leads to. -->
    <section
      id="gifting"
      aria-labelledby="gifting-title"
      class="mx-auto max-w-page scroll-mt-10 px-5 pb-20 md:px-10 md:pb-28"
    >
      <div class="reveal grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <span class="text-[10px] tracking-widest text-stone">SENDING ONE</span>
          <h2 id="gifting-title" class="section-title mt-4">
            Three taps, and<br />it’s on its way.
          </h2>
          <p class="mt-5 max-w-97.5 text-sm leading-relaxed text-stone">
            No wrapping paper, no gift shop, nothing for them to sign up for first. Most gifts cost
            under 50¢ to send.
          </p>
          <ol class="mt-8 flex flex-col">
            {#each giftSteps as step, i}
              <li class="flex items-start gap-5 border-t border-line py-5">
                <span
                  class="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-orange-wash font-sans text-lg text-orange"
                  >{i + 1}</span
                >
                <div>
                  <h3 class="text-xl">{step.title}</h3>
                  <p class="mt-1 max-w-95 text-sm leading-relaxed text-stone">{step.text}</p>
                </div>
              </li>
            {/each}
          </ol>
          <a
            href="{appUrl}/login"
            class="cta group mt-8 inline-flex min-h-13 items-center justify-center gap-4 rounded-full bg-ink px-7 text-sm text-cream"
            >Send your first gift <span class="transition-transform group-hover:translate-x-1"
              ><Icon size={19} /></span
            ></a
          >
        </div>
        <!-- The other way to send one, for someone who isn’t here yet: a card with a code. -->
        <div
          class="group relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#f1dfc7] px-8 md:aspect-[1.15]"
        >
          <CardOrnament variant="sparkles" />
          <div
            class="relative w-64 -rotate-6 overflow-hidden rounded-[22px] bg-surface text-left shadow-[0_18px_40px_-22px_rgb(76_40_6/0.45)] transition-transform duration-500 group-hover:rotate-0"
          >
            <div class="bg-orange px-5 pt-5 pb-6 text-white">
              <div class="flex items-center justify-between text-[11px]">
                <span>Morrow gift card</span><Icon name="gift" size={16} />
              </div>
              <p class="mt-4 font-sans text-[34px] leading-none tracking-[-0.05em]">$50.00</p>
              <p class="mt-1 text-[11px] text-white/85">Two stocks and a little cash</p>
            </div>
            <div class="border-t border-dashed border-line px-5 py-4">
              <div class="flex items-end justify-between gap-2">
                <div>
                  <p class="text-[10px] text-stone">Redeem code</p>
                  <p class="mt-0.5 font-sans text-sm tracking-tight">7QF4-2M9K-8RD3</p>
                </div>
                <div class="flex shrink-0 items-center -space-x-1.5">
                  <span class="inline-flex rounded-full ring-2 ring-surface"
                    ><StockMark stock="openai" size={24} /></span
                  >
                  <span class="inline-flex rounded-full ring-2 ring-surface"
                    ><StockMark stock="nvidia" size={24} scale={0.6} /></span
                  >
                </div>
              </div>
            </div>
          </div>
          <span
            class="absolute right-5 bottom-6 rotate-[-8deg] rounded-full bg-[#d3e7bb] px-4 py-2 font-sans text-sm"
            >Anyone can open it.</span
          >
        </div>
      </div>
    </section>

    <section aria-labelledby="together-title" class="together-section relative bg-surface">
      <div class="together-stage relative h-svh w-full overflow-hidden">
        <div class="together-canvas relative mx-auto h-full max-w-360">
          <div
            class="together-heading absolute inset-0 z-10 flex items-center justify-center px-5 text-center"
          >
            <h2
              id="together-title"
              class="font-sans text-[clamp(54px,11vw,160px)] leading-[0.95] tracking-[-0.065em] text-orange"
            >
              Bring your<br />tomorrows together.
            </h2>
          </div>
          <div
            class="gather-card gather-one absolute top-[9%] left-[17%] z-20 w-52.5 -rotate-12 rounded-3xl bg-[#dbe7c9] p-5"
          >
            <div class="flex justify-between">
              <StockMark stock="nvidia" color="#fffefb" /><Icon name="chart" size={20} />
            </div>
            <p class="mt-5 text-xs">Nvidia, from a few dollars.</p>
            <p class="mt-1 font-sans text-4xl tracking-tighter">Start small.</p>
            <p class="mt-4 text-[10px] text-stone">Fractions of a share, priced live.</p>
          </div>
          <div
            class="gather-card gather-two absolute top-[7%] right-[16%] z-30 w-55 rotate-[9deg] rounded-3xl bg-[#ded1f1] p-5"
          >
            <div class="flex items-center justify-between text-xs">
              <span>Your next chapter</span><Icon name="grow" size={22} />
            </div>
            <p class="mt-7 font-sans text-4xl tracking-tighter">Dream big.<br />Start little.</p>
            <div class="mt-5 rounded-full bg-surface/70 px-4 py-2 text-center text-xs">
              A fund for their future ↗
            </div>
          </div>
          <div
            class="gather-card gather-three absolute top-[41%] left-[5%] z-30 w-51.25 rotate-[-8deg] rounded-3xl bg-sun p-5"
          >
            <Icon name="send" size={30} />
            <p class="mt-6 font-sans text-[43px] leading-none tracking-tighter">
              A little<br />love, sent.
            </p>
            <div class="mt-6 flex items-center gap-2 text-xs">
              <Icon name="check" size={16} /><span>$25.00 for Jamie</span>
            </div>
          </div>
          <div
            class="gather-card gather-four absolute top-[66%] right-[13%] z-20 w-57.5 rotate-12 rounded-3xl bg-[#f0d8cd] p-5"
          >
            <span class="text-[12px]">The best kind notification</span>
            <div class="my-5 flex size-12 items-center justify-center rounded-full bg-surface">
              <Icon name="heart" size={25} />
            </div>
            <p class="font-sans text-2xl leading-tight">Someone’s thinking<br />of your future.</p>
            <p class="mt-4 text-xs text-stone">You have a gift from Alex.</p>
          </div>
          <div
            class="gather-card gather-five absolute top-[67%] left-[24%] z-40 w-58.75 rotate-[-7deg]"
          >
            <GiftPreview />
          </div>
          <div
            class="action-words pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-surface px-5"
            aria-hidden="true"
          >
            {#each [{ word: 'Give.', icon: 'gift', color: '#f66f00' }, { word: 'Invest.', icon: 'chart', color: '#6f548d' }, { word: 'Grow.', icon: 'grow', color: '#486839' }] as action}
              <div
                class="action-word flex items-center gap-4 font-sans text-[clamp(64px,9vw,130px)] leading-[1.13] tracking-[-0.065em]"
                style:color={action.color}
              >
                <span
                  class="flex size-14 items-center justify-center rounded-[18px] text-white md:size-20 md:rounded-[25px]"
                  style:background={action.color}><Icon name={action.icon} size={34} /></span
                >{action.word}
              </div>
            {/each}
            <p class="mt-7 text-sm text-stone">A little of each. All in Morrow.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Above lg this section is tall and pinned: scrolling down walks the cards sideways, and
         normal scrolling picks up again once the last one has passed. -->
    <section
      id="made-for-you"
      aria-labelledby="features-title"
      class="scroll-mt-10 pt-24 pb-20 md:pt-32 md:pb-28"
    >
      <div class="features-pin mx-auto max-w-280 px-5 md:px-10">
        <div
          class="features-head reveal mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end"
        >
          <div>
            <h2 id="features-title" class="section-title mt-4">
              A little app.<br />A whole lot of good.
            </h2>
          </div>
          <a
            href="https://app.trymorrow.money/login"
            class="group flex min-h-11 w-fit items-center gap-5 text-sm"
            >Find your tomorrow <span class="transition-transform group-hover:translate-x-1"
              ><Icon size={19} /></span
            ></a
          >
        </div>
        <!-- Below lg these swipe sideways like the section above, bleeding to the screen edge. -->
        <div
          class="features-track -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:-mx-10 md:scroll-px-10 md:gap-6 md:px-10 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-2 lg:gap-x-6 lg:gap-y-12 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          <article class="reveal w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
            <div
              class="feature-art relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#e4ead9] lg:aspect-[1.35]"
            >
              <CardOrnament variant="orbit" />
              <div class="relative w-[75%] max-w-78.75 -rotate-6 rounded-[22px] bg-surface p-5">
                <div class="mb-5 flex justify-between text-xs">
                  <span>Meet your next little investment</span><Icon name="diagonal" size={17} />
                </div>
                {#each [{ name: 'OpenAI', logo: 'openai', color: '#10a37f', detail: 'Pre-IPO, before it lists.' }, { name: 'Anthropic', logo: 'anthropic', color: '#d4a27f', detail: 'Pre-IPO, owned early.' }, { name: 'Nvidia', logo: 'nvidia', color: '#d5efb2', detail: 'A little of the next big thing.' }] as stock}<div
                    class="flex items-center gap-3 border-t border-line py-3"
                  >
                    <StockMark stock={stock.logo} color={stock.color} size={36} scale={0.68} />
                    <div>
                      <p class="font-sans text-sm">{stock.name}</p>
                      <p class="text-[10px] text-stone">{stock.detail}</p>
                    </div>
                    <span class="ml-auto text-stone">↗</span>
                  </div>{/each}
              </div>
            </div>
            <div class="px-2 pt-5">
              <h3 class="text-xl">Buy and sell, a little at a time.</h3>
              <p class="mt-2 max-w-114.5 text-sm leading-relaxed text-stone">
                A fraction of a share in companies you know, plus Pre-IPO names like OpenAI and
                Anthropic before they list. Sell back to cash whenever you like.
              </p>
            </div>
          </article>
          <article class="reveal w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
            <div
              class="feature-art relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#eddbc3] lg:aspect-[1.35]"
            >
              <CardOrnament variant="sparkles" />
              <div class="absolute top-8 left-10 w-55 -rotate-12 opacity-45">
                <GiftPreview compact stock="apple" markColor="#eeeae2" />
              </div>
              <div class="relative mt-8 ml-12 w-62.5 rotate-10"><GiftPreview compact /></div>
            </div>
            <div class="px-2 pt-5">
              <h3 class="text-xl">More thoughtful than a gift card.</h3>
              <p class="mt-2 max-w-100.5 text-sm leading-relaxed text-stone">
                Choose shares or cash, add your words, and send to their email or Morrow handle. Big
                gift, tiny fee: most cost under 50¢ to send.
              </p>
            </div>
          </article>
          <article class="reveal w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
            <div
              class="feature-art relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#e0d5ed] lg:aspect-[1.35]"
            >
              <CardOrnament variant="sunburst" />
              <div class="relative w-[75%] max-w-77.5 rotate-[-5deg] rounded-[22px] bg-surface p-6">
                <div class="flex items-center justify-between">
                  <span
                    class="flex size-11 items-center justify-center rounded-full bg-[#e9ddf3] text-[#775298]"
                    ><Icon name="grow" /></span
                  ><span class="rounded-full bg-cream px-3 py-1.5 text-[10px] text-stone"
                    >For Maya</span
                  >
                </div>
                <p class="mt-5 font-sans text-2xl">Their future.<br />A family effort.</p>
                <div class="mt-5 flex justify-between text-[11px] text-stone">
                  <span>College fund</span><span>$2,450 / $5,000</span>
                </div>
                <div class="mt-2 h-2 rounded-full bg-cream">
                  <div class="h-full w-[49%] rounded-full bg-[#ad8dcc]"></div>
                </div>
                <div class="mt-5 flex items-center gap-2 text-[10px] text-stone">
                  <LockMark class="size-3.5" />Set a date. Give it time.
                </div>
              </div>
            </div>
            <div class="px-2 pt-5">
              <h3 class="text-xl">Some dreams take a village.</h3>
              <p class="mt-2 max-w-92.5 text-sm leading-relaxed text-stone">
                Start a fund, choose an unlock date, and let the people who care add to it together.
              </p>
            </div>
          </article>
          <article class="reveal w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
            <div
              class="feature-art relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#f6cfa9] lg:aspect-[1.35]"
            >
              <CardOrnament variant="security" />
              <div
                class="relative w-[73%] max-w-73.75 rotate-6 rounded-[22px] bg-surface p-6 text-center"
              >
                <div
                  class="mx-auto flex size-14 items-center justify-center rounded-[18px] bg-orange-wash text-orange"
                >
                  <LockMark class="size-9" />
                </div>
                <p class="mt-4 font-sans text-[22px] leading-[1.15] tracking-[-0.04em]">
                  For them.<br />And send it privately.
                </p>
                <div class="mt-4 rounded-full bg-cream px-3 py-3 text-[11px] text-stone">
                  Made personal. Kept personal.
                </div>
              </div>
            </div>
            <div class="px-2 pt-5">
              <h3 class="text-xl">A gift with their name on it.</h3>
              <p class="mt-2 max-w-116.5 text-sm leading-relaxed text-stone">
                Only your recipient can open their gift. If it’s left unopened, it comes back after
                30 days. zero-knowledge privacy to keep gift details private.
              </p>
            </div>
          </article>
          <article class="reveal w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
            <div
              class="feature-art relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#dde9e0] lg:aspect-[1.35]"
            >
              <CardOrnament variant="growth" />
              <div
                class="feature-mock relative w-[75%] max-w-78.75 rotate-2 rounded-[22px] bg-surface p-5"
              >
                <div class="mb-4 flex items-center justify-between text-xs">
                  <span>Your cash</span><span class="text-stone">Today</span>
                </div>
                <div class="flex items-center gap-3 border-t border-line py-3">
                  <span
                    class="flex size-9 items-center justify-center rounded-full bg-[#e8f1e9] text-base"
                    aria-hidden="true">🌱</span
                  >
                  <div>
                    <p class="font-sans text-sm">Earning</p>
                    <p class="text-[10px] text-stone">Take it back any time</p>
                  </div>
                  <span class="ml-auto font-sans text-sm">$250.00</span>
                </div>
                <div class="flex items-center gap-3 border-t border-line py-3">
                  <span
                    class="flex size-9 items-center justify-center rounded-full bg-cream text-base"
                    aria-hidden="true">💵</span
                  >
                  <div>
                    <p class="font-sans text-sm">Ready to spend</p>
                    <p class="text-[10px] text-stone">Stocks, gifts, funds</p>
                  </div>
                  <span class="ml-auto font-sans text-sm">$50.00</span>
                </div>
                <div
                  class="mt-3 rounded-full bg-[#e8f1e9] px-3 py-2 text-center text-[11px] text-stone"
                >
                  Rate moves with the market
                </div>
              </div>
            </div>
            <div class="px-2 pt-5">
              <h3 class="text-xl">Cash that doesn’t sit still.</h3>
              <p class="mt-2 max-w-116.5 text-sm leading-relaxed text-stone">
                Cash waiting for its next stock earns at the best rate we can find. Nothing is
                locked, it stays in your own account, and the rate moves with the market.
              </p>
            </div>
          </article>
          <!-- The other side of Earn. The fall that gets the shares sold is on the card, because
               the app never shows a loan without it. -->
          <article class="reveal w-[82%] shrink-0 snap-start md:w-[46%] lg:w-auto">
            <div
              class="feature-art relative flex aspect-[0.92] items-center justify-center overflow-hidden rounded-3xl bg-[#dbe4f0] lg:aspect-[1.35]"
            >
              <CardOrnament variant="orbit" />
              <div
                class="feature-mock relative w-[75%] max-w-78.75 -rotate-3 rounded-[22px] bg-surface p-5"
              >
                <div class="mb-4 flex items-center justify-between text-xs">
                  <span>Cash against your shares</span><span class="text-stone">Tesla</span>
                </div>
                <div class="flex items-center gap-3 border-t border-line py-3">
                  <StockMark stock="tesla" color="#eef0f4" size={36} scale={0.6} />
                  <div>
                    <p class="font-sans text-sm">Your shares</p>
                    <p class="text-[10px] text-stone">Still yours, still growing</p>
                  </div>
                  <span class="ml-auto font-sans text-sm">$1,000.00</span>
                </div>
                <div class="flex items-center gap-3 border-t border-line py-3">
                  <span
                    class="flex size-9 items-center justify-center rounded-full bg-[#e6ecf5] text-base"
                    aria-hidden="true">💵</span
                  >
                  <div>
                    <p class="font-sans text-sm">Borrowed</p>
                    <p class="text-[10px] text-stone">Pay it back any time</p>
                  </div>
                  <span class="ml-auto font-sans text-sm">$300.00</span>
                </div>
                <div
                  class="mt-3 rounded-full bg-[#e6ecf5] px-3 py-2 text-center text-[11px] text-stone"
                >
                  Sold only if Tesla falls 62%
                </div>
              </div>
            </div>
            <div class="px-2 pt-5">
              <h3 class="text-xl">Cash, without selling.</h3>
              <p class="mt-2 max-w-116.5 text-sm leading-relaxed text-stone">
                Borrow cash against the shares you hold and pay it back when you like. If the stock
                falls far enough, shares are sold to cover the loan, so you always see how far that
                is.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section
      id="app-tour"
      aria-labelledby="tour-title"
      class="relative py-24 md:py-32 lg:h-[560svh] lg:py-0"
    >
      <div
        class="tour-pin mx-auto grid max-w-page gap-12 px-5 md:px-10 lg:sticky lg:top-0 lg:min-h-svh lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-16"
      >
        <div class="tour-sticky">
          <span class="text-[10px] tracking-widest text-stone">INSIDE THE APP</span>
          <h2 id="tour-title" class="section-title mt-4">
            Every screen,<br />made little.
          </h2>
        </div>
        <div
          class="tour-stage relative h-137.5 w-72 justify-self-center overflow-hidden md:w-86.5"
          aria-hidden="true"
        >
          {#each tourScreens as screen, i}
            <img
              src={screen.src}
              alt=""
              width="714"
              height="1454"
              loading={i === 0 ? 'eager' : 'lazy'}
              class="tour-img absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-500"
              class:opacity-0={i > 0}
            />
          {/each}
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-cream to-transparent"
          ></div>
        </div>
        <div class="tour-list flex flex-col lg:h-svh lg:justify-center">
          <p class="tour-intro max-w-88 text-sm leading-relaxed text-stone">
            Buy, trade, gift, and grow — all from one cozy place.
          </p>
          <div class="tour-steps mt-8 flex flex-col">
            {#each tourScreens as screen, i}
              <div
                class="tour-step flex items-center gap-5 py-3.5"
                data-step={i}
                data-active={String(i === 0)}
              >
                <span
                  class="tour-dot flex size-12 shrink-0 items-center justify-center rounded-[15px] transition-all duration-300 {i ===
                  0
                    ? 'bg-orange text-cream'
                    : 'bg-ink/5 text-stone'}"
                >
                  <screen.icon size={24} weight="duotone" class="transition-all duration-300" />
                </span>
                <div>
                  <h3 class="text-xl transition-colors duration-300" class:text-orange={i === 0}>
                    {screen.title}
                  </h3>
                  <p class="mt-1 text-sm leading-relaxed text-stone">{screen.text}</p>
                </div>
              </div>
            {/each}
          </div>
          <div class="tour-bars mt-3 hidden justify-center gap-1.5" aria-hidden="true">
            {#each tourScreens as _, i}
              <span
                class="tour-bar h-1 rounded-full transition-all duration-300 {i === 0
                  ? 'w-8 bg-orange'
                  : 'w-4 bg-ink/10'}"
              ></span>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <!-- Two doors into the same app, laid out as one panel: the statement, the two ways in,
         and the marks that open them. Neither is a store download. -->
    <section
      id="get-morrow"
      aria-labelledby="get-title"
      class="mx-auto max-w-page scroll-mt-10 px-5 pt-8 pb-24 md:px-10 md:pt-16 md:pb-32"
    >
      <div
        class="reveal rounded-[36px] bg-[#f1dfc7] p-3 md:rounded-[48px] md:p-4 lg:grid lg:grid-cols-[1.35fr_1fr_auto] lg:gap-4"
      >
        <div class="grid gap-3 md:gap-4 lg:contents">
          <article
            class="flex flex-col justify-between gap-10 rounded-[28px] bg-surface p-7 md:rounded-[36px] md:p-10 lg:col-start-1 lg:row-span-2 lg:row-start-1"
          >
            <div>
              <span class="text-[10px] tracking-widest text-stone">TWO WAYS IN</span>
              <h2
                id="get-title"
                class="mt-4 font-sans text-[clamp(40px,5vw,72px)] leading-[0.97] tracking-[-0.06em]"
              >
                Home screen,<br />or Telegram.
              </h2>
            </div>
            <div>
              <p class="max-w-90 text-sm leading-relaxed text-stone">
                Nothing to download from a store, nothing to update. The same Morrow either way,
                with the same account behind it.
              </p>
              <div class="mt-7 flex items-center gap-3">
                <img
                  src="/trymorrow-logo-rounded.png"
                  alt=""
                  width="29"
                  height="29"
                  class="size-11 rounded-[14px]"
                />
                <span class="font-sans text-2xl leading-none tracking-tighter"
                  >morrow<span class="text-orange">*</span></span
                >
              </div>
            </div>
          </article>

          <article
            class="rounded-[28px] bg-surface p-7 md:rounded-[36px] md:p-8 lg:col-start-2 lg:row-start-1"
          >
            <h3 class="font-sans text-2xl tracking-[-0.04em]">Keep it on your home screen</h3>
            <div class="mt-5 rounded-[20px] bg-cream p-4">
              <div class="flex items-center gap-3">
                <img
                  src="/trymorrow-logo-rounded.png"
                  alt=""
                  width="29"
                  height="29"
                  class="size-10 rounded-[12px]"
                />
                <div>
                  <p class="font-sans text-sm leading-none">Morrow</p>
                  <p class="mt-1 text-[10px] text-stone">app.trymorrow.money</p>
                </div>
                <span class="ml-auto flex items-center gap-1.5 text-[11px] text-stone"
                  ><Icon name="plus" size={14} /> Add</span
                >
              </div>
            </div>
            <p class="mt-4 text-sm leading-relaxed text-stone">
              Open it once in your browser and add it to your home screen. Full screen, works
              offline, updates itself.
            </p>
            <a
              href="{appUrl}/login"
              class="cta group mt-6 inline-flex min-h-12 items-center justify-center gap-4 rounded-full bg-ink px-6 text-sm text-cream"
              >Open the web app <span class="transition-transform group-hover:translate-x-1"
                ><Icon size={18} /></span
              ></a
            >
          </article>

          <article
            class="rounded-[28px] bg-surface p-7 md:rounded-[36px] md:p-8 lg:col-start-2 lg:row-start-2"
          >
            <h3 class="font-sans text-2xl tracking-[-0.04em]">Or keep it inside Telegram</h3>
            <div class="mt-5 rounded-[20px] bg-white p-4">
              <div class="rounded-[20px] rounded-bl-md bg-[#e3eef8] px-4 py-3 text-xs">
                You have a gift from @alex ✨
              </div>
            </div>
            <p class="mt-4 text-sm leading-relaxed text-stone">
              The Mini App knows you the moment it opens, gifts can go to a Telegram name, and news
              of one arrives as a message.
            </p>
            <a
              href={telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="cta group mt-6 inline-flex min-h-12 items-center justify-center gap-4 rounded-full bg-ink px-6 text-sm text-cream"
              >Open in Telegram <span class="transition-transform group-hover:translate-x-1"
                ><Icon size={18} /></span
              ></a
            >
          </article>

          <!-- The marks on their own, centred: every place Morrow answers, the Mini App first -->
          <aside
            class="flex items-center justify-center gap-3 rounded-[28px] bg-surface p-4 md:rounded-[36px] lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:flex-col lg:gap-4 lg:px-4"
          >
            {#each appSocials as social}
              <a
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Morrow on ${social.label}`}
                class="flex size-14 items-center justify-center rounded-[20px] bg-cream text-ink transition-colors hover:bg-orange-wash hover:text-orange md:size-16"
                ><SocialIcon name={social.name} /></a
              >
            {/each}
          </aside>
        </div>
      </div>
    </section>

    <section aria-labelledby="ownership-title" class="bg-orange px-5 py-24 text-cream md:py-36">
      <div class="reveal mx-auto max-w-page text-center">
        <h2
          id="ownership-title"
          class="font-sans text-[clamp(42px,7.5vw,104px)] leading-[1.08] tracking-tighter"
        >
          <span class="block">Controlled by you.</span>
          <span class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:gap-x-6">
            Yours <span
              class="inline-flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-cream text-ink md:size-24 md:rounded-3xl"
              ><LockMark class="size-9 md:size-14" /></span
            > to keep.
          </span>
        </h2>
        <p class="mx-auto mt-8 max-w-120 text-sm leading-relaxed text-ink md:text-base">
          You control your account and approve every move.<br class="hidden sm:block" /> Morrow never
          holds your money.
        </p>
        <a
          href="/how-it-works"
          class="btn-liquid group mx-auto mt-10 flex min-h-14 w-fit items-center justify-center gap-5 rounded-full px-7 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream"
          >See how it works <span class="transition-transform group-hover:translate-x-1"
            ><Icon size={21} /></span
          ></a
        >
      </div>
    </section>
  </main>
  <HomeFooter />
</div>
