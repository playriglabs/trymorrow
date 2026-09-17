/**
 * PreStocks (tokenized pre-IPO shares) through every flow that moves shares on our program, on a
 * throwaway validator with a mint built like theirs: Token-2022, 9 decimals, a 0.5% transfer fee,
 * a permanent delegate, an unset transfer hook and accounts that start initialized. The validator's
 * Token-2022 predates the pausable and scaled UI amount extensions, so those two are left out here;
 * `create_gift` was simulated against the real mainnet mints, which carry both. The transfer fee is the part xStocks never exercised: the issuer keeps a
 * cut of every move, so a vault holds less than the sender put in. Claim, refund and withdraw all
 * pay out the vault's real balance and hand over exactly what's left, but Token-2022 won't close a
 * vault still holding the withheld fee, so each close needs a harvest in front of it.
 * Also checks the biggest PreStocks gift (three stocks plus the cash fee) fits 1,232 bytes.
 * Run with `pnpm test:prestocks` after `pnpm build:program`.
 */

import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AccountState,
  createAssociatedTokenAccount,
  createHarvestWithheldTokensToMintInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializeMint2Instruction,
  createInitializePermanentDelegateInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeTransferHookInstruction,
  createTransferInstruction,
  ExtensionType,
  getAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  type Signer,
  SystemProgram,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  claimGiftInstruction,
  contributeInstruction,
  createFundInstruction,
  createGiftInstruction,
  findFundAddress,
  findGiftAddress,
  MORROW_PROGRAM_ID,
  refundGiftInstruction,
  withdrawInstruction,
} from '../src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const PROGRAM_SO = resolve(here, '../../../programs/target/deploy/morrow.so')
const RPC = 'http://127.0.0.1:8899'
const PRESTOCK_DECIMALS = 9
/** What PreStocks charges on mainnet since epoch 1032 */
const TRANSFER_FEE_BPS = 50
const UNLOCK_SECONDS = 20

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

async function send(instructions: TransactionInstruction[], signers: Signer[]) {
  const [payer] = signers as [Signer, ...Signer[]]
  const transaction = await compile(instructions, payer.publicKey)
  transaction.sign(signers)
  const raw = transaction.serialize()
  const signature = await connection.sendRawTransaction(raw, { maxRetries: 0 })

  for (let attempt = 0; attempt < 90; attempt++) {
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

/** A mint with the same extensions PreStocks mints carry on mainnet */
async function createPreStockMint(authority: Keypair): Promise<PublicKey> {
  const mint = Keypair.generate()
  const extensions = [
    ExtensionType.TransferFeeConfig,
    ExtensionType.PermanentDelegate,
    ExtensionType.TransferHook,
    ExtensionType.DefaultAccountState,
  ]
  const space = getMintLen(extensions)
  const program = TOKEN_2022_PROGRAM_ID
  await send(
    [
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mint.publicKey,
        space,
        lamports: await connection.getMinimumBalanceForRentExemption(space),
        programId: program,
      }),
      createInitializeTransferFeeConfigInstruction(
        mint.publicKey,
        authority.publicKey,
        authority.publicKey,
        TRANSFER_FEE_BPS,
        2n ** 64n - 1n,
        program,
      ),
      createInitializePermanentDelegateInstruction(mint.publicKey, authority.publicKey, program),
      createInitializeTransferHookInstruction(
        mint.publicKey,
        authority.publicKey,
        PublicKey.default,
        program,
      ),
      createInitializeDefaultAccountStateInstruction(
        mint.publicKey,
        AccountState.Initialized,
        program,
      ),
      createInitializeMint2Instruction(
        mint.publicKey,
        PRESTOCK_DECIMALS,
        authority.publicKey,
        authority.publicKey,
        program,
      ),
    ],
    [authority, mint],
  )
  return mint.publicKey
}

/** Token-2022's fee: basis points of the amount sent, rounded up, taken from what arrives */
const afterFee = (amount: bigint) => amount - (amount * BigInt(TRANSFER_FEE_BPS) + 9_999n) / 10_000n

const shareAccount = (mint: PublicKey, owner: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID)

/**
 * The fee on the way in stays withheld inside the vault, and Token-2022 refuses to close an
 * account holding withheld fees. Harvesting sends them to the mint and needs no signer, so it goes
 * in front of anything that closes a vault.
 */
const harvest = (mint: PublicKey, vault: PublicKey) =>
  createHarvestWithheldTokensToMintInstruction(mint, [vault], TOKEN_2022_PROGRAM_ID)

const sharesOf = async (mint: PublicKey, owner: PublicKey) =>
  (await getAccount(connection, shareAccount(mint, owner), 'confirmed', TOKEN_2022_PROGRAM_ID))
    .amount

async function main() {
  const relayer = Keypair.generate()
  const sender = Keypair.generate()
  const recipient = Keypair.generate()
  const beneficiary = Keypair.generate()
  for (const keypair of [relayer, sender, recipient, beneficiary]) await fund(keypair)

  const mints = [
    await createPreStockMint(relayer),
    await createPreStockMint(relayer),
    await createPreStockMint(relayer),
  ]
  const [anthropic] = mints as [PublicKey, PublicKey, PublicKey]
  const minted = 10_000_000_000n // 10 shares
  for (const mint of mints) {
    await createAssociatedTokenAccount(
      connection,
      relayer,
      mint,
      sender.publicKey,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    )
    await mintTo(
      connection,
      relayer,
      mint,
      shareAccount(mint, sender.publicKey),
      relayer,
      minted,
      [],
      undefined,
      TOKEN_2022_PROGRAM_ID,
    )
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000)
  const gift = (mint: PublicKey, giftId: string, amount: bigint) =>
    createGiftInstruction({
      payer: relayer.publicKey,
      sender: sender.publicKey,
      recipient: recipient.publicKey,
      mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      giftId,
      amount,
      expiresAt,
    })
  const sizeOf = async (instructions: TransactionInstruction[]) =>
    (await compile(instructions, relayer.publicKey)).serialize().length + 64

  // The fee transfer only needs the right shape for a byte count, not a real cash mint
  const cashMint = Keypair.generate().publicKey
  const worstCase = await sizeOf([
    ...mints.map((mint) => gift(mint, crypto.randomUUID(), 1n)),
    createTransferInstruction(
      getAssociatedTokenAddressSync(cashMint, sender.publicKey, true, TOKEN_PROGRAM_ID),
      getAssociatedTokenAddressSync(cashMint, relayer.publicKey, true, TOKEN_PROGRAM_ID),
      sender.publicKey,
      1n,
      [],
      TOKEN_PROGRAM_ID,
    ),
  ])
  console.log('transaction bytes: 3 PreStocks + cash fee =', worstCase)
  assert.ok(worstCase <= 1232, `the biggest PreStocks gift is ${worstCase} bytes, over the limit`)

  console.log('a PreStocks gift is locked, then claimed')
  const gifted = 2_000_000_000n
  const claimedId = crypto.randomUUID()
  await send([gift(anthropic, claimedId, gifted)], [relayer, sender])
  assert.equal(await sharesOf(anthropic, sender.publicKey), minted - gifted)
  const claim = claimGiftInstruction({
    payer: relayer.publicKey,
    recipient: recipient.publicKey,
    sender: sender.publicKey,
    rentPayer: relayer.publicKey,
    mint: anthropic,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    giftId: claimedId,
  })
  const giftVault = (giftId: string) =>
    shareAccount(anthropic, findGiftAddress(sender.publicKey, giftId))
  // 0x23 is Token-2022's AccountHasWithheldTransferFees, raised when the vault is closed
  await assert.rejects(send([claim], [relayer, recipient]), /0x23/)
  await send([harvest(anthropic, giftVault(claimedId)), claim], [relayer, recipient])
  const received = await sharesOf(anthropic, recipient.publicKey)
  const expected = afterFee(afterFee(gifted))
  console.log(`sent ${gifted}, recipient got ${received} (${expected} expected after two moves)`)
  assert.equal(received, expected, 'the recipient gets the gift less the fee on both moves')

  console.log('a PreStocks gift is taken back by the sender')
  const refundedId = crypto.randomUUID()
  const beforeRefund = await sharesOf(anthropic, sender.publicKey)
  await send([gift(anthropic, refundedId, gifted)], [relayer, sender])
  await send(
    [
      harvest(anthropic, giftVault(refundedId)),
      refundGiftInstruction({
        payer: relayer.publicKey,
        authority: sender.publicKey,
        sender: sender.publicKey,
        rentPayer: relayer.publicKey,
        mint: anthropic,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        giftId: refundedId,
      }),
    ],
    [relayer, sender],
  )
  assert.equal(
    await sharesOf(anthropic, sender.publicKey),
    beforeRefund - gifted + afterFee(afterFee(gifted)),
    'the sender gets the gift back less the fee on both moves',
  )

  console.log('PreStocks go into a fund and come out at unlock')
  const fundId = crypto.randomUUID()
  const unlockAt = new Date(Date.now() + UNLOCK_SECONDS * 1_000)
  await send(
    [
      createFundInstruction({
        payer: relayer.publicKey,
        creator: sender.publicKey,
        beneficiary: beneficiary.publicKey,
        fundId,
        unlockAt,
      }),
    ],
    [relayer, sender],
  )
  const added = 1_000_000_000n
  await send(
    mints.map((mint) =>
      contributeInstruction({
        payer: relayer.publicKey,
        contributor: sender.publicKey,
        creator: sender.publicKey,
        mint,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        fundId,
        amount: added,
      }),
    ),
    [relayer, sender],
  )
  const fundAddress = findFundAddress(sender.publicKey, fundId)
  assert.equal(await sharesOf(anthropic, fundAddress), afterFee(added))

  const waitMs = unlockAt.getTime() - Date.now() + 2_000
  if (waitMs > 0) {
    console.log(`waiting ${Math.ceil(waitMs / 1_000)}s for the unlock date`)
    await wait(waitMs)
  }
  const withdrawals = mints.flatMap((mint) => [
    harvest(mint, shareAccount(mint, fundAddress)),
    withdrawInstruction({
      payer: relayer.publicKey,
      beneficiary: beneficiary.publicKey,
      creator: sender.publicKey,
      rentPayer: relayer.publicKey,
      mint,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      fundId,
    }),
  ])
  console.log('transaction bytes: withdraw 3 PreStocks with harvests =', await sizeOf(withdrawals))
  await send(withdrawals, [relayer, beneficiary])
  for (const mint of mints) {
    assert.equal(await sharesOf(mint, beneficiary.publicKey), afterFee(afterFee(added)))
    assert.equal(
      await connection.getAccountInfo(shareAccount(mint, fundAddress), 'confirmed'),
      null,
      'the vault should be closed once withdrawn',
    )
  }
  console.log('all PreStocks checks passed')
}

const validator = await startValidator()
try {
  await main()
} finally {
  validator.kill()
}
