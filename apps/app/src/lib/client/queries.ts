import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/client/api'
import { useSignRelayed } from '@/lib/client/sign'
import type {
  ChartRange,
  GiftFeeQuote,
  GiftView,
  NotificationSettings,
  Portfolio,
  PriceChart,
  Profile,
  RecipientResolution,
  StocksResponse,
  TradeQuote,
  TradeResult,
  TradeSide,
} from '@/lib/types'

/** Every API call from the browser goes through the hooks in this file */

export type GiftBox = 'received' | 'sent'

export const queryKeys = {
  profile: (walletAddress: string | null) => ['profile', walletAddress] as const,
  portfolio: () => ['portfolio'] as const,
  gifts: (box?: GiftBox) => (box ? (['gifts', box] as const) : (['gifts'] as const)),
  gift: (giftId: string, viewerId?: string | null) =>
    viewerId === undefined ? (['gift', giftId] as const) : (['gift', giftId, viewerId] as const),
  recipient: (query: string) => ['recipient', query] as const,
  giftFee: (recipients: string[], mints: string[]) =>
    ['gift-fee', [...recipients].sort().join(','), [...mints].sort().join(',')] as const,
  handle: (handle: string) => ['handle', handle] as const,
  stocks: () => ['stocks'] as const,
  notifications: () => ['notifications'] as const,
  tradeQuote: ({ side, mint, amountRaw }: TradeQuoteParams) =>
    ['trade-quote', side, mint, amountRaw] as const,
}

type Options = { enabled?: boolean }

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/

// Queries

/** Refreshes email + wallet from Privy on the server and returns our profile */
export function useProfileQuery(walletAddress: string | null, { enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.profile(walletAddress),
    enabled,
    queryFn: () =>
      api<{ profile: Profile }>('/api/me', { method: 'POST' }).then((data) => data.profile),
  })
}

/** `watch` polls while a screen waits for a deposit to land */
export function usePortfolioQuery({
  enabled = true,
  watch = false,
}: Options & { watch?: boolean } = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.portfolio(),
    enabled,
    refetchInterval: watch ? 10_000 : false,
    queryFn: () => api<Portfolio>('/api/portfolio'),
  })
}

export function useGiftsQuery(box: GiftBox, { enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.gifts(box),
    enabled,
    queryFn: () => api<{ gifts: GiftView[] }>(`/api/gifts?box=${box}`).then((data) => data.gifts),
  })
}

/** Keyed by viewer too: the same gift reads differently for sender, recipient and strangers */
export function useGiftQuery(
  giftId: string,
  viewerId: string | null,
  { enabled = true }: Options = {},
) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.gift(giftId, viewerId),
    enabled,
    queryFn: () => api<{ gift: GiftView }>(`/api/gifts/${giftId}`).then((data) => data.gift),
  })
}

export function useRecipientQuery(query: string, { enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.recipient(query),
    enabled: enabled && query.length >= 3,
    queryFn: () => api<RecipientResolution>('/api/recipients', { method: 'POST', body: { query } }),
  })
}

/** What sending would cost: free when everyone already holds these stocks */
export function useGiftFeeQuery(
  recipients: string[],
  mints: string[],
  { enabled = true }: Options = {},
) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.giftFee(recipients, mints),
    enabled: enabled && recipients.length > 0 && mints.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<GiftFeeQuote>('/api/gifts/quote', { method: 'POST', body: { recipients, mints } }),
  })
}

export function useHandleAvailabilityQuery(handle: string) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.handle(handle),
    enabled: HANDLE_PATTERN.test(handle),
    queryFn: () => api<{ available: boolean }>(`/api/handles/${handle}`),
  })
}

/** Gift-event notification preferences; no row on the server means defaults */
export function useNotificationSettingsQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.notifications(),
    enabled,
    staleTime: Infinity,
    queryFn: () =>
      api<{ settings: NotificationSettings }>('/api/me/notifications').then(
        (data) => data.settings,
      ),
  })
}

// Mutations

export function useSyncProfileMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ profile: Profile }>('/api/me', { method: 'POST' }).then((data) => data.profile),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })
}

export type ProfileUpdate = {
  name?: string
  handle?: string
  country?: string
  notUsPerson?: true
  acceptTerms?: true
}

export function useUpdateProfileMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (update: ProfileUpdate) =>
      api<{ profile: Profile }>('/api/me', { method: 'PATCH', body: update }).then(
        (data) => data.profile,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })
}

export function useUploadAvatarMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (photo: Blob) => {
      const form = new FormData()
      form.set('photo', new File([photo], 'avatar.jpg', { type: photo.type || 'image/jpeg' }))
      return api<{ profile: Profile }>('/api/me/avatar', { method: 'POST', body: form }).then(
        (data) => data.profile,
      )
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })
}

export type NotificationSettingsUpdate = {
  giftReceived?: boolean
  giftOpened?: boolean
  giftReturned?: boolean
}

/** Flip feels instant: cache updates on mutate, rolls back if the server refuses */
export function useUpdateNotificationSettingsMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (update: NotificationSettingsUpdate) =>
      api<{ settings: NotificationSettings }>('/api/me/notifications', {
        method: 'PATCH',
        body: update,
      }).then((data) => data.settings),
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications() })
      const previous = queryClient.getQueryData<NotificationSettings>(queryKeys.notifications())
      if (previous) {
        queryClient.setQueryData(queryKeys.notifications(), { ...previous, ...update })
      }
      return { previous }
    },
    onError: (_error, _update, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications(), context.previous)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications() }),
  })
}

export type SendGiftInput = {
  /** @handles or emails; each person gets their own gift and link */
  recipients: string[]
  /** What each person gets */
  items: {
    mint: string
    /** Raw base units as a string (bigint-safe) */
    amountRaw: string
    usdValue: number
  }[]
  message: string
}

export type SendGiftResult = {
  gifts: GiftView[]
  /** Gifts that didn't go through; nothing moved for those */
  failed: number
}

/** Creates a gift per recipient, adds the sender's signature to each, then broadcasts them */
export function useSendGiftMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SendGiftInput): Promise<SendGiftResult> => {
      const created = await api<{ gifts: { gift: GiftView; transaction: string }[] }>(
        '/api/gifts',
        { method: 'POST', body: input },
      )
      const signed: { id: string; transaction: string }[] = []
      for (const draft of created.gifts) {
        signed.push({ id: draft.gift.id, transaction: await sign(draft.transaction) })
      }
      const results = await Promise.allSettled(
        signed.map(({ id, transaction }) =>
          api<{ gift: GiftView }>(`/api/gifts/${id}/submit`, {
            method: 'POST',
            body: { transaction },
          }).then((data) => data.gift),
        ),
      )
      const gifts = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      )
      const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      )
      if (gifts.length === 0 && failure) throw failure.reason
      return { gifts, failed: results.length - gifts.length }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
      queryClient.invalidateQueries({ queryKey: queryKeys.gifts() })
    },
  })
}

/** Only succeeds for the account the gift is locked to; the server and the program both check */
export function useClaimGiftMutation(giftId: string) {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { transaction } = await api<{ transaction: string }>(`/api/gifts/${giftId}/claim`, {
        method: 'POST',
      })
      const { gift } = await api<{ gift: GiftView }>(`/api/gifts/${giftId}/submit`, {
        method: 'POST',
        body: { transaction: await sign(transaction) },
      })
      return gift
    },
    onSuccess: (gift) => {
      queryClient.setQueriesData({ queryKey: queryKeys.gift(giftId) }, gift)
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
      queryClient.invalidateQueries({ queryKey: queryKeys.gifts() })
    },
  })
}

// Trading

export function useStocksQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.stocks(),
    enabled,
    queryFn: () => api<StocksResponse>('/api/stocks'),
  })
}

export type TradeQuoteParams = {
  side: TradeSide
  mint: string
  /** What goes in, raw base units: USDC for buys, the stock for sells */
  amountRaw: string
}

/** Refreshes while the screen is open because prices move; the server re-quotes before trading */
export function useTradeQuoteQuery(params: TradeQuoteParams, { enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.tradeQuote(params),
    enabled,
    retry: false,
    refetchInterval: 15_000,
    queryFn: () => {
      const search = new URLSearchParams({
        side: params.side,
        mint: params.mint,
        amount: params.amountRaw,
      })
      return api<TradeQuote>(`/api/trades/quote?${search}`)
    },
  })
}

export type TradeRequest = {
  side: TradeSide
  mint: string
  /** Raw base units as a string (bigint-safe) */
  amount: string
}

/** Jupiter builds a gasless swap for this wallet, the user signs it here, Jupiter lands it */
export function useTradeMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: TradeRequest): Promise<TradeResult> => {
      const built = await api<{ transaction: string; requestId: string; quote: TradeQuote }>(
        '/api/trades',
        { method: 'POST', body: request },
      )
      const { signature } = await api<{ signature: string }>('/api/trades/submit', {
        method: 'POST',
        body: { transaction: await sign(built.transaction), requestId: built.requestId },
      })
      return { signature, quote: built.quote }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
      queryClient.invalidateQueries({ queryKey: queryKeys.stocks() })
    },
  })
}

/** Short ranges refresh often; long ranges barely move, and the data source is rate-limited */
export function usePriceChartQuery(mint: string, range: ChartRange) {
  const api = useApi()
  const intraday = range === '1D' || range === '3D'
  return useQuery({
    queryKey: ['price-chart', mint, range] as const,
    enabled: Boolean(mint),
    retry: false,
    staleTime: intraday ? 60_000 : 10 * 60_000,
    refetchInterval: range === '1D' ? 60_000 : false,
    queryFn: () => api<PriceChart>(`/api/stocks/${encodeURIComponent(mint)}/chart?range=${range}`),
  })
}
