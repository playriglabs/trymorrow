import { PublicKey } from '@solana/web3.js'
import { uuidToBytes } from './encoding'

export const MORROW_PROGRAM_ID = new PublicKey('AjwKavx3r4NJ9tgmjxv24mCpFLp2QMnKzcRC5J7vaupa')

const GIFT_SEED = new TextEncoder().encode('gift')

/** Gifts are keyed by sender + the gift's database UUID, so the link id maps to one PDA */
export function findGiftAddress(sender: PublicKey, giftId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [GIFT_SEED, sender.toBytes(), uuidToBytes(giftId)],
    MORROW_PROGRAM_ID,
  )[0]
}

// Anchor discriminators: first 8 bytes of sha256("global:<ix>") / sha256("account:<Name>")
export const DISCRIMINATORS = {
  createGift: [72, 252, 112, 45, 15, 71, 104, 225],
  claimGift: [100, 71, 251, 14, 225, 15, 243, 196],
  refundGift: [55, 32, 33, 189, 203, 108, 48, 9],
  giftAccount: [228, 29, 11, 4, 86, 244, 244, 33],
} as const
