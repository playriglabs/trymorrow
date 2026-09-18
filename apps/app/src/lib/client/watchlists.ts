import { usePrivy } from '@privy-io/react-auth'
import { useMemo, useSyncExternalStore } from 'react'

/**
 * Watchlists: stocks someone wants to keep an eye on, grouped into named lists with an icon.
 *
 * They live in this browser only. Nothing here is money, it's a private reading list, so storing
 * it locally keeps the server out of it entirely and costs nothing to run. The trade-off is that
 * lists don't follow someone to another phone; say so on screen rather than pretending otherwise.
 *
 * Storage is keyed by the signed-in account, the same identity the query cache is scoped to, so
 * signing out and in as someone else on a shared phone never shows their lists, and the first
 * account still has its own when it comes back.
 */

const KEY_PREFIX = 'morrow.watchlists.v1'

/** Five is plenty to stay glanceable, and the whole thing has to fit in one tab row */
export const MAX_WATCHLISTS = 5
/** Long enough for "Big movers", short enough that a tab never truncates */
export const MAX_WATCHLIST_NAME = 16
/** A list nobody named yet: the one that gets made the first time a stock is saved */
export const FIRST_WATCHLIST = { name: 'Watching', emoji: '⭐️' } as const

export type Watchlist = {
  id: string
  name: string
  emoji: string
  /** Mints, newest first, so a freshly saved stock is at the top of the list */
  mints: string[]
}

const EMPTY: Watchlist[] = []

export const cleanWatchlistName = (name: string) =>
  name.replace(/\s+/g, ' ').trim().slice(0, MAX_WATCHLIST_NAME)

/** Anything unrecognizable is dropped rather than thrown: old or hand-edited storage still opens */
function parse(raw: string | null): Watchlist[] {
  if (!raw) return EMPTY
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return EMPTY
    const lists = parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return []
      const { id, name, emoji, mints } = entry as Record<string, unknown>
      if (typeof id !== 'string' || typeof name !== 'string' || typeof emoji !== 'string') return []
      const saved = Array.isArray(mints) ? mints.filter((mint) => typeof mint === 'string') : []
      const list: Watchlist = {
        id,
        name: cleanWatchlistName(name) || FIRST_WATCHLIST.name,
        emoji,
        mints: [...new Set(saved)],
      }
      return [list]
    })
    return lists.slice(0, MAX_WATCHLISTS)
  } catch {
    return EMPTY
  }
}

type Store = {
  read: () => Watchlist[]
  save: (lists: Watchlist[]) => void
  subscribe: (listener: () => void) => () => void
}

/** Signed out there's nobody to keep lists for: reads come back empty and writes go nowhere */
const NO_STORE: Store = {
  read: () => EMPTY,
  save: () => {},
  subscribe: () => () => {},
}

/** One store per account, kept so `useSyncExternalStore` gets the same functions every render */
const stores = new Map<string, Store>()

function storeFor(owner: string | null): Store {
  if (!owner) return NO_STORE
  const existing = stores.get(owner)
  if (existing) return existing

  const key = `${KEY_PREFIX}.${owner}`
  const listeners = new Set<() => void>()
  /** Stable snapshot: `useSyncExternalStore` compares it by reference on every render */
  let cache: Watchlist[] | null = null

  const store: Store = {
    read: () => {
      if (cache) return cache
      try {
        cache = parse(window.localStorage.getItem(key))
      } catch {
        // Private browsing can refuse storage entirely; lists then last as long as the page does
        cache = EMPTY
      }
      return cache
    },
    save: (lists) => {
      cache = lists
      try {
        window.localStorage.setItem(key, JSON.stringify(lists))
      } catch {
        // Same as above: the change still applies to this page, it just won't be here next time
      }
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      // Another tab of the app writing this account's key: drop the snapshot so the next read parses
      const fromAnotherTab = (event: StorageEvent) => {
        if (event.key !== null && event.key !== key) return
        cache = null
        listener()
      }
      window.addEventListener('storage', fromAnotherTab)
      return () => {
        listeners.delete(listener)
        window.removeEventListener('storage', fromAnotherTab)
      }
    },
  }
  stores.set(owner, store)
  return store
}

export type Watchlists = {
  lists: Watchlist[]
  /** Null when there are already five, or nobody is signed in, so the caller can say so */
  create: (name: string, emoji: string) => Watchlist | null
  rename: (id: string, name: string, emoji: string) => void
  remove: (id: string) => void
  /** The list the heart saves to when nobody has made one yet */
  firstList: () => Watchlist | null
  toggleStock: (id: string, mint: string) => void
  removeStock: (id: string, mint: string) => void
}

/** Which lists hold a stock, in the order the lists themselves are in */
export const watchlistsWith = (lists: Watchlist[], mint: string) =>
  lists.filter((list) => list.mints.includes(mint))

/** Every stock on any list, deduplicated: what Home and the screen need prices for */
export const watchedMints = (lists: Watchlist[]) => [
  ...new Set(lists.flatMap((list) => list.mints)),
]

export function useWatchlists(): Watchlists {
  // The Privy account, the same identity `providers.tsx` scopes the query cache to
  const { user } = usePrivy()
  const store = storeFor(user?.id ?? null)
  const lists = useSyncExternalStore(store.subscribe, store.read, () => EMPTY)

  return useMemo(() => {
    const update = (id: string, change: (list: Watchlist) => Watchlist) =>
      store.save(store.read().map((list) => (list.id === id ? change(list) : list)))

    const create = (name: string, emoji: string) => {
      const saved = store.read()
      if (store === NO_STORE || saved.length >= MAX_WATCHLISTS) return null
      const list: Watchlist = {
        id: crypto.randomUUID(),
        name: cleanWatchlistName(name) || FIRST_WATCHLIST.name,
        emoji,
        mints: [],
      }
      store.save([...saved, list])
      return list
    }

    return {
      lists,
      create,
      rename: (id, name, emoji) =>
        update(id, (list) => ({
          ...list,
          name: cleanWatchlistName(name) || list.name,
          emoji,
        })),
      remove: (id) => store.save(store.read().filter((list) => list.id !== id)),
      firstList: () => store.read()[0] ?? create(FIRST_WATCHLIST.name, FIRST_WATCHLIST.emoji),
      toggleStock: (id, mint) =>
        update(id, (list) => ({
          ...list,
          mints: list.mints.includes(mint)
            ? list.mints.filter((saved) => saved !== mint)
            : [mint, ...list.mints],
        })),
      removeStock: (id, mint) =>
        update(id, (list) => ({
          ...list,
          mints: list.mints.filter((saved) => saved !== mint),
        })),
    }
  }, [store, lists])
}
