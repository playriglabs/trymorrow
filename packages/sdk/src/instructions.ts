import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createHarvestWithheldTokensToMintInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import { type PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import type { Buffer } from 'buffer'
import { ArgWriter, uuidToBytes } from './encoding'
import {
  DISCRIMINATORS,
  findFundAddress,
  findGiftAddress,
  findGiftCardAddress,
  MORROW_PROGRAM_ID,
} from './program'

type Meta = { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }

const signer = (pubkey: PublicKey, isWritable = false): Meta => ({
  pubkey,
  isSigner: true,
  isWritable,
})
const writable = (pubkey: PublicKey): Meta => ({ pubkey, isSigner: false, isWritable: true })
const readonly = (pubkey: PublicKey): Meta => ({ pubkey, isSigner: false, isWritable: false })

/** Owner-off-curve is allowed because vault owners are PDAs */
const ata = (mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, tokenProgram)

/** Where a gift, gift card or fund (the PDA `owner`) keeps its shares of `mint` */
export const vaultAddress = ata

const programs = (tokenProgram: PublicKey): Meta[] => [
  readonly(tokenProgram),
  readonly(ASSOCIATED_TOKEN_PROGRAM_ID),
  readonly(SystemProgram.programId),
]

const instruction = (keys: Meta[], data: Buffer) =>
  new TransactionInstruction({ programId: MORROW_PROGRAM_ID, keys, data })

/** Redeem codes are 16 Crockford-base32 characters on the wire; pasted dashes and case are noise */
export function encodeRedeemCode(code: string): Uint8Array {
  const normalized = code.toUpperCase().replaceAll(/[^A-Z0-9]/g, '')
  if (normalized.length !== 16) throw new Error(`Redeem code must be 16 characters: ${code}`)
  return new TextEncoder().encode(normalized)
}

export type CreateGiftParams = {
  /** Pays rent for the gift + vault and gets it back on claim or refund (the relayer) */
  payer: PublicKey
  sender: PublicKey
  recipient: PublicKey
  mint: PublicKey
  tokenProgram: PublicKey
  giftId: string
  amount: bigint
  expiresAt: Date
}

export function createGiftInstruction(p: CreateGiftParams): TransactionInstruction {
  const gift = findGiftAddress(p.sender, p.giftId)
  const data = new ArgWriter(DISCRIMINATORS.createGift, 16 + 32 + 8 + 8)
    .bytes(uuidToBytes(p.giftId))
    .pubkey(p.recipient)
    .u64(p.amount)
    .i64(BigInt(Math.floor(p.expiresAt.getTime() / 1000)))
    .done()

  return instruction(
    [
      signer(p.payer, true),
      signer(p.sender),
      readonly(p.mint),
      writable(ata(p.mint, p.sender, p.tokenProgram)),
      writable(gift),
      writable(ata(p.mint, gift, p.tokenProgram)),
      ...programs(p.tokenProgram),
    ],
    data,
  )
}

export type ClaimGiftParams = {
  payer: PublicKey
  recipient: PublicKey
  sender: PublicKey
  rentPayer: PublicKey
  mint: PublicKey
  tokenProgram: PublicKey
  giftId: string
}

export function claimGiftInstruction(p: ClaimGiftParams): TransactionInstruction {
  const gift = findGiftAddress(p.sender, p.giftId)
  return instruction(
    [
      signer(p.payer, true),
      signer(p.recipient),
      writable(gift),
      writable(p.rentPayer),
      readonly(p.mint),
      writable(ata(p.mint, gift, p.tokenProgram)),
      writable(ata(p.mint, p.recipient, p.tokenProgram)),
      ...programs(p.tokenProgram),
    ],
    new ArgWriter(DISCRIMINATORS.claimGift, 0).done(),
  )
}

export type RefundGiftParams = {
  payer: PublicKey
  /** The sender, or anyone once the gift has expired */
  authority: PublicKey
  sender: PublicKey
  rentPayer: PublicKey
  mint: PublicKey
  tokenProgram: PublicKey
  giftId: string
}

export function refundGiftInstruction(p: RefundGiftParams): TransactionInstruction {
  const gift = findGiftAddress(p.sender, p.giftId)
  return instruction(
    [
      signer(p.payer, true),
      signer(p.authority),
      writable(gift),
      readonly(p.sender),
      writable(p.rentPayer),
      readonly(p.mint),
      writable(ata(p.mint, gift, p.tokenProgram)),
      writable(ata(p.mint, p.sender, p.tokenProgram)),
      ...programs(p.tokenProgram),
    ],
    new ArgWriter(DISCRIMINATORS.refundGift, 0).done(),
  )
}

export type CreateGiftCardParams = {
  /** Pays rent for the card + vault and gets it back on claim or refund (the relayer) */
  payer: PublicKey
  sender: PublicKey
  mint: PublicKey
  tokenProgram: PublicKey
  cardId: string
  /** sha256 of the redeem code, 32 bytes; the code itself never touches chain */
  codeHash: Uint8Array
  amount: bigint
  expiresAt: Date
}

export function createGiftCardInstruction(p: CreateGiftCardParams): TransactionInstruction {
  if (p.codeHash.length !== 32) throw new Error('codeHash must be 32 bytes')
  const card = findGiftCardAddress(p.sender, p.cardId)
  const data = new ArgWriter(DISCRIMINATORS.createGiftCard, 16 + 32 + 8 + 8)
    .bytes(uuidToBytes(p.cardId))
    .bytes(p.codeHash)
    .u64(p.amount)
    .i64(BigInt(Math.floor(p.expiresAt.getTime() / 1000)))
    .done()

  return instruction(
    [
      signer(p.payer, true),
      signer(p.sender),
      readonly(p.mint),
      writable(ata(p.mint, p.sender, p.tokenProgram)),
      writable(card),
      writable(ata(p.mint, card, p.tokenProgram)),
      ...programs(p.tokenProgram),
    ],
    data,
  )
}

export type ClaimGiftCardParams = {
  payer: PublicKey
  /** Whoever is redeeming; the program releases to this account, not a stored one */
  claimant: PublicKey
  sender: PublicKey
  rentPayer: PublicKey
  mint: PublicKey
  tokenProgram: PublicKey
  cardId: string
  code: string
}

export function claimGiftCardInstruction(p: ClaimGiftCardParams): TransactionInstruction {
  const card = findGiftCardAddress(p.sender, p.cardId)
  return instruction(
    [
      signer(p.payer, true),
      signer(p.claimant),
      writable(card),
      writable(p.rentPayer),
      readonly(p.mint),
      writable(ata(p.mint, card, p.tokenProgram)),
      writable(ata(p.mint, p.claimant, p.tokenProgram)),
      ...programs(p.tokenProgram),
    ],
    new ArgWriter(DISCRIMINATORS.claimGiftCard, 16).bytes(encodeRedeemCode(p.code)).done(),
  )
}

export type RefundGiftCardParams = {
  payer: PublicKey
  /** The sender, or anyone once the card has expired */
  authority: PublicKey
  sender: PublicKey
  rentPayer: PublicKey
  mint: PublicKey
  tokenProgram: PublicKey
  cardId: string
}

export function refundGiftCardInstruction(p: RefundGiftCardParams): TransactionInstruction {
  const card = findGiftCardAddress(p.sender, p.cardId)
  return instruction(
    [
      signer(p.payer, true),
      signer(p.authority),
      writable(card),
      readonly(p.sender),
      writable(p.rentPayer),
      readonly(p.mint),
      writable(ata(p.mint, card, p.tokenProgram)),
      writable(ata(p.mint, p.sender, p.tokenProgram)),
      ...programs(p.tokenProgram),
    ],
    new ArgWriter(DISCRIMINATORS.refundGiftCard, 0).done(),
  )
}

export type CreateFundParams = {
  /** Pays rent for the fund account and gets it back when the fund is closed (the relayer) */
  payer: PublicKey
  creator: PublicKey
  /** The only account that can withdraw, and only after `unlockAt` */
  beneficiary: PublicKey
  fundId: string
  unlockAt: Date
}

export function createFundInstruction(p: CreateFundParams): TransactionInstruction {
  const fund = findFundAddress(p.creator, p.fundId)
  const data = new ArgWriter(DISCRIMINATORS.createFund, 16 + 32 + 8)
    .bytes(uuidToBytes(p.fundId))
    .pubkey(p.beneficiary)
    .i64(BigInt(Math.floor(p.unlockAt.getTime() / 1000)))
    .done()

  return instruction(
    [signer(p.payer, true), signer(p.creator), writable(fund), readonly(SystemProgram.programId)],
    data,
  )
}

export type ContributeParams = {
  /** Pays rent for a vault the first time the fund holds this stock */
  payer: PublicKey
  contributor: PublicKey
  creator: PublicKey
  mint: PublicKey
  tokenProgram: PublicKey
  fundId: string
  amount: bigint
}

export function contributeInstruction(p: ContributeParams): TransactionInstruction {
  const fund = findFundAddress(p.creator, p.fundId)
  const data = new ArgWriter(DISCRIMINATORS.contribute, 8).u64(p.amount).done()

  return instruction(
    [
      signer(p.payer, true),
      signer(p.contributor),
      writable(fund),
      readonly(p.mint),
      writable(ata(p.mint, p.contributor, p.tokenProgram)),
      writable(ata(p.mint, fund, p.tokenProgram)),
      ...programs(p.tokenProgram),
    ],
    data,
  )
}

export type WithdrawParams = {
  payer: PublicKey
  beneficiary: PublicKey
  creator: PublicKey
  rentPayer: PublicKey
  mint: PublicKey
  tokenProgram: PublicKey
  fundId: string
}

export function withdrawInstruction(p: WithdrawParams): TransactionInstruction {
  const fund = findFundAddress(p.creator, p.fundId)
  return instruction(
    [
      signer(p.payer, true),
      signer(p.beneficiary),
      writable(fund),
      writable(p.rentPayer),
      readonly(p.mint),
      writable(ata(p.mint, fund, p.tokenProgram)),
      writable(ata(p.mint, p.beneficiary, p.tokenProgram)),
      ...programs(p.tokenProgram),
    ],
    new ArgWriter(DISCRIMINATORS.withdraw, 0).done(),
  )
}

export type CloseFundParams = {
  /** Signs and receives the rent back; only the account that paid it can close the fund */
  rentPayer: PublicKey
  creator: PublicKey
  fundId: string
}

export function closeFundInstruction(p: CloseFundParams): TransactionInstruction {
  return instruction(
    [signer(p.rentPayer, true), writable(findFundAddress(p.creator, p.fundId))],
    new ArgWriter(DISCRIMINATORS.closeFund, 0).done(),
  )
}

/**
 * Moves transfer fees withheld in `sources` to the mint. Token-2022 won't close an account still
 * holding withheld fees, so this goes before anything that closes a vault of a transfer-fee stock
 * (PreStocks). Anyone may call it and it moves nothing but the withheld fees.
 */
export function harvestWithheldFeesInstruction(
  mint: PublicKey,
  sources: PublicKey[],
): TransactionInstruction {
  return createHarvestWithheldTokensToMintInstruction(mint, sources, TOKEN_2022_PROGRAM_ID)
}
