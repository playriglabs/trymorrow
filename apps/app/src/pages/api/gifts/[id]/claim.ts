import {
  type ClaimGiftCardParams,
  type ClaimGiftParams,
  claimGiftCardInstruction,
  claimGiftInstruction,
} from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { normalizeCode } from '@/lib/redeem-code'
import { findGiftAsset } from '@/lib/server/catalog'
import { getGift, giftHarvests, hashCode, isRedeemCode } from '@/lib/server/gifts'
import { badRequest, forbidden, json, readBody, route } from '@/lib/server/http'
import { buildRelayedTransaction, relayer } from '@/lib/server/solana'
import { requireUser, requireWallet } from '@/lib/server/users'

const codeSchema = z.object({ code: z.string().trim().min(8).max(64) })

/**
 * Returns one transaction that claims everything in the gift. A person-locked gift goes to the
 * account it's locked to; a gift card goes to whoever signed in and presented its code.
 */
export const POST = route(async ({ params, request }) => {
  const [gift, viewer] = await Promise.all([getGift(params.id), requireUser(request)])
  if (gift.status !== 'pending')
    throw badRequest('This gift can’t be opened anymore.', 'not_claimable')

  const wallet = requireWallet(viewer)
  const codeCard = gift.code_hash != null
  let code: string | null = null
  if (codeCard) {
    // The code is the whole lock: the server checks it for a clean error, the program checks it again
    const body = await readBody(request, codeSchema)
    if (!isRedeemCode(body.code)) throw badRequest('That code didn’t work.', 'wrong_code')
    if (hashCode(body.code) !== gift.code_hash)
      throw badRequest('That code didn’t work.', 'wrong_code')
    code = normalizeCode(body.code)
  } else if (wallet !== gift.recipient_wallet) {
    throw forbidden('This gift is for a different account.', 'wrong_account')
  }

  const claims: ClaimGiftParams[] = []
  const cardClaims: ClaimGiftCardParams[] = []
  for (const item of gift.gift_items) {
    const asset = await findGiftAsset(item.mint)
    if (!asset) throw badRequest('This gift can’t be opened right now.')
    const base = {
      payer: relayer().publicKey,
      sender: new PublicKey(gift.sender_wallet),
      rentPayer: new PublicKey(gift.rent_payer),
      mint: asset.mint,
      tokenProgram: asset.tokenProgram,
    }
    if (codeCard && code) {
      cardClaims.push({
        ...base,
        claimant: new PublicKey(wallet),
        cardId: item.id,
        code,
      })
    } else if (!codeCard) {
      claims.push({ ...base, recipient: new PublicKey(wallet), giftId: item.id })
    }
  }
  if (claims.length === 0 && cardClaims.length === 0)
    throw badRequest('This gift can’t be opened right now.')

  const harvests = await giftHarvests(
    gift,
    codeCard
      ? cardClaims.map((claim) => ({ ...claim, id: claim.cardId }))
      : claims.map((claim) => ({ ...claim, id: claim.giftId })),
  )
  const transaction = await buildRelayedTransaction([
    ...harvests,
    ...(codeCard ? cardClaims.map(claimGiftCardInstruction) : claims.map(claimGiftInstruction)),
  ])
  return json({ transaction })
})
