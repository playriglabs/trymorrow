/**
 * Runs the fund instructions against a throwaway validator: several people add to one fund, nobody
 * can take anything out early, the person it's for gets everything at unlock, and every lamport of
 * rent goes back to the account that paid it. Run with `pnpm test:program` after `pnpm build:program`.
 */

import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createAssociatedTokenAccount,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
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
  closeFundInstruction,
  contributeInstruction,
  createFundInstruction,
  decodeFundAccount,
  findFundAddress,
  MORROW_PROGRAM_ID,
  withdrawInstruction,
} from '../src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const PROGRAM_SO = resolve(here, '../../../programs/target/deploy/morrow.so')
const RPC = 'http://127.0.0.1:8899'
const DECIMALS = 8
/** Long enough that every step before the early-withdrawal check runs while the fund is still locked */
const UNLOCK_SECONDS = 45

/** Must match WITHDRAWALS_PER_TRANSACTION in apps/app/src/lib/funds.ts */
const WITHDRAWALS_PER_TRANSACTION = 4

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

async function expectFailure(
  instructions: TransactionInstruction[],
  signers: Signer[],
  reason: string,
) {
  await assert.rejects(
    () => send(instructions, signers),
    (error: Error) => {
      assert.ok(error.message.length > 0, `${reason} failed without a message`)
      return true
    },
    reason,
  )
}

const balance = (key: PublicKey) => connection.getBalance(key, 'confirmed')

async function main() {
  const relayer = Keypair.generate()
  const creator = Keypair.generate()
  const alice = Keypair.generate()
  const bob = Keypair.generate()
  const beneficiary = Keypair.generate()
  for (const keypair of [relayer, creator, alice, bob, beneficiary]) await fund(keypair)

  // Two Token-2022 stocks with the same decimals xStocks use
  const mints = await Promise.all(
    [0, 1].map(() =>
      createMint(
        connection,
        relayer,
        relayer.publicKey,
        null,
        DECIMALS,
        Keypair.generate(),
        undefined,
        TOKEN_2022_PROGRAM_ID,
      ),
    ),
  )
  const shares = 5_000_000_000n // 50 shares
  for (const mint of mints) {
    for (const holder of [alice, bob]) {
      await createAssociatedTokenAccount(
        connection,
        relayer,
        mint,
        holder.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      )
      await mintTo(
        connection,
        relayer,
        mint,
        getAssociatedTokenAddressSync(mint, holder.publicKey, true, TOKEN_2022_PROGRAM_ID),
        relayer,
        shares,
        [],
        undefined,
        TOKEN_2022_PROGRAM_ID,
      )
    }
  }

  const fundId = crypto.randomUUID()
  const address = findFundAddress(creator.publicKey, fundId)
  const unlockAt = new Date(Date.now() + UNLOCK_SECONDS * 1_000)

  console.log('create_fund rejects a date in the past')
  await expectFailure(
    [
      createFundInstruction({
        payer: relayer.publicKey,
        creator: creator.publicKey,
        beneficiary: beneficiary.publicKey,
        fundId,
        unlockAt: new Date(Date.now() - 60_000),
      }),
    ],
    [relayer, creator],
    'a fund unlocking in the past',
  )

  console.log('create_fund rejects a lock longer than 25 years')
  await expectFailure(
    [
      createFundInstruction({
        payer: relayer.publicKey,
        creator: creator.publicKey,
        beneficiary: beneficiary.publicKey,
        fundId,
        unlockAt: new Date(Date.now() + 26 * 365 * 24 * 60 * 60 * 1_000),
      }),
    ],
    [relayer, creator],
    'a fund locked for 26 years',
  )

  const relayerBefore = await balance(relayer.publicKey)
  await send(
    [
      createFundInstruction({
        payer: relayer.publicKey,
        creator: creator.publicKey,
        beneficiary: beneficiary.publicKey,
        fundId,
        unlockAt,
      }),
    ],
    [relayer, creator],
  )
  console.log('fund opened at', address.toBase58())

  const contribute = (
    contributor: Keypair,
    mint: PublicKey,
    amount: bigint,
  ): TransactionInstruction =>
    contributeInstruction({
      payer: relayer.publicKey,
      contributor: contributor.publicKey,
      creator: creator.publicKey,
      mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      fundId,
      amount,
    })

  const [first, second] = mints as [PublicKey, PublicKey]
  await send([contribute(alice, first, 1_000_000_000n)], [relayer, alice])
  await send([contribute(bob, first, 2_000_000_000n)], [relayer, bob])
  await send([contribute(bob, second, 500_000_000n)], [relayer, bob])

  const readFund = async () => {
    const account = await connection.getAccountInfo(address, 'confirmed')
    assert.ok(account, 'the fund account is gone')
    return decodeFundAccount(new Uint8Array(account.data))
  }
  let state = await readFund()
  assert.equal(state.vaults, 2, 'a vault per stock, opened once however many people add to it')
  assert.equal(state.beneficiary.toBase58(), beneficiary.publicKey.toBase58())

  const vaultOf = (mint: PublicKey) =>
    getAssociatedTokenAddressSync(mint, address, true, TOKEN_2022_PROGRAM_ID)
  assert.equal(
    (await getAccount(connection, vaultOf(first), 'confirmed', TOKEN_2022_PROGRAM_ID)).amount,
    3_000_000_000n,
  )

  console.log('nobody can take it out early')
  const withdrawals = mints.map((mint) =>
    withdrawInstruction({
      payer: relayer.publicKey,
      beneficiary: beneficiary.publicKey,
      creator: creator.publicKey,
      rentPayer: relayer.publicKey,
      mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      fundId,
    }),
  )
  await expectFailure(withdrawals, [relayer, beneficiary], 'withdrawing before the unlock date')
  await expectFailure(
    [
      withdrawInstruction({
        payer: relayer.publicKey,
        beneficiary: creator.publicKey,
        creator: creator.publicKey,
        rentPayer: relayer.publicKey,
        mint: first,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        fundId,
      }),
    ],
    [relayer, creator],
    'the creator withdrawing from their own fund',
  )

  const waitMs = unlockAt.getTime() - Date.now() + 2_000
  if (waitMs > 0) {
    console.log(`waiting ${Math.ceil(waitMs / 1_000)}s for the unlock date`)
    await wait(waitMs)
  }

  const sizeOf = async (instructions: TransactionInstruction[]) =>
    (await compile(instructions, relayer.publicKey)).serialize().length + 64 // one more signature
  console.log(
    'transaction bytes: contribute x3 =',
    await sizeOf([
      contribute(alice, first, 1n),
      contribute(alice, second, 1n),
      contribute(alice, first, 2n),
    ]),
  )
  console.log('transaction bytes: withdraw x2 =', await sizeOf(withdrawals))

  // A fund can hold more stocks than its mix, so check the batch size the server uses really fits
  const batch = Array.from({ length: WITHDRAWALS_PER_TRANSACTION }, () =>
    withdrawInstruction({
      payer: relayer.publicKey,
      beneficiary: beneficiary.publicKey,
      creator: creator.publicKey,
      rentPayer: relayer.publicKey,
      mint: Keypair.generate().publicKey,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      fundId,
    }),
  )
  const batchBytes = await sizeOf(batch)
  console.log(`transaction bytes: withdraw x${WITHDRAWALS_PER_TRANSACTION} =`, batchBytes)
  assert.ok(
    batchBytes <= 1232,
    `a full withdrawal batch is ${batchBytes} bytes, over Solana's 1,232-byte limit`,
  )

  await send(withdrawals, [relayer, beneficiary])
  for (const mint of mints) {
    const account = await getAccount(
      connection,
      getAssociatedTokenAddressSync(mint, beneficiary.publicKey, true, TOKEN_2022_PROGRAM_ID),
      'confirmed',
      TOKEN_2022_PROGRAM_ID,
    )
    assert.equal(account.amount, mint.equals(first) ? 3_000_000_000n : 500_000_000n)
    assert.equal(
      await connection.getAccountInfo(vaultOf(mint), 'confirmed'),
      null,
      'the vault should be closed once it is empty',
    )
  }
  state = await readFund()
  assert.equal(state.vaults, 0, 'every vault is closed after the withdrawal')

  await send(
    [closeFundInstruction({ rentPayer: relayer.publicKey, creator: creator.publicKey, fundId })],
    [relayer],
  )
  assert.equal(await connection.getAccountInfo(address, 'confirmed'), null, 'the fund is closed')

  // The fund's and the vaults' rent all comes back. The only thing that doesn't is the account
  // each stock needed on the beneficiary's side, which is exactly what the contribution fee charges
  // for, so what's left over should be network fees alone.
  const openedForBeneficiary = (
    await Promise.all(
      mints.map((mint) =>
        balance(
          getAssociatedTokenAddressSync(mint, beneficiary.publicKey, true, TOKEN_2022_PROGRAM_ID),
        ),
      ),
    )
  ).reduce((sum, lamports) => sum + lamports, 0)
  const spent = relayerBefore - (await balance(relayer.publicKey)) - openedForBeneficiary
  console.log(
    'relayer out of pocket:',
    spent,
    'lamports of fees, plus',
    openedForBeneficiary,
    'lamports of accounts opened for the beneficiary',
  )
  assert.ok(spent < 200_000, `the relayer did not get its rent back: ${spent} lamports`)
  console.log('all fund checks passed')
}

const validator = await startValidator()
try {
  await main()
} finally {
  validator.kill()
}
