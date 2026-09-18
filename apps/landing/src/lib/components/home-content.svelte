<script lang="ts">
import CurrencyDolarIcon from 'phosphor-svelte/lib/CurrencyDollarIcon'
import GiftIcon from 'phosphor-svelte/lib/GiftIcon'
import LinkSimpleIcon from 'phosphor-svelte/lib/LinkSimpleIcon'
import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon'
import PaperPlaneTiltIcon from 'phosphor-svelte/lib/PaperPlaneTiltIcon'
import PiggyBankIcon from 'phosphor-svelte/lib/PiggyBankIcon'
import { onMount } from 'svelte'
import CardOrnament from './card-ornament.svelte'
import GiftPreview from './gift-preview.svelte'
import HomeFooter from './home-footer.svelte'
import HomeNav from './home-nav.svelte'
import Icon from './landing-icon.svelte'
import LockMark from './lock-mark.svelte'
import StockMark from './stock-mark.svelte'

const tourScreens = [
  {
    src: '/images/buy-screen.png',
    title: 'Buy a little',
    text: 'Search 142 stocks and Pre-IPO stocks, then start trade.',
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
          <p class="mt-8 text-xs">A piece of something big.</p>
          <p class="mt-1 font-sans text-[44px] tracking-[-0.06em]">Apple</p>
          <div class="mt-4 flex items-center justify-between border-t border-ink/15 pt-3 text-xs">
            <span>Big ideas. Little shares.</span><span>↗</span>
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
        trades cost under 50¢ to send.
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
            {#each [{ word: 'Give.', icon: 'gift', color: '#c85a00' }, { word: 'Invest.', icon: 'chart', color: '#6f548d' }, { word: 'Grow.', icon: 'grow', color: '#486839' }] as action}
              <div
                class="action-word flex items-center gap-5 font-sans text-[clamp(64px,9vw,130px)] leading-[1.13] tracking-[-0.065em]"
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

    <section
      id="made-for-you"
      aria-labelledby="features-title"
      class="mx-auto max-w-280 scroll-mt-10 px-5 pt-24 pb-20 md:px-10 md:pt-32 md:pb-28"
    >
      <div class="reveal mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end">
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
      <div class="grid gap-x-6 gap-y-12 md:grid-cols-2">
        <article class="reveal">
          <div
            class="feature-art relative flex aspect-[1.35] items-center justify-center overflow-hidden rounded-3xl bg-[#e4ead9]"
          >
            <CardOrnament variant="orbit" />
            <div class="relative w-[75%] max-w-78.75 -rotate-6 rounded-[22px] bg-surface p-5">
              <div class="mb-5 flex justify-between text-xs">
                <span>Meet your next little investment</span><Icon name="diagonal" size={17} />
              </div>
              {#each [{ name: 'Apple', logo: 'apple', color: '#eeeae2', detail: 'A piece of your everyday.' }, { name: 'Nvidia', logo: 'nvidia', color: '#d5efb2', detail: 'A little of the next big thing.' }, { name: 'Tesla', logo: 'tesla', color: '#f1d5cc', detail: 'A share of what’s ahead.' }] as stock}<div
                  class="flex items-center gap-3 border-t border-line py-3"
                >
                  <StockMark stock={stock.logo} color={stock.color} size={36} />
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
            <p class="mt-2 max-w-92.5 text-sm leading-relaxed text-stone">
              Buy a fraction of a share in companies you know, watch live prices and simple charts,
              and sell back to cash whenever you like.
            </p>
          </div>
        </article>
        <article class="reveal">
          <div
            class="feature-art relative flex aspect-[1.35] items-center justify-center overflow-hidden rounded-3xl bg-[#eddbc3]"
          >
            <CardOrnament variant="sparkles" />
            <div class="absolute top-8 left-10 w-55 -rotate-12 opacity-45">
              <GiftPreview compact />
            </div>
            <div class="relative mt-8 ml-12 w-62.5 rotate-10"><GiftPreview compact /></div>
          </div>
          <div class="px-2 pt-5">
            <h3 class="text-xl">More thoughtful than a gift card.</h3>
            <p class="mt-2 max-w-92.5 text-sm leading-relaxed text-stone">
              Choose shares or cash, add your words, and send to their email or Morrow handle. Big
              gift, tiny fee: most cost under 50¢ to send.
            </p>
          </div>
        </article>
        <article class="reveal">
          <div
            class="feature-art relative flex aspect-[1.35] items-center justify-center overflow-hidden rounded-3xl bg-[#e0d5ed]"
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
                <Icon name="lock" size={14} />Set a date. Give it time.
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
        <article class="reveal">
          <div
            class="feature-art relative flex aspect-[1.35] items-center justify-center overflow-hidden rounded-3xl bg-[#f6cfa9]"
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
            <p class="mt-2 max-w-108.5 text-sm leading-relaxed text-stone">
              Only your recipient can open their gift. If it’s left unopened, it comes back after 30
              days. zero-knowledge privacy to keep gift details private.
            </p>
          </div>
        </article>
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
