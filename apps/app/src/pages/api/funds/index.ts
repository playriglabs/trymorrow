import { createFundInstruction, MAX_LOCK_SECONDS } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { formatUsd } from '@/lib/format'
import { MAX_FUND_STOCKS } from '@/lib/funds'
import { findStock } from '@/lib/server/catalog'
import {
  cashBalance,
  ensureTreasuryAccount,
  feeTransferInstruction,
  fundCreateFee,
} from '@/lib/server/fees'
import {
  CONTRIBUTION_COLUMNS,
  FUND_COLUMNS,
  type FundContributionRow,
  type FundRow,
  fundValues,
  toFundCard,
  toFundView,
} from '@/lib/server/funds'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { findWalletForEmail, walletForEmail } from '@/lib/server/privy'
import { buildRelayedTransaction, relayer } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

/** Funds this person started, funds held for them, and funds they have added to */
export const GET = route(async ({ request }) => {
  const user = await requireUser(request)
  const wallet = requireWallet(user)

  const { data: mine, error: minesError } = await db
    .from('fund_contributions')
    .select('fund_id')
    .eq('contributor_id', user.id)
    .eq('status', 'confirmed')
  if (minesError) throw minesError
  const contributed = [...new Set((mine ?? []).map((row) => row.fund_id as string))]

  const filters = [`creator_id.eq.${user.id}`, `beneficiary_wallet.eq.${wallet}`]
  if (contributed.length > 0) filters.push(`id.in.(${contributed.join(',')})`)
  const { data, error } = await db
    .from('funds')
    .select(FUND_COLUMNS)
    .neq('status', 'draft')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error

  const funds = (data ?? []) as FundRow[]
  const { data: rows, error: rowsError } = funds.length
    ? await db
        .from('fund_contributions')
        .select(CONTRIBUTION_COLUMNS)
        .in(
          'fund_id',
          funds.map((fund) => fund.id),
        )
        .eq('status', 'confirmed')
    : { data: [], error: null }
  if (rowsError) throw rowsError

  const contributedUsd = new Map<string, number>()
  for (const row of (rows ?? []) as FundContributionRow[]) {
    contributedUsd.set(
      row.fund_id,
      (contributedUsd.get(row.fund_id) ?? 0) + Number(row.usd_value ?? 0),
    )
  }
  const values = await fundValues(funds)
  return json({
    funds: funds.map((fund) =>
      toFundCard(fund, contributedUsd.get(fund.id) ?? 0, values.get(fund.id) ?? null),
    ),
  })
})

const allocationSchema = z.object({
  mint: z.string().min(32).max(44),
  percent: z.number().int().min(1).max(100),
})

const createSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  beneficiaryName: z.string().trim().min(1).max(60),
  /** When it's someone else's, their email gets a wallet only they can sign with */
  beneficiaryEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    .optional(),
  purpose: z.enum(['college', 'first_home', 'wedding', 'other']).default('other'),
  goalUsd: z.number().positive().max(10_000_000).optional(),
  /** ISO date the fund opens; the program caps how far out it can be */
  unlockAt: z.string().min(10).max(40),
  allocations: z.array(allocationSchema).min(1).max(MAX_FUND_STOCKS),
})

/**
 * Records a fund and returns the relayer-signed transaction that opens it on-chain. The unlock
 * date and who can withdraw are fixed here and can never be changed, so the money is safe from
 * everyone, us included. The creator pays what the fund's years of rent cost us, in cash.
 */
export const POST = route(async ({ request }) => {
  const creator = await requireUser(request)
  if (!isOnboarded(creator))
    throw forbidden('Finish setting up your account first.', 'not_onboarded')
  const creatorWallet = new PublicKey(requireWallet(creator))
  const body = await readBody(request, createSchema)
  const payer = relayer().publicKey

  const unlockAt = new Date(body.unlockAt)
  const seconds = (unlockAt.getTime() - Date.now()) / 1000
  if (Number.isNaN(seconds) || seconds <= 0) throw badRequest('Pick an unlock date in the future.')
  if (seconds > MAX_LOCK_SECONDS) throw badRequest('A fund can be locked for up to 25 years.')

  if (new Set(body.allocations.map((item) => item.mint)).size !== body.allocations.length) {
    throw badRequest('Pick each stock only once.')
  }
  if (body.allocations.reduce((sum, item) => sum + item.percent, 0) !== 100) {
    throw badRequest('The mix has to add up to 100%.')
  }
  for (const item of body.allocations) {
    if (!(await findStock(item.mint))) throw badRequest('Pick a stock the fund can buy.')
  }

  // Whoever the fund is for signs for it themselves. Without an email the creator holds it, which
  // is how a fund for a small child works.
  const email = body.beneficiaryEmail
  const beneficiaryWallet =
    !email || email === creator.email
      ? creatorWallet.toBase58()
      : ((await findWalletForEmail(email)) ?? (await walletForEmail(email)))
  const { data: beneficiaryRow } = email
    ? await db.from('users').select('id').eq('email', email).maybeSingle()
    : { data: null }

  const fee = await fundCreateFee()
  const cash = await cashBalance(creatorWallet)
  if (cash < fee.raw) {
    throw badRequest(
      `Add ${formatUsd(Number(fee.raw - cash) / 1_000_000)} cash to open this fund.`,
      'insufficient_cash',
    )
  }
  await ensureTreasuryAccount()

  const id = crypto.randomUUID()
  const { data, error } = await db
    .from('funds')
    .insert({
      id,
      creator_id: creator.id,
      creator_wallet: creatorWallet.toBase58(),
      name: body.name ?? null,
      beneficiary_name: body.beneficiaryName,
      beneficiary_wallet: beneficiaryWallet,
      beneficiary_email: email && beneficiaryWallet !== creatorWallet.toBase58() ? email : null,
      beneficiary_id: (beneficiaryRow as { id: string } | null)?.id ?? null,
      purpose: body.purpose,
      goal_usd: body.goalUsd ?? null,
      unlock_at: unlockAt.toISOString(),
      allocations: Object.fromEntries(body.allocations.map((item) => [item.mint, item.percent])),
      rent_payer: payer.toBase58(),
      fee_raw: fee.raw.toString(),
      fee_usd: fee.usd,
    })
    .select(FUND_COLUMNS)
    .single()
  if (error) throw error

  const transaction = await buildRelayedTransaction([
    createFundInstruction({
      payer,
      creator: creatorWallet,
      beneficiary: new PublicKey(beneficiaryWallet),
      fundId: id,
      unlockAt,
    }),
    ...(fee.raw > 0n ? [feeTransferInstruction(creatorWallet, fee.raw)] : []),
  ])

  return json({ fund: await toFundView(data as FundRow, creator), transaction }, { status: 201 })
})
