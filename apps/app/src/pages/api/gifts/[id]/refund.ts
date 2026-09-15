import { type RefundGiftParams, refundGiftInstruction } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { findStock } from '@/lib/server/catalog'
import { getGift } from '@/lib/server/gifts'
import { badRequest, forbidden, json, route } from '@/lib/server/http'
import { buildRelayedTransaction, relayer } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

/** Returns one transaction that takes every stock in the gift back to the sender */
export const POST = route(async ({ params, request }) => {
  const [gift, viewer] = await Promise.all([getGift(params.id), requireUser(request)])
  if (gift.status !== 'pending')
    throw badRequest('This gift can’t be taken back anymore.', 'not_refundable')
  if (viewer.id !== gift.sender_id)
    throw forbidden('Only the sender can take a gift back.', 'wrong_account')

  const wallet = requireWallet(viewer)
  // The program checks the refund authority signature, so the signing account must be the sender's own
  if (wallet !== gift.sender_wallet) {
    throw forbidden('This gift was sent from a different account.', 'wrong_account')
  }

  const refunds: RefundGiftParams[] = []
  for (const item of gift.gift_items) {
    const asset = await findStock(item.mint)
    if (!asset) throw badRequest('This gift can’t be taken back right now.')
    refunds.push({
      payer: relayer().publicKey,
      authority: new PublicKey(wallet),
      sender: new PublicKey(gift.sender_wallet),
      rentPayer: new PublicKey(gift.rent_payer),
      mint: asset.mint,
      tokenProgram: asset.tokenProgram,
      giftId: item.id,
    })
  }
  if (refunds.length === 0) throw badRequest('This gift can’t be taken back right now.')

  const transaction = await buildRelayedTransaction(refunds.map(refundGiftInstruction))
  return json({ transaction })
})
