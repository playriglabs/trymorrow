import { USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { isFeeTransfer } from '@/lib/server/fees'
import {
  CONTRIBUTION_COLUMNS,
  FUND_COLUMNS,
  type FundContributionRow,
  type FundRow,
  fundAddress,
  getFund,
  notifyContribution,
  toFundView,
  vaultBalances,
} from '@/lib/server/funds'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { captureServerEvent } from '@/lib/server/posthog'
import {
  fundInstructions,
  morrowInstructionCount,
  parseRelayedTransaction,
  sendRelayedTransaction,
  tokenTransfers,
} from '@/lib/server/solana'
import { db } from '@/lib/server/supabase'
import { requireUser, requireWallet } from '@/lib/server/users'

const schema = z.object({
  transaction: z.string().min(100).max(4000),
  /** The contribution these instructions belong to; required when adding to a fund */
  contributionId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .optional(),
})

/**
 * Broadcasts a transaction the user signed in the browser. As with gifts, the server reads the
 * instructions itself and only sends what it recognises: one kind of action, on this fund, for
 * exactly the stocks and amounts it recorded, with no token instruction other than the fee.
 */
export const POST = route(async ({ params, request }) => {
  const [fund, viewer] = await Promise.all([getFund(params.id), requireUser(request)])
  const body = await readBody(request, schema)

  const transaction = parseRelayedTransaction(body.transaction)
  const found = fundInstructions(transaction, fundAddress(fund))
  const kinds = new Set(found.map((instruction) => instruction.action))
  const [action] = kinds
  if (
    found.length === 0 ||
    kinds.size !== 1 ||
    morrowInstructionCount(transaction) !== found.length
  ) {
    throw badRequest('That request doesn’t match this fund.')
  }

  const transfers = tokenTransfers(transaction)
  const paysFee = (raw: bigint, owner: PublicKey) =>
    raw > 0n
      ? transfers?.length === 1 &&
        transfers.every((transfer) => isFeeTransfer(transfer, owner, raw, USDC))
      : transfers?.length === 0

  if (action === 'createFund') {
    if (viewer.id !== fund.creator_id) throw forbidden('Only the creator can open this fund.')
    if (fund.status !== 'draft') throw badRequest('This fund is already open.', 'already_open')

    const [instruction] = found
    const unlockAt = BigInt(Math.floor(new Date(fund.unlock_at).getTime() / 1000))
    if (
      found.length !== 1 ||
      !instruction?.beneficiary?.equals(new PublicKey(fund.beneficiary_wallet)) ||
      instruction.unlockAt !== unlockAt ||
      !paysFee(BigInt(fund.fee_raw), new PublicKey(fund.creator_wallet))
    ) {
      throw badRequest('That request doesn’t match this fund.')
    }

    const { data, error } = await db
      .from('funds')
      .update({ status: 'active', create_signature: await sendRelayedTransaction(transaction) })
      .eq('id', fund.id)
      .select(FUND_COLUMNS)
      .single()
    if (error) throw error
    await captureServerEvent({
      request,
      distinctId: viewer.privy_id,
      event: 'fund_created',
      properties: { source: 'api', allocation_count: Object.keys(fund.allocations).length },
    })
    return json({ fund: await toFundView(data as FundRow, viewer) })
  }

  if (action === 'contribute') {
    if (!body.contributionId) throw badRequest('That request doesn’t match this fund.')
    const wallet = requireWallet(viewer)
    const { data, error } = await db
      .from('fund_contributions')
      .select(CONTRIBUTION_COLUMNS)
      .eq('fund_id', fund.id)
      .eq('group_id', body.contributionId)
      .eq('status', 'draft')
    if (error) throw error
    const rows = (data ?? []) as FundContributionRow[]

    const unmatched = [...found]
    const matches = rows.every((row) => {
      const index = unmatched.findIndex(
        (instruction) =>
          instruction.mint?.toBase58() === row.mint &&
          instruction.amount === BigInt(row.amount_raw),
      )
      if (index === -1) return false
      unmatched.splice(index, 1)
      return row.contributor_wallet === wallet
    })
    const fee = rows.reduce((sum, row) => sum + BigInt(row.fee_raw), 0n)
    if (
      rows.length === 0 ||
      !matches ||
      unmatched.length > 0 ||
      !paysFee(fee, new PublicKey(wallet))
    ) {
      throw badRequest('That request doesn’t match this fund.')
    }

    const signature = await sendRelayedTransaction(transaction)
    const { error: updateError } = await db
      .from('fund_contributions')
      .update({ status: 'confirmed', signature })
      .eq('group_id', body.contributionId)
    if (updateError) throw updateError

    await notifyContribution({
      fund,
      contributor: viewer,
      usdValue: rows.reduce((sum, row) => sum + Number(row.usd_value ?? 0), 0),
      mints: rows.map((row) => row.mint),
    }).catch((cause: unknown) =>
      console.error('Fund contribution notification failed', fund.id, cause),
    )
    await captureServerEvent({
      request,
      distinctId: viewer.privy_id,
      event: 'fund_contributed',
      properties: { source: 'api', item_count: rows.length },
    })

    return json({ fund: await toFundView(fund, viewer), signature })
  }

  if (action === 'withdraw') {
    if (requireWallet(viewer) !== fund.beneficiary_wallet) {
      throw forbidden('This fund is for a different account.', 'wrong_account')
    }
    if (fund.status !== 'active') throw badRequest('There’s nothing left to take out.')
    if (new Date(fund.unlock_at).getTime() > Date.now()) {
      throw badRequest('This fund is still locked.', 'still_locked')
    }

    const held = new Set(
      [...(await vaultBalances(fund))].filter(([, raw]) => raw > 0n).map(([mint]) => mint),
    )
    const asked = found.flatMap((instruction) => instruction.mint?.toBase58() ?? [])
    // A fund can hold more stocks than fit one transaction, so this may be one batch of several.
    // Every stock it names still has to be one the fund really holds, and named only once.
    if (
      transfers?.length !== 0 ||
      asked.length === 0 ||
      new Set(asked).size !== asked.length ||
      asked.some((mint) => !held.has(mint))
    ) {
      throw badRequest('That request doesn’t match this fund.')
    }

    const signature = await sendRelayedTransaction(transaction)
    const emptied = asked.length === held.size
    const { data, error } = await db
      .from('funds')
      .update(
        emptied
          ? {
              status: 'withdrawn',
              withdraw_signature: signature,
              withdrawn_at: new Date().toISOString(),
            }
          : { withdraw_signature: signature },
      )
      .eq('id', fund.id)
      .select(FUND_COLUMNS)
      .single()
    if (error) throw error
    await captureServerEvent({
      request,
      distinctId: viewer.privy_id,
      event: 'fund_withdrawn',
      properties: { source: 'api', item_count: asked.length, fund_emptied: emptied },
    })
    return json({ fund: await toFundView(data as FundRow, viewer) })
  }

  throw badRequest('That request doesn’t match this fund.')
})
