import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import { useApi } from '@/lib/client/api'
import { useSignRelayed } from '@/lib/client/sign'
import { HANDLE_PATTERN } from '@/lib/handles'
import { normalizeCode } from '@/lib/redeem-code'
import type {
  BorrowView,
  CashoutQuote,
  CashoutView,
  ChartRange,
  CompanyProfile,
  EarnView,
  FundBuyOrder,
  FundCardView,
  FundFeeQuote,
  FundPurpose,
  FundView,
  GiftFeeQuote,
  GiftView,
  HoldingDetail,
  LimitOrderView,
  LoanQuote,
  NotificationSettings,
  NotificationView,
  Portfolio,
  PriceChart,
  Profile,
  RecipientResolution,
  StockSendQuote,
  StockSendView,
  StocksResponse,
  TradeHistoryPage,
  TradeQuote,
  TradeResult,
  TradeSide,
} from '@/lib/types'

/** Every API call from the browser goes through the hooks in this file */

export type GiftBox = 'received' | 'sent'

export const queryKeys = {
  profile: (walletAddress: string | null) => ['profile', walletAddress] as const,
  portfolio: () => ['portfolio'] as const,
  holding: (mint: string) => ['holding', mint] as const,
  gifts: (box?: GiftBox) => (box ? (['gifts', box] as const) : (['gifts'] as const)),
  gift: (giftId: string, viewerId?: string | null) =>
    viewerId === undefined ? (['gift', giftId] as const) : (['gift', giftId, viewerId] as const),
  recipient: (query: string) => ['recipient', query] as const,
  giftFee: (recipients: string[], mints: string[]) =>
    ['gift-fee', [...recipients].sort().join(','), [...mints].sort().join(',')] as const,
  giftCardFee: (mints: string[]) => ['gift-card-fee', [...mints].sort().join(',')] as const,
  redeem: (code: string) => ['redeem', code] as const,
  redeemPreview: (code: string) => ['redeem-preview', code] as const,
  handle: (handle: string) => ['handle', handle] as const,
  stocks: () => ['stocks'] as const,
  stockProfile: (mint: string) => ['stock-profile', mint] as const,
  funds: () => ['funds'] as const,
  fund: (fundId: string, viewerId?: string | null) =>
    viewerId === undefined ? (['fund', fundId] as const) : (['fund', fundId, viewerId] as const),
  fundFee: () => ['fund-fee'] as const,
  fundContributionFee: (fundId: string, mints: string[]) =>
    ['fund-contribution-fee', fundId, [...mints].sort().join(',')] as const,
  earn: () => ['earn'] as const,
  borrow: () => ['borrow'] as const,
  loanQuote: (mint: string, sharesRaw: string, cashRaw: string) =>
    ['loan-quote', mint, sharesRaw, cashRaw] as const,
  notifications: () => ['notifications'] as const,
  notificationFeed: () => ['notification-feed'] as const,
  tradeHistory: () => ['trade-history'] as const,
  limitOrders: () => ['limit-orders'] as const,
  limitOrderFee: (side: TradeSide, mint: string) => ['limit-order-fee', side, mint] as const,
  tradeQuote: ({ side, mint, amountRaw }: TradeQuoteParams) =>
    ['trade-quote', side, mint, amountRaw] as const,
  cashoutQuote: (target: string, amountRaw: string) =>
    ['cashout-quote', target, amountRaw] as const,
  stockSendQuote: (target: string, mint: string, amountRaw: string) =>
    ['stock-send-quote', target, mint, amountRaw] as const,
}

type Options = { enabled?: boolean }

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
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.portfolio(),
    enabled,
    refetchInterval: watch ? 10_000 : false,
    queryFn: () => api<Portfolio>('/api/portfolio'),
  })
  // A deposit is noted server-side during the portfolio fetch; the feed cache wouldn't hear about
  // it otherwise, so the badge on home stays stale until the next mount refetch.
  useEffect(() => {
    if (query.data?.newNotifications) {
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationFeed() })
    }
  }, [query.data?.newNotifications, queryClient])
  return query
}

/** One stock someone owns, for the screen that shows just that position */
export function useHoldingQuery(mint: string, { enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.holding(mint),
    enabled: enabled && Boolean(mint),
    queryFn: () => api<HoldingDetail>(`/api/holdings/${encodeURIComponent(mint)}`),
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

export type NotificationsResponse = {
  notifications: NotificationView[]
  /** Unread count, shown as a dot on the home bell */
  unread: number
}

/** Newest feed events for the signed-in user */
export function useNotificationsQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.notificationFeed(),
    enabled,
    // Poll so the home bell reflects notifications that arrive while someone sits on the screen —
    // a gift from someone else, or a deposit detected server-side. Without this the badge only
    // updates on mount/invalidation, and most notification sources can't reach this client.
    // staleTime 0 (overriding the 30s client default) so returning to home always refetches.
    staleTime: 0,
    refetchInterval: 30_000,
    queryFn: () => api<NotificationsResponse>('/api/notifications'),
  })
}

// Funds

/** Funds this person started, funds held for them, and funds they have added to */
export function useFundsQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.funds(),
    enabled,
    queryFn: () => api<{ funds: FundCardView[] }>('/api/funds').then((data) => data.funds),
  })
}

/** Keyed by viewer: the creator sees the fee they paid, everyone else doesn't */
export function useFundQuery(
  fundId: string,
  viewerId: string | null,
  { enabled = true }: Options = {},
) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.fund(fundId, viewerId),
    enabled,
    queryFn: () => api<{ fund: FundView }>(`/api/funds/${fundId}`).then((data) => data.fund),
  })
}

/** What opening a fund costs, before anything is created */
export function useFundFeeQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.fundFee(),
    enabled,
    staleTime: 60_000,
    queryFn: () => api<FundFeeQuote>('/api/funds/quote', { method: 'POST' }),
  })
}

/** What adding costs: free unless it opens the fund's first vault for one of these stocks */
export function useFundContributionFeeQuery(
  fundId: string,
  mints: string[],
  { enabled = true }: Options = {},
) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.fundContributionFee(fundId, mints),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<FundFeeQuote>(`/api/funds/${fundId}/quote`, { method: 'POST', body: { mints } }),
  })
}

export type CreateFundInput = {
  name?: string
  beneficiaryName: string
  /** Leave out and the creator holds it; with it, only that person can ever take it out */
  beneficiaryEmail?: string
  purpose: FundPurpose
  goalUsd?: number
  /** ISO date the lock ends */
  unlockAt: string
  allocations: { mint: string; percent: number }[]
}

/** Records the fund, adds the creator's signature, then opens it on-chain */
export function useCreateFundMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateFundInput): Promise<FundView> => {
      const created = await api<{ fund: FundView; transaction: string }>('/api/funds', {
        method: 'POST',
        body: input,
      })
      const { fund } = await api<{ fund: FundView }>(`/api/funds/${created.fund.id}/submit`, {
        method: 'POST',
        body: { transaction: await sign(created.transaction) },
      })
      return fund
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.funds() })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
    },
  })
}

export type AddToFundInput = {
  /** Cash going in, USDC base units */
  amountRaw: string
  note?: string
}

/**
 * Cash in, locked shares out: the server splits it by the fund's mix, Jupiter fills each buy into
 * this person's own account, and one last transaction moves exactly what landed into the vaults.
 */
export function useAddToFundMutation(fundId: string) {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ amountRaw, note }: AddToFundInput): Promise<FundView> => {
      const { orders } = await api<{ orders: FundBuyOrder[]; feeUsd: number }>(
        `/api/funds/${fundId}/buy`,
        { method: 'POST', body: { amountRaw } },
      )

      const items: { mint: string; amountRaw: string; usdValue: number }[] = []
      for (const order of orders) {
        const filled = await api<{ signature: string; outputAmountRaw: string | null }>(
          '/api/trades/submit',
          {
            method: 'POST',
            body: { transaction: await sign(order.transaction), requestId: order.requestId },
          },
        )
        items.push({
          mint: order.mint,
          amountRaw: filled.outputAmountRaw ?? order.minRaw,
          usdValue: order.quote.cashUsd,
        })
      }

      const built = await api<{ contributionId: string; transaction: string }>(
        `/api/funds/${fundId}/contribute`,
        { method: 'POST', body: { items, note } },
      )
      const { fund } = await api<{ fund: FundView }>(`/api/funds/${fundId}/submit`, {
        method: 'POST',
        body: {
          transaction: await sign(built.transaction),
          contributionId: built.contributionId,
        },
      })
      return fund
    },
    onSuccess: (fund) => {
      queryClient.setQueriesData({ queryKey: queryKeys.fund(fundId) }, fund)
      queryClient.invalidateQueries({ queryKey: queryKeys.funds() })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
    },
  })
}

export type ContributeSharesInput = {
  items: { mint: string; amountRaw: string; usdValue: number }[]
  note?: string
}

/**
 * Locks shares this person already owns, with no trade in between: nothing is bought, nothing is
 * sold, the shares simply move from their account into the fund's vaults.
 */
export function useContributeSharesMutation(fundId: string) {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, note }: ContributeSharesInput): Promise<FundView> => {
      const built = await api<{ contributionId: string; transaction: string }>(
        `/api/funds/${fundId}/contribute`,
        { method: 'POST', body: { items, note } },
      )
      const { fund } = await api<{ fund: FundView }>(`/api/funds/${fundId}/submit`, {
        method: 'POST',
        body: {
          transaction: await sign(built.transaction),
          contributionId: built.contributionId,
        },
      })
      return fund
    },
    onSuccess: (fund) => {
      queryClient.setQueriesData({ queryKey: queryKeys.fund(fundId) }, fund)
      queryClient.invalidateQueries({ queryKey: queryKeys.funds() })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
    },
  })
}

/** Only the person the fund is for can do this, and only once the unlock date has passed */
export function useWithdrawFundMutation(fundId: string) {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<FundView> => {
      const { transaction } = await api<{ transaction: string }>(`/api/funds/${fundId}/withdraw`, {
        method: 'POST',
      })
      const { fund } = await api<{ fund: FundView }>(`/api/funds/${fundId}/submit`, {
        method: 'POST',
        body: { transaction: await sign(transaction) },
      })
      return fund
    },
    onSuccess: (fund) => {
      queryClient.setQueriesData({ queryKey: queryKeys.fund(fundId) }, fund)
      queryClient.invalidateQueries({ queryKey: queryKeys.funds() })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
    },
  })
}

/** What shares can raise today, and what is owed on them; read from the market, not our books */
export function useBorrowQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.borrow(),
    enabled,
    staleTime: 30_000,
    queryFn: () => api<BorrowView>('/api/borrow'),
  })
}

/** What one loan would look like before anything is built, the market's numbers not ours */
export function useLoanQuoteQuery(
  { mint, sharesRaw, cashRaw }: { mint: string; sharesRaw: string; cashRaw: string },
  { enabled = true }: Options = {},
) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.loanQuote(mint, sharesRaw, cashRaw),
    enabled: enabled && Boolean(mint) && sharesRaw !== '0',
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: () =>
      api<LoanQuote>('/api/borrow/quote', {
        method: 'POST',
        body: { mint, sharesRaw, cashRaw: cashRaw === '0' ? undefined : cashRaw },
      }),
  })
}

/** What cash earns today, and what this person has earning; read from the market, not our books */
export function useEarnQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.earn(),
    enabled,
    staleTime: 30_000,
    queryFn: () => api<EarnView>('/api/earn'),
  })
}

/** What sending these shares would cost, before anything is recorded */
export function useStockSendQuoteQuery(
  { target, mint, amountRaw }: { target: string; mint: string; amountRaw: string },
  { enabled = true }: Options = {},
) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.stockSendQuote(target, mint, amountRaw),
    enabled: enabled && target.length > 0 && mint.length > 0 && amountRaw !== '0',
    retry: false,
    queryFn: () =>
      api<StockSendQuote>('/api/stock-sends/quote', {
        method: 'POST',
        body: { target, mint, amountRaw },
      }),
  })
}

// Mutations

/**
 * Every profile mutation returns the full row, so it goes straight into the cache. Invalidating
 * instead leaves the old profile in place while the refetch runs, and the app shell keeps its
 * cache across pages: Home would read `onboarded: false` right after Finish and bounce back to
 * onboarding for a frame.
 */
function useStoreProfile() {
  const queryClient = useQueryClient()
  return (profile: Profile) => queryClient.setQueriesData({ queryKey: ['profile'] }, profile)
}

export function useSyncProfileMutation() {
  const api = useApi()
  const storeProfile = useStoreProfile()
  return useMutation({
    mutationFn: () =>
      api<{ profile: Profile }>('/api/me', { method: 'POST' }).then((data) => data.profile),
    onSuccess: storeProfile,
  })
}

export type ProfileUpdate = {
  name?: string
  handle?: string
  country?: string
  acceptTerms?: true
}

export function useUpdateProfileMutation() {
  const api = useApi()
  const storeProfile = useStoreProfile()
  return useMutation({
    mutationFn: (update: ProfileUpdate) =>
      api<{ profile: Profile }>('/api/me', { method: 'PATCH', body: update }).then(
        (data) => data.profile,
      ),
    onSuccess: storeProfile,
  })
}

export function useUploadAvatarMutation() {
  const api = useApi()
  const storeProfile = useStoreProfile()
  return useMutation({
    mutationFn: (photo: Blob) => {
      const form = new FormData()
      form.set('photo', new File([photo], 'avatar.jpg', { type: photo.type || 'image/jpeg' }))
      return api<{ profile: Profile }>('/api/me/avatar', { method: 'POST', body: form }).then(
        (data) => data.profile,
      )
    },
    onSuccess: storeProfile,
  })
}

export type NotificationSettingsUpdate = Partial<NotificationSettings>

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

/**
 * Tells the server which browser to buzz. The subscription itself is created by the browser;
 * this only records it, and the same call replaces an older one for the same install.
 */
export function usePushSubscriptionMutation() {
  const api = useApi()
  return useMutation({
    mutationFn: (subscription: PushSubscriptionJSON | { endpoint: string }) =>
      api<{ subscribed: boolean }>('/api/me/push', { method: 'POST', body: subscription }),
  })
}

export function useRemovePushSubscriptionMutation() {
  const api = useApi()
  return useMutation({
    mutationFn: (endpoint: string) =>
      api<{ subscribed: boolean }>('/api/me/push', { method: 'DELETE', body: { endpoint } }),
  })
}

/** Clears the badge: every event of the signed-in user becomes read */
export function useMarkNotificationsReadMutation() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ ok: true }>('/api/notifications/read', { method: 'POST' }),
    onSuccess: () => {
      queryClient.setQueriesData<NotificationsResponse>(
        { queryKey: queryKeys.notificationFeed() },
        (feed) => (feed ? { ...feed, unread: 0 } : feed),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationFeed() })
    },
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

/** Only succeeds for the sender, and only before the gift is opened */
export function useRefundGiftMutation(giftId: string) {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { transaction } = await api<{ transaction: string }>(`/api/gifts/${giftId}/refund`, {
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

// Gift cards

/**
 * What a card costs before it's made. Whoever redeems it is assumed to hold nothing, so a card
 * always carries the claimer's account setup at cost — it's never free, unlike a gift to someone
 * who already holds its stocks.
 */
export function useGiftCardFeeQuery(mints: string[], { enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.giftCardFee(mints),
    enabled: enabled && mints.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: () => api<GiftFeeQuote>('/api/gift-cards/quote', { method: 'POST', body: { mints } }),
  })
}

/** What a code unlocks, while its owner decides. The code never travels before it's 16 clean symbols */
export function useRedeemLookupQuery(code: string, { enabled = true }: Options = {}) {
  const api = useApi()
  const normalized = normalizeCode(code)
  return useQuery({
    queryKey: queryKeys.redeem(normalized),
    enabled: enabled && normalized.length === 16,
    retry: false,
    staleTime: Infinity,
    queryFn: () =>
      api<{ gift: GiftView }>('/api/redeem', { method: 'POST', body: { code: normalized } }).then(
        (data) => data.gift,
      ),
  })
}

/**
 * What a code holds, for someone who hasn't signed in. Same shape as the lookup above, its own
 * cache key: one answers as a viewer, the other as nobody.
 */
export function useRedeemPreviewQuery(code: string, { enabled = true }: Options = {}) {
  const api = useApi()
  const normalized = normalizeCode(code)
  return useQuery({
    queryKey: queryKeys.redeemPreview(normalized),
    enabled: enabled && normalized.length === 16,
    retry: false,
    staleTime: Infinity,
    queryFn: () =>
      api<{ gift: GiftView }>('/api/redeem/preview', {
        method: 'POST',
        body: { code: normalized },
      }).then((data) => data.gift),
  })
}

export type CreateGiftCardInput = {
  /**
   * A chosen code instead of a random one. The server only accepts the one promo code it holds,
   * so this is a request, never a guarantee.
   */
  code?: string
  items: {
    mint: string
    /** Raw base units as a string (bigint-safe) */
    amountRaw: string
    usdValue: number
  }[]
  message?: string
}

export type CreateGiftCardResult = { gift: GiftView; code: string }

/** Records the card, signs its lock, broadcasts it — and hands back the one and only copy of the code */
export function useCreateGiftCardMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateGiftCardInput): Promise<CreateGiftCardResult> => {
      const created = await api<{ gift: GiftView; code: string; transaction: string }>(
        '/api/gift-cards',
        { method: 'POST', body: input },
      )
      const { gift } = await api<{ gift: GiftView }>(`/api/gifts/${created.gift.id}/submit`, {
        method: 'POST',
        body: { transaction: await sign(created.transaction) },
      })
      // The code can't be fetched again, so it rides through onSuccess with the gift
      return { gift, code: created.code }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
      queryClient.invalidateQueries({ queryKey: queryKeys.gifts() })
    },
  })
}

/** Redeems a card with its code; whoever signs in and presents the code keeps what's inside */
export function useClaimGiftCardMutation(giftId: string) {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ code }: { code: string }): Promise<GiftView> => {
      const { transaction } = await api<{ transaction: string }>(`/api/gifts/${giftId}/claim`, {
        method: 'POST',
        body: { code },
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
      queryClient.invalidateQueries({ queryKey: ['redeem'] })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.tradeHistory() })
    },
  })
}

/** Orders at a price that are still waiting; polled so a fill drops off without a reload */
export function useLimitOrdersQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.limitOrders(),
    enabled,
    refetchInterval: 60_000,
    queryFn: () =>
      api<{ orders: LimitOrderView[] }>('/api/limit-orders').then((data) => data.orders),
  })
}

/** What placing an order of this stock costs this person; usually nothing after the first */
export function useLimitOrderFeeQuery(
  side: TradeSide,
  mint: string,
  { enabled = true }: Options = {},
) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.limitOrderFee(side, mint),
    enabled: enabled && Boolean(mint),
    queryFn: () =>
      api<{ feeUsd: number }>(
        `/api/limit-orders/fee?side=${side}&mint=${encodeURIComponent(mint)}`,
      ).then((data) => data.feeUsd),
  })
}

export type LimitOrderRequest = {
  side: TradeSide
  mint: string
  /** Cash for a buy, shares for a sell, in raw base units */
  amount: string
  limitPriceUsd: number
  /** Null waits until it fills or is cancelled */
  expiresInDays: number | null
}

/** The server builds the order, the person signs it here, the server broadcasts it */
export function usePlaceLimitOrderMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (request: LimitOrderRequest) => {
      const built = await api<{ transaction: string; order: string; feeUsd: number }>(
        '/api/limit-orders',
        { method: 'POST', body: request },
      )
      return api<{ signature: string }>('/api/limit-orders/submit', {
        method: 'POST',
        body: { transaction: await sign(built.transaction), kind: 'place', order: built.order },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.limitOrders() })
      queryClient.invalidateQueries({ queryKey: ['limit-order-fee'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
      queryClient.invalidateQueries({ queryKey: queryKeys.stocks() })
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationFeed() })
    },
  })
}

export function useCancelLimitOrderMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (order: string) => {
      const built = await api<{ transaction: string }>('/api/limit-orders/cancel', {
        method: 'POST',
        body: { order },
      })
      return api<{ signature: string }>('/api/limit-orders/submit', {
        method: 'POST',
        body: { transaction: await sign(built.transaction), kind: 'cancel', order },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.limitOrders() })
      queryClient.invalidateQueries({ queryKey: ['limit-order-fee'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
      queryClient.invalidateQueries({ queryKey: queryKeys.stocks() })
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationFeed() })
    },
  })
}

/** Every buy and sell, newest first, fetched a page at a time as the list scrolls */
export function useTradeHistoryQuery({ enabled = true }: Options = {}) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: queryKeys.tradeHistory(),
    enabled,
    initialPageParam: null as string | null,
    getNextPageParam: (page: TradeHistoryPage) => page.nextCursor,
    queryFn: ({ pageParam }) =>
      api<TradeHistoryPage>(
        pageParam
          ? `/api/trades/history?before=${encodeURIComponent(pageParam)}`
          : '/api/trades/history',
      ),
  })
}

/** Short ranges refresh often; long ranges barely move, and the data source is rate-limited */
/** What the company does. Static text, so it never needs refetching in a session */
export function useStockProfileQuery(mint: string, { enabled = true }: Options = {}) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.stockProfile(mint),
    enabled: enabled && Boolean(mint),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: () =>
      api<{ profile: CompanyProfile | null }>(
        `/api/stocks/${encodeURIComponent(mint)}/profile`,
      ).then((data) => data.profile),
  })
}

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

// Cashing out

/**
 * What sending this much to this target would cost. The target can be a pasted account address or
 * an @handle/email that the server resolves to a wallet. Mistakes come back as an error here,
 * which is why it's quoted while people type rather than only on the review screen.
 */
export function useCashoutQuoteQuery(
  target: string,
  amountRaw: string,
  { enabled = true }: Options = {},
) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.cashoutQuote(target, amountRaw),
    enabled: enabled && target.trim().length > 0 && BigInt(amountRaw || '0') > 0n,
    retry: false,
    queryFn: () =>
      api<CashoutQuote>('/api/cashouts/quote', {
        method: 'POST',
        body: { target, amountRaw },
      }),
  })
}

/** The server builds and pays for the transfer, the user signs it, the server sends it */
export function useCashoutMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { target: string; amountRaw: string }): Promise<CashoutView> => {
      const built = await api<{ cashout: CashoutView; transaction: string }>('/api/cashouts', {
        method: 'POST',
        body: input,
      })
      const { cashout } = await api<{ cashout: CashoutView }>('/api/cashouts/submit', {
        method: 'POST',
        body: { cashoutId: built.cashout.id, transaction: await sign(built.transaction) },
      })
      return cashout
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
      queryClient.invalidateQueries({ queryKey: queryKeys.stocks() })
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationFeed() })
    },
  })
}

/** The note back to the giver, once the gift is open; only the person who opened it can send one */
export function useThankGiftMutation(giftId: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ note }: { note: string }) =>
      api<{ gift: GiftView }>(`/api/gifts/${giftId}/thanks`, {
        method: 'POST',
        body: { note },
      }).then((data) => data.gift),
    onSuccess: (gift) => {
      queryClient.setQueriesData({ queryKey: queryKeys.gift(giftId) }, gift)
      queryClient.invalidateQueries({ queryKey: queryKeys.gifts() })
    },
  })
}

/**
 * Opens a loan: locks the shares, takes the cash. The market opens two accounts for a first-time
 * borrower and they don't fit in the same transaction as the money, so when the server sends one
 * back it is signed and broadcast first, in order.
 */
export function useOpenLoanMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      mint,
      sharesRaw,
      cashRaw,
    }: {
      mint: string
      sharesRaw: string
      cashRaw: string
    }) => {
      const built = await api<{
        setup: string | null
        transaction: string
        cashUsd: number
        feeUsd: number
      }>('/api/borrow/open', { method: 'POST', body: { mint, sharesRaw, cashRaw } })
      if (built.setup) {
        await api<{ signature: string }>('/api/borrow/submit', {
          method: 'POST',
          body: { transaction: await sign(built.setup), action: 'setup' },
        })
      }
      await api<{ signature: string }>('/api/borrow/submit', {
        method: 'POST',
        body: { transaction: await sign(built.transaction), action: 'open' },
      })
      return built
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.borrow() })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
    },
  })
}

/** Pays a loan back, in part or in full */
export function useRepayLoanMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ amountRaw, all }: { amountRaw?: string; all?: boolean }) => {
      const { transaction, amountUsd } = await api<{ transaction: string; amountUsd: number }>(
        '/api/borrow/repay',
        { method: 'POST', body: { amountRaw, all } },
      )
      await api<{ signature: string }>('/api/borrow/submit', {
        method: 'POST',
        body: { transaction: await sign(transaction), action: 'repay' },
      })
      return amountUsd
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.borrow() })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
    },
  })
}

/** Takes locked shares back out, which the market allows only while the loan stays covered */
export function useUnlockSharesMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      mint,
      sharesRaw,
      all,
    }: {
      mint: string
      sharesRaw?: string
      all?: boolean
    }) => {
      const { transaction, shares } = await api<{ transaction: string; shares: number }>(
        '/api/borrow/unlock',
        { method: 'POST', body: { mint, sharesRaw, all } },
      )
      await api<{ signature: string }>('/api/borrow/submit', {
        method: 'POST',
        body: { transaction: await sign(transaction), action: 'unlock' },
      })
      return shares
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.borrow() })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
    },
  })
}

/**
 * Moves cash into Earn or back out. The server builds it, the browser adds the signature, and the
 * position is read back from the market afterwards rather than guessed at here.
 */
export function useEarnMoveMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      direction,
      amountRaw,
      all,
    }: {
      direction: 'in' | 'out'
      amountRaw?: string
      all?: boolean
    }) => {
      const { transaction } = await api<{ transaction: string; amountUsd: number }>(
        '/api/earn/move',
        { method: 'POST', body: { direction, amountRaw, all } },
      )
      return api<{ signature: string }>('/api/earn/submit', {
        method: 'POST',
        body: { transaction: await sign(transaction), direction },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.earn() })
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
    },
  })
}

/**
 * Sends shares to an account outside Morrow. The server records what it's meant to do, the
 * browser signs, and the server checks the signature against its own row before broadcasting.
 */
export function useStockSendMutation() {
  const api = useApi()
  const sign = useSignRelayed()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      target,
      mint,
      amountRaw,
    }: {
      target: string
      mint: string
      amountRaw: string
    }): Promise<StockSendView> => {
      const created = await api<{ send: StockSendView; transaction: string }>('/api/stock-sends', {
        method: 'POST',
        body: { target, mint, amountRaw },
      })
      const { send } = await api<{ send: StockSendView }>('/api/stock-sends/submit', {
        method: 'POST',
        body: { sendId: created.send.id, transaction: await sign(created.transaction) },
      })
      return send
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.portfolio() })
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationFeed() })
    },
  })
}
