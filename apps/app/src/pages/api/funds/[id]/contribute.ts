import { contributeInstruction } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { formatUsd } from '@/lib/format'
import { MAX_FUND_HOLDINGS } from '@/lib/funds'
import { findStock } from '@/lib/server/catalog'
import {
  cashBalance,
  contributionFee,
  ensureTreasuryAccount,
  feeTransferInstruction,
} from '@/lib/server/fees'
import { fundAddress, getFund, vaultBalances } from '@/lib/server/funds'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { buildRelayedTransaction, relayer, tokenBalance } from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { isOnboarded, requireUser, requireWallet } from '@/lib/server/users'

const itemSchema = z.object({
  mint: z.string().min(32).max(44),
  amountRaw: z.string().regex(/^[1-9]\d{0,19}$/),
  usdValue: z.number().nonnegative().max(1_000_000).optional(),
})

const schema = z.object({
  items: z.array(itemSchema).min(1).max(MAX_FUND_HOLDINGS),
  note: z.string().trim().max(140).optional(),
})

/**
 * Moves shares the contributor already holds into the fund's vaults, one instruction per stock.
 * Nothing here can take anything out: the only way back is `withdraw`, after the unlock date, by
 * the person the fund is for.
 */
export const POST = route(async ({ params, request }) => {
  const [fund, user] = await Promise.all([getFund(params.id), requireUser(request)])
  if (!isOnboarded(user)) throw forbidden('Finish setting up your account first.', 'not_onboarded')
  if (fund.status !== 'active') throw badRequest('This fund isn’t open yet.', 'not_active')

  const wallet = new PublicKey(requireWallet(user))
  const body = await readBody(request, schema)
  const payer = relayer().publicKey

  if (new Set(body.items.map((item) => item.mint)).size !== body.items.length) {
    throw badRequest('Add each stock only once.')
  }
  const items = await Promise.all(
    body.items.map(async (item) => {
      const asset = await findStock(item.mint)
      if (!asset) throw badRequest('We can’t add that stock right now.')
      return { ...item, asset, amount: BigInt(item.amountRaw) }
    }),
  )

  const balances = await Promise.all(items.map((item) => tokenBalance(wallet, item.asset.mint)))
  items.forEach((item, index) => {
    if ((balances[index] ?? 0n) < item.amount) {
      throw badRequest(`You don’t have enough ${item.asset.name} shares.`, 'insufficient')
    }
  })

  const fee = await contributionFee(
    fundAddress(fund),
    new PublicKey(fund.beneficiary_wallet),
    items.map((item) => item.asset),
  )
  // Every stock in a fund is a vault whose rent is locked until the unlock date, and a withdrawal
  // has to stay signable, so a fund can only ever hold so many
  const held = await vaultBalances(fund)
  if (held.size + fee.newVaults.length > MAX_FUND_HOLDINGS) {
    throw badRequest(
      `This fund already holds ${held.size} stocks, which is as many as it can keep. Add more of what's already in it.`,
      'too_many_stocks',
    )
  }
  if (fee.raw > 0n) {
    const cash = await cashBalance(wallet)
    if (cash < fee.raw) {
      throw badRequest(
        `Add ${formatUsd(Number(fee.raw - cash) / 1_000_000)} cash to cover what this costs.`,
        'insufficient_cash',
      )
    }
    await ensureTreasuryAccount()
  }

  const groupId = crypto.randomUUID()
  const { error } = await db.from('fund_contributions').insert(
    items.map((item) => ({
      fund_id: fund.id,
      group_id: groupId,
      contributor_id: user.id,
      contributor_name: user.name ?? 'Someone',
      contributor_wallet: wallet.toBase58(),
      mint: item.mint,
      amount_raw: item.amountRaw,
      usd_value: item.usdValue ?? null,
      note: body.note || null,
      fee_raw: (fee.perMint[item.mint]?.raw ?? 0n).toString(),
      fee_usd: fee.perMint[item.mint]?.usd ?? 0,
    })),
  )
  if (error) throw error

  const transaction = await buildRelayedTransaction([
    ...items.map((item) =>
      contributeInstruction({
        payer,
        contributor: wallet,
        creator: new PublicKey(fund.creator_wallet),
        mint: item.asset.mint,
        tokenProgram: item.asset.tokenProgram,
        fundId: fund.id,
        amount: item.amount,
      }),
    ),
    ...(fee.raw > 0n ? [feeTransferInstruction(wallet, fee.raw)] : []),
  ])

  return json({ contributionId: groupId, feeUsd: fee.usd, transaction }, { status: 201 })
})
