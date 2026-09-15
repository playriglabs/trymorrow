import { PublicKey } from '@solana/web3.js'
import { Buffer } from 'buffer'

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replaceAll('-', '')
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`Invalid UUID: ${uuid}`)
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

/** Little-endian Borsh writer for the handful of arg types the program uses */
export class ArgWriter {
  private readonly buffer: Uint8Array
  private readonly view: DataView
  private offset = 0

  constructor(discriminator: readonly number[], size: number) {
    this.buffer = new Uint8Array(discriminator.length + size)
    this.view = new DataView(this.buffer.buffer)
    this.bytes(Uint8Array.from(discriminator))
  }

  bytes(value: Uint8Array): this {
    this.buffer.set(value, this.offset)
    this.offset += value.length
    return this
  }

  pubkey(value: PublicKey): this {
    return this.bytes(value.toBytes())
  }

  u64(value: bigint): this {
    this.view.setBigUint64(this.offset, value, true)
    this.offset += 8
    return this
  }

  i64(value: bigint): this {
    this.view.setBigInt64(this.offset, value, true)
    this.offset += 8
    return this
  }

  done(): Buffer {
    if (this.offset !== this.buffer.length) {
      throw new Error(`Encoded ${this.offset} of ${this.buffer.length} bytes`)
    }
    return Buffer.from(this.buffer)
  }
}

export type GiftAccount = {
  sender: PublicKey
  recipient: PublicKey
  mint: PublicKey
  rentPayer: PublicKey
  amount: bigint
  expiresAt: bigint
  bump: number
}

/** Decodes `Gift` account data (8-byte discriminator + fields in declaration order) */
export function decodeGiftAccount(data: Uint8Array): GiftAccount {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const key = (offset: number) => new PublicKey(data.slice(offset, offset + 32))
  return {
    sender: key(8),
    recipient: key(40),
    mint: key(72),
    rentPayer: key(104),
    amount: view.getBigUint64(136, true),
    expiresAt: view.getBigInt64(144, true),
    bump: data[168] ?? 0,
  }
}
