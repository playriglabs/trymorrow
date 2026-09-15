import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { type PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import type { Buffer } from 'buffer'
import { ArgWriter, uuidToBytes } from './encoding'
import { DISCRIMINATORS, findGiftAddress, MORROW_PROGRAM_ID } from './program'

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

const programs = (tokenProgram: PublicKey): Meta[] => [
  readonly(tokenProgram),
  readonly(ASSOCIATED_TOKEN_PROGRAM_ID),
  readonly(SystemProgram.programId),
]

const instruction = (keys: Meta[], data: Buffer) =>
  new TransactionInstruction({ programId: MORROW_PROGRAM_ID, keys, data })

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
