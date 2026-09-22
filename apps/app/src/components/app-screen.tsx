import { type ComponentType, lazy, Suspense, useEffect } from 'react'
import { match, P } from 'ts-pattern'
import { Providers } from '@/components/providers'
import { Loading } from '@/components/ui'

const loaders = {
  'add-cash-screen': () => import('@/components/screens/add-cash-screen'),
  'ask-screen': () => import('@/components/screens/ask-screen'),
  'borrow-open-screen': () => import('@/components/screens/borrow-open-screen'),
  'borrow-repay-screen': () => import('@/components/screens/borrow-repay-screen'),
  'borrow-screen': () => import('@/components/screens/borrow-screen'),
  'buy-list-screen': () => import('@/components/screens/buy-list-screen'),
  'cash-out-screen': () => import('@/components/screens/cash-out-screen'),
  'create-fund-screen': () => import('@/components/screens/create-fund-screen'),
  'earn-move-screen': () => import('@/components/screens/earn-move-screen'),
  'earn-screen': () => import('@/components/screens/earn-screen'),
  'fund-screen': () => import('@/components/screens/fund-screen'),
  'funds-screen': () => import('@/components/screens/funds-screen'),
  'gift-card-screen': () => import('@/components/screens/gift-card-screen'),
  'gift-screen': () => import('@/components/screens/gift-screen'),
  'gifts-screen': () => import('@/components/screens/gifts-screen'),
  'holding-screen': () => import('@/components/screens/holding-screen'),
  'home-screen': () => import('@/components/screens/home-screen'),
  'login-screen': () => import('@/components/screens/login-screen'),
  'notifications-screen': () => import('@/components/screens/notifications-screen'),
  'notifications-settings-screen': () =>
    import('@/components/screens/notifications-settings-screen'),
  'onboarding-screen': () => import('@/components/screens/onboarding-screen'),
  'profile-screen': () => import('@/components/screens/profile-screen'),
  'redeem-screen': () => import('@/components/screens/redeem-screen'),
  'send-gift-screen': () => import('@/components/screens/send-gift-screen'),
  'send-stocks-screen': () => import('@/components/screens/send-stocks-screen'),
  'stocks-screen': () => import('@/components/screens/stocks-screen'),
  'trade-history-screen': () => import('@/components/screens/trade-history-screen'),
  'trade-screen': () => import('@/components/screens/trade-screen'),
  'watchlist-screen': () => import('@/components/screens/watchlist-screen'),
}

type ScreenName = keyof typeof loaders
const screens = Object.fromEntries(
  Object.entries(loaders).map(([name, load]) => [
    name,
    lazy(async () => {
      const module = await load()
      return { default: module.default as unknown as ComponentType<Record<string, unknown>> }
    }),
  ]),
)

const routes: Record<string, ScreenName> = {
  '/': 'home-screen',
  '/gifts': 'gifts-screen',
  '/funds': 'funds-screen',
  '/profile': 'profile-screen',
  '/buy': 'buy-list-screen',
  '/stocks': 'stocks-screen',
  '/send': 'send-gift-screen',
  '/send-stocks': 'send-stocks-screen',
  '/gift-cards': 'gift-card-screen',
  '/ask': 'ask-screen',
  '/add-cash': 'add-cash-screen',
  '/earn': 'earn-screen',
  '/earn/move': 'earn-move-screen',
  '/cash-out': 'cash-out-screen',
  '/login': 'login-screen',
  '/onboarding': 'onboarding-screen',
  '/redeem': 'redeem-screen',
  '/notifications': 'notifications-screen',
  '/notifications/settings': 'notifications-settings-screen',
  '/funds/new': 'create-fund-screen',
  '/watchlist': 'watchlist-screen',
  '/trades': 'trade-history-screen',
}

function preload(href: string) {
  const url = new URL(href, location.origin)
  if (url.origin !== location.origin) return
  const path = url.pathname.replace(/\/$/, '') || '/'
  const screen =
    routes[path] ??
    match(path)
      .returnType<ScreenName | null>()
      .with(P.string.startsWith('/trade/'), () => 'trade-screen')
      .with(P.string.startsWith('/holding/'), () => 'holding-screen')
      .with(P.string.startsWith('/gift/'), () => 'gift-screen')
      .with(P.string.startsWith('/fund/'), () => 'fund-screen')
      .otherwise(() => null)
  if (screen) void loaders[screen]().catch(() => {})
}

/** One persisted island keeps authentication and query data alive while route props change. */
export default function AppScreen({
  screen,
  screenProps = {},
  routeKey,
}: {
  screen: ScreenName
  screenProps?: Record<string, unknown>
  routeKey: string
}) {
  useEffect(() => {
    const warmLink = (event: Event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (
        anchor instanceof HTMLAnchorElement &&
        !anchor.download &&
        (!anchor.target || anchor.target === '_self')
      )
        preload(anchor.href)
    }
    document.addEventListener('pointerover', warmLink)
    document.addEventListener('pointerdown', warmLink)
    document.addEventListener('focusin', warmLink)
    const warmTabs = window.setTimeout(() => {
      for (const href of ['/', '/gifts', '/funds', '/profile']) preload(href)
    }, 1000)
    return () => {
      window.clearTimeout(warmTabs)
      document.removeEventListener('pointerover', warmLink)
      document.removeEventListener('pointerdown', warmLink)
      document.removeEventListener('focusin', warmLink)
    }
  }, [])
  const Screen = screens[screen]
  if (!Screen) throw new Error(`Unknown app screen: ${screen}`)
  return (
    <Providers>
      <Suspense fallback={<Loading />}>
        <Screen key={routeKey} {...screenProps} />
      </Suspense>
    </Providers>
  )
}
