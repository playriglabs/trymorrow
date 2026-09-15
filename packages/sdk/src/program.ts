import { PublicKey } from '@solana/web3.js'
import { uuidToBytes } from './encoding'

export const MORROW_PROGRAM_ID = new PublicKey('AjwKavx3r4NJ9tgmjxv24mCpFLp2QMnKzcRC5J7vaupa')

const GIFT_SEED = new TextEncoder().encode('gift')
const FUND_SEED = new TextEncoder().encode('fund')

/** Gifts are keyed by sender + the gift's database UUID, so the link id maps to one PDA */
export function findGiftAddress(sender: PublicKey, giftId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [GIFT_SEED, sender.toBytes(), uuidToBytes(giftId)],
    MORROW_PROGRAM_ID,
  )[0]
}

/** Funds are keyed by creator + the fund's database UUID, so the link id maps to one PDA */
export function findFundAddress(creator: PublicKey, fundId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [FUND_SEED, creator.toBytes(), uuidToBytes(fundId)],
    MORROW_PROGRAM_ID,
  )[0]
}

// Anchor discriminators: first 8 bytes of sha256("global:<ix>") / sha256("account:<Name>")
export const DISCRIMINATORS = {
  createGift: [72, 252, 112, 45, 15, 71, 104, 225],
  claimGift: [100, 71, 251, 14, 225, 15, 243, 196],
  refundGift: [55, 32, 33, 189, 203, 108, 48, 9],
  createFund: [38, 128, 18, 11, 203, 0, 153, 21],
  contribute: [82, 33, 68, 131, 32, 0, 205, 95],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  closeFund: [230, 183, 3, 112, 236, 252, 5, 185],
  giftAccount: [228, 29, 11, 4, 86, 244, 244, 33],
  fundAccount: [62, 128, 183, 208, 91, 31, 212, 209],
} as const

/** A fund can't be locked for longer than this; the program rejects anything further out */
export const MAX_LOCK_SECONDS = 25 * 365 * 24 * 60 * 60
