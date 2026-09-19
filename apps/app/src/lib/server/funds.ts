import { findFundAddress, TOKEN_2022_PROGRAM } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { formatUsd, tickerLabel } from '@/lib/format'
import { getStocks } from '@/lib/server/catalog'
import { notFound } from '@/lib/server/http'
import { notify } from '@/lib/server/notify'
import { getPriceData } from '@/lib/server/prices'
import { connection } from '@/lib/server/solana'
import { avatarUrl, db } from '@/lib/server/supabase'
import type { UserRow } from '@/lib/server/users'
import type {
  FundCardView,
  FundContributionView,
  FundHoldingView,
  FundPurpose,
  FundStatus,
  FundView,
} from '@/lib/types'

/** Percent of each contribution per mint; the values always add up to 100 */
export type Allocations = Record<string, number>

export type FundRow = {
  /** Also the on-chain fund id */
  id: string
  creator_id: string
  creator_wallet: string
  name: string | null
  beneficiary_name: string
  beneficiary_wallet: string
  beneficiary_email: string | null
  beneficiary_id: string | null
  purpose: FundPurpose
  goal_usd: string | null
  unlock_at: string
  allocations: Allocations
  status: FundStatus
  rent_payer: string | null
  fee_raw: string
  fee_usd: string | null
  create_signature: string | null
  withdraw_signature: string | null
  withdrawn_at: string | null
  closed_at: string | null
  unlock_notified_at: string | null
  created_at: string
}

export type FundContributionRow = {
  id: string
  fund_id: string
  group_id: string
  contributor_id: string | null
  contributor_name: string
  contributor_wallet: string | null
  mint: string
  amount_raw: string
  usd_value: string | null
  note: string | null
  status: 'draft' | 'confirmed'
  signature: string | null
  fee_raw: string
  fee_usd: string | null
  created_at: string
}

export const FUND_COLUMNS =
  'id, creator_id, creator_wallet, name, beneficiary_name, beneficiary_wallet, beneficiary_email, beneficiary_id, purpose, goal_usd, unlock_at, allocations, status, rent_payer, fee_raw, fee_usd, create_signature, withdraw_signature, withdrawn_at, closed_at, unlock_notified_at, created_at'

export const CONTRIBUTION_COLUMNS =
  'id, fund_id, group_id, contributor_id, contributor_name, contributor_wallet, mint, amount_raw, usd_value, note, status, signature, fee_raw, fee_usd, created_at'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getFund(id: string | undefined): Promise<FundRow> {
  if (!id || !UUID.test(id)) throw notFound('We couldn’t find that fund.')
  const { data, error } = await db.from('funds').select(FUND_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw notFound('We couldn’t find that fund.')
  return data as FundRow
}

export function fundAddress(fund: FundRow): PublicKey {
  return findFundAddress(new PublicKey(fund.creator_wallet), fund.id)
}

export function allocationMints(fund: FundRow): string[] {
  return Object.keys(fund.allocations)
}

/** Raw base units the fund's vaults hold, by mint. Vaults only exist while they hold something. */
export async function vaultBalances(fund: FundRow): Promise<Map<string, bigint>> {
  const { value } = await connection.getParsedTokenAccountsByOwner(fundAddress(fund), {
    programId: TOKEN_2022_PROGRAM,
  })
  const balances = new Map<string, bigint>()
  for (const { account } of value) {
    const info = account.data.parsed.info
    balances.set(info.mint, (balances.get(info.mint) ?? 0n) + BigInt(info.tokenAmount.amount))
  }
  return balances
}

/**
 * What each fund is worth right now, by fund id. A list has to show the same number as the fund
 * page — what went in months ago isn't what a card should claim — so it reads the vaults too:
 * one call per fund, one for every price between them.
 */
export async function fundValues(funds: FundRow[]): Promise<Map<string, number>> {
  const values = new Map<string, number>()
  if (funds.length === 0) return values

  const [balances, stocks] = await Promise.all([
    Promise.all(funds.map((fund) => vaultBalances(fund))),
    getStocks(),
  ])
  const stockByMint = new Map(stocks.map((stock) => [stock.mint.toBase58(), stock]))
  const mints = [...new Set(balances.flatMap((held) => [...held.keys()]))]
  const prices = mints.length > 0 ? await getPriceData(mints) : {}

  funds.forEach((fund, index) => {
    let total = 0
    for (const [mint, raw] of balances[index] ?? []) {
      const stock = stockByMint.get(mint)
      if (!stock || raw === 0n) continue
      // Raw balances are valued at the raw token price, never the per-share one
      const priceUsd = prices[mint]?.tokenPriceUsd ?? stock.priceUsd
      if (priceUsd == null) continue
      total += (Number(raw) / 10 ** stock.decimals) * priceUsd
    }
    values.set(fund.id, total)
  })
  return values
}

export function viewerRole(fund: FundRow, viewer: UserRow | null): FundView['viewer'] {
  if (!viewer) return 'anonymous'
  if (viewer.id === fund.creator_id) return 'creator'
  if (viewer.wallet_address === fund.beneficiary_wallet) return 'beneficiary'
  return 'other'
}

const toUsd = (value: string | null) => (value == null ? null : Number(value))

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Everything a fund page shows: what it holds right now, what went in, and the difference. The
 * value comes from the vaults on-chain, never from our own arithmetic on past contributions.
 */
export async function toFundView(fund: FundRow, viewer: UserRow | null): Promise<FundView> {
  const [{ data: rows, error }, balances, stocks, creator] = await Promise.all([
    db
      .from('fund_contributions')
      .select(CONTRIBUTION_COLUMNS)
      .eq('fund_id', fund.id)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(200),
    vaultBalances(fund),
    getStocks(),
    db
      .from('users')
      .select('id, handle, name, avatar_path')
      .eq('id', fund.creator_id)
      .maybeSingle(),
  ])
  if (error) throw error
  const contributions = (rows ?? []) as FundContributionRow[]
  const stockByMint = new Map(stocks.map((stock) => [stock.mint.toBase58(), stock]))

  const heldMints = [...new Set([...balances.keys(), ...allocationMints(fund)])]
  const prices = heldMints.length > 0 ? await getPriceData(heldMints) : {}

  const holdings: FundHoldingView[] = [...balances.entries()].flatMap(([mint, raw]) => {
    const stock = stockByMint.get(mint)
    if (!stock || raw === 0n) return []
    // Balances here are raw, so they're valued at the raw token price. The catalog's price is per
    // share, which is only the same thing for stocks without a scaled-amount multiplier.
    const priceUsd = prices[mint]?.tokenPriceUsd ?? stock.priceUsd
    const tokens = Number(raw) / 10 ** stock.decimals
    return [
      {
        mint,
        name: stock.name,
        ticker: stock.ticker,
        iconUrl: stock.iconUrl,
        raw: raw.toString(),
        valueUsd: priceUsd == null ? null : tokens * priceUsd,
        change24hPct: prices[mint]?.change24hPct ?? stock.change24hPct,
        weightPct: 0,
      },
    ]
  })
  const valueUsd = holdings.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0)
  for (const holding of holdings) {
    holding.weightPct = valueUsd > 0 ? ((holding.valueUsd ?? 0) / valueUsd) * 100 : 0
  }
  holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))

  const contributedUsd = contributions.reduce((sum, row) => sum + (toUsd(row.usd_value) ?? 0), 0)
  const goalUsd = toUsd(fund.goal_usd)
  const unlockAt = new Date(fund.unlock_at)
  const role = viewerRole(fund, viewer)

  // Rows added in one breath are one entry: the note and the person are the same for all of them
  const byGroup = new Map<string, FundContributionRow[]>()
  for (const row of contributions) {
    byGroup.set(row.group_id, [...(byGroup.get(row.group_id) ?? []), row])
  }
  const contributors = await contributorProfiles(contributions)
  const entries: FundContributionView[] = [...byGroup.values()].map((group) => {
    const [first] = group as [FundContributionRow, ...FundContributionRow[]]
    const profile = first.contributor_id ? contributors.get(first.contributor_id) : undefined
    return {
      id: first.group_id,
      name: profile?.name ?? first.contributor_name,
      avatarUrl: avatarUrl(profile?.avatar_path ?? null),
      note: first.note,
      usdValue: group.reduce((sum, row) => sum + (toUsd(row.usd_value) ?? 0), 0),
      stocks: group.flatMap((row) => {
        const stock = stockByMint.get(row.mint)
        return stock ? [stock.name] : []
      }),
      createdAt: first.created_at,
    }
  })

  const creatorRow = creator.data as Pick<UserRow, 'handle' | 'name' | 'avatar_path'> | null
  return {
    id: fund.id,
    name: fund.name ?? `${fund.beneficiary_name}’s fund`,
    status: fund.status,
    purpose: fund.purpose,
    beneficiaryName: fund.beneficiary_name,
    creator: {
      name: creatorRow?.name ?? 'Someone',
      handle: creatorRow?.handle ?? null,
      avatarUrl: avatarUrl(creatorRow?.avatar_path ?? null),
    },
    allocations: Object.entries(fund.allocations).map(([mint, percent]) => {
      const stock = stockByMint.get(mint)
      return {
        mint,
        name: stock?.name ?? 'Stock',
        ticker: stock?.ticker ?? '',
        iconUrl: stock?.iconUrl ?? null,
        percent,
      }
    }),
    holdings,
    valueUsd,
    contributedUsd,
    changeUsd: valueUsd - contributedUsd,
    changePct: contributedUsd > 0 ? ((valueUsd - contributedUsd) / contributedUsd) * 100 : null,
    goalUsd,
    progressPct: goalUsd ? Math.min(100, (valueUsd / goalUsd) * 100) : null,
    yearsToGo: Math.max(0, (unlockAt.getTime() - Date.now()) / YEAR_MS),
    unlockAt: fund.unlock_at,
    unlocked: unlockAt.getTime() <= Date.now(),
    createdAt: fund.created_at,
    contributions: entries,
    feeUsd: role === 'creator' ? (toUsd(fund.fee_usd) ?? 0) : null,
    viewer: role,
  }
}

/**
 * Puts a contribution in the feed of everyone it matters to: the person who added, whoever
 * started the fund, and whoever it's for. Best effort — the shares are already locked on-chain
 * by the time this runs, so a failed insert must never fail the request.
 */
export async function notifyContribution({
  fund,
  contributor,
  usdValue,
  mints,
  note,
}: {
  fund: FundRow
  contributor: UserRow
  usdValue: number
  mints: string[]
  /** What the contributor wrote alongside it, if anything */
  note?: string | null
}): Promise<void> {
  const stocks = await getStocks()
  const tickers = mints.flatMap((mint) => {
    const stock = stocks.find((entry) => entry.mint.toBase58() === mint)
    return stock ? [stock.ticker] : []
  })
  const fundName = fund.name ?? `${fund.beneficiary_name}’s fund`
  const amount = formatUsd(usdValue)
  const unlock = new Date(fund.unlock_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
  const body = `${tickers.length > 0 ? `${tickers.join(', ')} · ` : ''}locked until ${unlock}`
  const contributorName = contributor.name ?? 'Someone'

  // One row each, and never two for the same person when they wear several hats
  const rows = new Map<string, { kind: 'fund_added' | 'fund_contribution'; title: string }>()
  rows.set(contributor.id, { kind: 'fund_added', title: `You added ${amount} to ${fundName}` })
  for (const userId of [fund.creator_id, fund.beneficiary_id]) {
    if (!userId || rows.has(userId)) continue
    rows.set(userId, {
      kind: 'fund_contribution',
      title: `${contributorName} added ${amount} to ${fundName}`,
    })
  }

  await notify(
    [...rows].map(([userId, row]) => ({
      userId,
      kind: row.kind,
      title: row.title,
      body,
      fundId: fund.id,
      url: `/fund/${fund.id}`,
      // Only the people it happened to hear about it; the contributor is looking at the screen
      email:
        row.kind === 'fund_contribution'
          ? {
              subject: row.title,
              preview: body,
              eyebrow: 'Someone added to the fund',
              hero: `${contributorName} added ${amount}`,
              subhero: fundName,
              rows: [
                { label: 'From', value: contributorName },
                { label: 'Added', value: amount },
                ...(tickers.length > 0
                  ? [{ label: 'What it bought', value: tickers.map(tickerLabel).join(', ') }]
                  : []),
                { label: 'Locked until', value: unlock },
              ],
              note: note ? { from: contributorName, text: note } : null,
              cta: { label: 'See the fund', path: `/fund/${fund.id}` },
            }
          : undefined,
    })),
  )
}

async function contributorProfiles(rows: FundContributionRow[]) {
  const ids = [...new Set(rows.map((row) => row.contributor_id).filter(Boolean))]
  if (ids.length === 0) return new Map<string, Pick<UserRow, 'name' | 'avatar_path'>>()
  const { data, error } = await db.from('users').select('id, name, avatar_path').in('id', ids)
  if (error) throw error
  return new Map(
    (data as Pick<UserRow, 'id' | 'name' | 'avatar_path'>[]).map((user) => [user.id, user]),
  )
}

/** The short card a list shows. `valueUsd` comes from `fundValues`, so it agrees with the page. */
export function toFundCard(
  fund: FundRow,
  contributedUsd: number,
  valueUsd: number | null,
): FundCardView {
  const goalUsd = toUsd(fund.goal_usd)
  const against = valueUsd ?? contributedUsd
  return {
    id: fund.id,
    name: fund.name ?? `${fund.beneficiary_name}’s fund`,
    beneficiaryName: fund.beneficiary_name,
    purpose: fund.purpose,
    status: fund.status,
    contributedUsd,
    valueUsd,
    goalUsd,
    progressPct: goalUsd ? Math.min(100, (against / goalUsd) * 100) : null,
    unlockAt: fund.unlock_at,
    yearsToGo: Math.max(0, (new Date(fund.unlock_at).getTime() - Date.now()) / YEAR_MS),
  }
}
