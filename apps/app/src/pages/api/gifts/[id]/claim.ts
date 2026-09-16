import { type ClaimGiftParams, claimGiftInstruction } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { findGiftAsset } from '@/lib/server/catalog'
import { getGift } from '@/lib/server/gifts'
import { badRequest, forbidden, json, route } from '@/lib/server/http'
import { buildRelayedTransaction, relayer } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

/** Returns one transaction that claims everything in the gift, only to the account it's locked to */
export const POST = route(async ({ params, request }) => {
  const [gift, viewer] = await Promise.all([getGift(params.id), requireUser(request)])
  if (gift.status !== 'pending')
    throw badRequest('This gift can’t be opened anymore.', 'not_claimable')

  const wallet = requireWallet(viewer)
  if (wallet !== gift.recipient_wallet) {
    throw forbidden('This gift is for a different account.', 'wrong_account')
  }

  const claims: ClaimGiftParams[] = []
  for (const item of gift.gift_items) {
    const asset = await findGiftAsset(item.mint)
    if (!asset) throw badRequest('This gift can’t be opened right now.')
    claims.push({
      payer: relayer().publicKey,
      recipient: new PublicKey(wallet),
      sender: new PublicKey(gift.sender_wallet),
      rentPayer: new PublicKey(gift.rent_payer),
      mint: asset.mint,
      tokenProgram: asset.tokenProgram,
      giftId: item.id,
    })
  }
  if (claims.length === 0) throw badRequest('This gift can’t be opened right now.')

  const transaction = await buildRelayedTransaction(claims.map(claimGiftInstruction))
  return json({ transaction })
})
