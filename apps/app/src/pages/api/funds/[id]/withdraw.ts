import { type WithdrawParams, withdrawInstruction } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { MAX_WITHDRAWALS_PER_TRANSACTION } from '@/lib/funds'
import { findStock } from '@/lib/server/catalog'
import { getFund, vaultBalances } from '@/lib/server/funds'
import { badRequest, forbidden, json, route } from '@/lib/server/http'
import { buildRelayedTransaction, relayer } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

/**
 * Empties every vault to the person the fund is for, and only after the unlock date. Closing the
 * vaults sends their rent back to the relayer that paid it. More stocks than fit 1,232 bytes come
 * back as several transactions, signed and sent one after another.
 */
export const POST = route(async ({ params, request }) => {
  const [fund, viewer] = await Promise.all([getFund(params.id), requireUser(request)])
  const wallet = requireWallet(viewer)
  if (wallet !== fund.beneficiary_wallet) {
    throw forbidden('This fund is for a different account.', 'wrong_account')
  }
  if (fund.status !== 'active') throw badRequest('There’s nothing left to take out.')
  if (new Date(fund.unlock_at).getTime() > Date.now()) {
    throw badRequest('This fund is still locked.', 'still_locked')
  }

  const balances = await vaultBalances(fund)
  const withdrawals: WithdrawParams[] = []
  for (const [mint, raw] of balances) {
    if (raw === 0n) continue
    const asset = await findStock(mint)
    if (!asset) throw badRequest('We can’t pay this fund out right now.')
    withdrawals.push({
      payer: relayer().publicKey,
      beneficiary: new PublicKey(wallet),
      creator: new PublicKey(fund.creator_wallet),
      rentPayer: new PublicKey(fund.rent_payer ?? relayer().publicKey.toBase58()),
      mint: asset.mint,
      tokenProgram: asset.tokenProgram,
      fundId: fund.id,
    })
  }
  if (withdrawals.length === 0) throw badRequest('There’s nothing left to take out.')

  const batches: string[] = []
  for (let index = 0; index < withdrawals.length; index += MAX_WITHDRAWALS_PER_TRANSACTION) {
    batches.push(
      await buildRelayedTransaction(
        withdrawals.slice(index, index + MAX_WITHDRAWALS_PER_TRANSACTION).map(withdrawInstruction),
      ),
    )
  }
  return json({ transactions: batches })
})
