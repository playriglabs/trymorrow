/**
 * Runs the gift instructions against a throwaway validator with the mints a real gift can hold:
 * Token-2022 stocks and a plain SPL Token stand-in for cash. A stock and cash are locked together,
 * the claim hands both to the recipient in one transaction, a second pair goes back to the sender,
 * and every lamport of rent returns to the account that paid it. Also checks that the biggest gift
 * the app builds — two stocks, cash, and a cash fee — still fits Solana's 1,232-byte limit.
 * Run with `pnpm test:gifts` after `pnpm build:program`.
 */

import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createAssociatedTokenAccount,
  createMint,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  type PublicKey,
  type Signer,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  claimGiftInstruction,
  createGiftInstruction,
  findGiftAddress,
  MORROW_PROGRAM_ID,
  refundGiftInstruction,
} from '../src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const PROGRAM_SO = resolve(here, '../../../programs/target/deploy/morrow.so')
const RPC = 'http://127.0.0.1:8899'
/** xStocks use 8 decimals, cash 6 */
const STOCK_DECIMALS = 8
const CASH_DECIMALS = 6

const connection = new Connection(RPC, 'confirmed')
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function startValidator() {
  const validator = spawn(
    'solana-test-validator',
    ['--reset', '--quiet', '--bpf-program', MORROW_PROGRAM_ID.toBase58(), PROGRAM_SO],
    { stdio: 'ignore', cwd: here },
  )
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await connection.getLatestBlockhash()
      return validator
    } catch {
      await wait(1_000)
    }
  }
  validator.kill()
  throw new Error('solana-test-validator did not come up')
}

async function fund(keypair: Keypair, sol = 10) {
  const signature = await connection.requestAirdrop(keypair.publicKey, sol * LAMPORTS_PER_SOL)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
}

/** Compiles the same way the server does, so the byte counts here are the real ones */
async function compile(instructions: TransactionInstruction[], payer: PublicKey) {
  const { blockhash } = await connection.getLatestBlockhash()
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(),
  )
}

/** Sends and re-sends until it lands, the way the server does; localnet drops the odd one */
async function send(instructions: TransactionInstruction[], signers: Signer[]) {
  const [payer] = signers as [Signer, ...Signer[]]
  const transaction = await compile(instructions, payer.publicKey)
  transaction.sign(signers)
  const raw = transaction.serialize()
  const signature = await connection.sendRawTransaction(raw, { maxRetries: 0 })

  for (let attempt = 0; attempt < 30; attempt++) {
    const {
      value: [status],
    } = await connection.getSignatureStatuses([signature])
    if (status?.err) throw new Error(`${signature} failed: ${JSON.stringify(status.err)}`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return signature
    }
    await wait(500)
    await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {})
  }
  throw new Error(`${signature} never landed`)
}

const balance = (key: PublicKey) => connection.getBalance(key, 'confirmed')

async function main() {
  const relayer = Keypair.generate()
  const sender = Keypair.generate()
  const recipient = Keypair.generate()
  for (const keypair of [relayer, sender, recipient]) await fund(keypair)

  const stockMint = await createMint(
    connection,
    relayer,
    relayer.publicKey,
    null,
    STOCK_DECIMALS,
    Keypair.generate(),
    undefined,
    TOKEN_2022_PROGRAM_ID,
  )
  const cashMint = await createMint(
    connection,
    relayer,
    relayer.publicKey,
    null,
    CASH_DECIMALS,
    Keypair.generate(),
    undefined,
    TOKEN_PROGRAM_ID,
  )
  const amounts = { stock: 1_000_000_000n, cash: 25_000_000n }
  for (const [mint, tokenProgram, amount] of [
    [stockMint, TOKEN_2022_PROGRAM_ID, amounts.stock],
    [cashMint, TOKEN_PROGRAM_ID, amounts.cash],
  ] as const) {
    await createAssociatedTokenAccount(
      connection,
      relayer,
      mint,
      sender.publicKey,
      undefined,
      tokenProgram,
    )
    await mintTo(
      connection,
      relayer,
      mint,
      getAssociatedTokenAddressSync(mint, sender.publicKey, true, tokenProgram),
      relayer,
      amount * 2n, // enough for the claimed pair and the refunded pair
      [],
      undefined,
      tokenProgram,
    )
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000)
  const gift = (mint: PublicKey, tokenProgram: PublicKey, giftId: string, amount: bigint) =>
    createGiftInstruction({
      payer: relayer.publicKey,
      sender: sender.publicKey,
      recipient: recipient.publicKey,
      mint,
      tokenProgram,
      giftId,
      amount,
      expiresAt,
    })

  // The biggest gift the app can build: two stocks, cash, and the cash fee transfer on top
  const otherStock = await createMint(
    connection,
    relayer,
    relayer.publicKey,
    null,
    STOCK_DECIMALS,
    Keypair.generate(),
    undefined,
    TOKEN_2022_PROGRAM_ID,
  )
  const sizeOf = async (instructions: TransactionInstruction[]) =>
    (await compile(instructions, relayer.publicKey)).serialize().length + 64 // one more signature
  const worstCase = await sizeOf([
    gift(otherStock, TOKEN_2022_PROGRAM_ID, crypto.randomUUID(), 1n),
    gift(stockMint, TOKEN_2022_PROGRAM_ID, crypto.randomUUID(), 1n),
    gift(cashMint, TOKEN_PROGRAM_ID, crypto.randomUUID(), 1n),
    createTransferInstruction(
      getAssociatedTokenAddressSync(cashMint, sender.publicKey, true, TOKEN_PROGRAM_ID),
      getAssociatedTokenAddressSync(cashMint, relayer.publicKey, true, TOKEN_PROGRAM_ID),
      sender.publicKey,
      1n,
      [],
      TOKEN_PROGRAM_ID,
    ),
  ])
  console.log('transaction bytes: 2 stocks + cash + cash fee =', worstCase)
  assert.ok(
    worstCase <= 1232,
    `the biggest gift is ${worstCase} bytes, over Solana's 1,232-byte limit`,
  )

  // Pair one: a stock and cash locked together, then claimed together. The relayer snapshot is
  // taken before any rent is locked, so everything that leaves after this point has to come back.
  const relayerBefore = await balance(relayer.publicKey)
  const claimedIds = [crypto.randomUUID(), crypto.randomUUID()]
  const vaultOf = (giftId: string, mint: PublicKey, tokenProgram: PublicKey) =>
    getAssociatedTokenAddressSync(
      mint,
      findGiftAddress(sender.publicKey, giftId),
      true,
      tokenProgram,
    )
  await send(
    [
      gift(stockMint, TOKEN_2022_PROGRAM_ID, claimedIds[0], amounts.stock),
      gift(cashMint, TOKEN_PROGRAM_ID, claimedIds[1], amounts.cash),
    ],
    [relayer, sender],
  )
  await send(
    [
      claimGiftInstruction({
        payer: relayer.publicKey,
        recipient: recipient.publicKey,
        sender: sender.publicKey,
        rentPayer: relayer.publicKey,
        mint: stockMint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        giftId: claimedIds[0],
      }),
      claimGiftInstruction({
        payer: relayer.publicKey,
        recipient: recipient.publicKey,
        sender: sender.publicKey,
        rentPayer: relayer.publicKey,
        mint: cashMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        giftId: claimedIds[1],
      }),
    ],
    [relayer, recipient],
  )
  const received = await Promise.all(
    [stockMint, cashMint].map(async (mint, index) =>
      getAccount(
        connection,
        getAssociatedTokenAddressSync(
          mint,
          recipient.publicKey,
          true,
          index === 0 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
        ),
        'confirmed',
        index === 0 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      ),
    ),
  )
  assert.equal(received[0].amount, amounts.stock, 'the claimed stock reached the recipient')
  assert.equal(received[1].amount, amounts.cash, 'the claimed cash reached the recipient')
  for (const [index, giftId] of claimedIds.entries()) {
    const [mint, tokenProgram] =
      index === 0 ? [stockMint, TOKEN_2022_PROGRAM_ID] : [cashMint, TOKEN_PROGRAM_ID]
    assert.equal(
      await connection.getAccountInfo(vaultOf(giftId, mint, tokenProgram), 'confirmed'),
      null,
      'the vault should be closed once claimed',
    )
  }

  // Pair two: locked the same way, but taken back by the sender before expiry
  const refundedIds = [crypto.randomUUID(), crypto.randomUUID()]
  await send(
    [
      gift(stockMint, TOKEN_2022_PROGRAM_ID, refundedIds[0], amounts.stock),
      gift(cashMint, TOKEN_PROGRAM_ID, refundedIds[1], amounts.cash),
    ],
    [relayer, sender],
  )
  const tokenAmountOf = (mint: PublicKey, tokenProgram: PublicKey, owner: PublicKey) =>
    getAccount(
      connection,
      getAssociatedTokenAddressSync(mint, owner, true, tokenProgram),
      'confirmed',
      tokenProgram,
    ).then((account) => account.amount)
  const senderBefore = await Promise.all([
    tokenAmountOf(stockMint, TOKEN_2022_PROGRAM_ID, sender.publicKey),
    tokenAmountOf(cashMint, TOKEN_PROGRAM_ID, sender.publicKey),
  ])
  await send(
    [
      refundGiftInstruction({
        payer: relayer.publicKey,
        authority: sender.publicKey,
        sender: sender.publicKey,
        rentPayer: relayer.publicKey,
        mint: stockMint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        giftId: refundedIds[0],
      }),
      refundGiftInstruction({
        payer: relayer.publicKey,
        authority: sender.publicKey,
        sender: sender.publicKey,
        rentPayer: relayer.publicKey,
        mint: cashMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        giftId: refundedIds[1],
      }),
    ],
    [relayer, sender],
  )
  for (const [index, giftId] of refundedIds.entries()) {
    const [mint, tokenProgram] =
      index === 0 ? [stockMint, TOKEN_2022_PROGRAM_ID] : [cashMint, TOKEN_PROGRAM_ID]
    const back = await tokenAmountOf(mint, tokenProgram, sender.publicKey)
    assert.equal(
      back,
      senderBefore[index] + (index === 0 ? amounts.stock : amounts.cash),
      'the refunded amount should be back with the sender',
    )
    assert.equal(
      await connection.getAccountInfo(vaultOf(giftId, mint, tokenProgram), 'confirmed'),
      null,
      'the vault should be closed once refunded',
    )
  }

  // Rent returns to the relayer on claim and refund; the only thing that stays is the two
  // accounts the recipient needed to hold the gift, which is exactly what the gift fee charges for
  const openedForRecipient = (
    await Promise.all(
      [stockMint, cashMint].map((mint, index) =>
        balance(
          getAssociatedTokenAddressSync(
            mint,
            recipient.publicKey,
            true,
            index === 0 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
          ),
        ),
      ),
    )
  ).reduce((sum, lamports) => sum + lamports, 0)
  const spent = relayerBefore - (await balance(relayer.publicKey)) - openedForRecipient
  console.log(
    'relayer out of pocket:',
    spent,
    'lamports of fees, plus',
    openedForRecipient,
    'lamports of accounts opened for the recipient',
  )
  assert.ok(spent < 200_000, `the relayer did not get its rent back: ${spent} lamports`)
  console.log('all gift checks passed')
}

const validator = await startValidator()
try {
  await main()
} finally {
  validator.kill()
}
