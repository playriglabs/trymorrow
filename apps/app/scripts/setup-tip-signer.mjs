// One-time Privy setup for tips sent automatically from X.
//
// Creates the key the server signs tips with, registers it with Privy as a key quorum, and creates
// the policy that limits what it can sign: the Morrow program, compute budget, and a cash fee into
// the treasury — nothing else. Writes PRIVY_AUTHORIZATION_KEY (never printed),
// PUBLIC_PRIVY_TIP_SIGNER_ID and PUBLIC_PRIVY_TIP_POLICY_ID into .env.
//
// Run from apps/app: node --env-file=.env scripts/setup-tip-signer.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { generateP256KeyPair, PrivyClient } from '@privy-io/node'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { Keypair, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'

const MORROW_PROGRAM = 'AjwKavx3r4NJ9tgmjxv24mCpFLp2QMnKzcRC5J7vaupa'
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111'
const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')

const env = process.env
if (env.PRIVY_AUTHORIZATION_KEY) {
  console.log('Already set up: PRIVY_AUTHORIZATION_KEY is in .env. Nothing changed.')
  process.exit(0)
}

const privy = new PrivyClient({ appId: env.PUBLIC_PRIVY_APP_ID, appSecret: env.PRIVY_APP_SECRET })
const treasury = env.TREASURY_WALLET
  ? new PublicKey(env.TREASURY_WALLET)
  : Keypair.fromSecretKey(bs58.decode(env.RELAYER_SECRET_KEY)).publicKey
const treasuryCash = getAssociatedTokenAddressSync(USDC, treasury, true).toBase58()
console.log('Treasury cash account:', treasuryCash)

const keys = await generateP256KeyPair()
const quorum = await privy
  .keyQuorums()
  .create({ public_keys: [keys.publicKey], display_name: 'Morrow tips' })
console.log('Key quorum:', quorum.id)

const policy = await privy.policies().create({
  chain_type: 'solana',
  version: '1.0',
  name: 'Morrow tips from X',
  rules: [
    {
      name: 'Morrow gifts and compute budget',
      method: 'signTransaction',
      action: 'ALLOW',
      conditions: [
        {
          field_source: 'solana_program_instruction',
          field: 'programId',
          operator: 'in',
          value: [COMPUTE_BUDGET, MORROW_PROGRAM],
        },
      ],
    },
    {
      name: 'Fee in cash to the Morrow treasury',
      method: 'signTransaction',
      action: 'ALLOW',
      conditions: [
        {
          field_source: 'solana_token_program_instruction',
          field: 'instructionName',
          operator: 'eq',
          value: 'TransferChecked',
        },
        {
          field_source: 'solana_token_program_instruction',
          field: 'TransferChecked.destination',
          operator: 'eq',
          value: treasuryCash,
        },
      ],
    },
    // Cash is a classic-token mint, and `feeTransferInstruction` pays it with a plain Transfer
    // (TransferChecked would cost 33 bytes some transactions don't have)
    {
      name: 'Cash fee (classic Transfer) to the Morrow treasury',
      method: 'signTransaction',
      action: 'ALLOW',
      conditions: [
        {
          field_source: 'solana_token_program_instruction',
          field: 'instructionName',
          operator: 'eq',
          value: 'Transfer',
        },
        {
          field_source: 'solana_token_program_instruction',
          field: 'Transfer.destination',
          operator: 'eq',
          value: treasuryCash,
        },
      ],
    },
  ],
})
console.log('Policy:', policy.id)

const current = readFileSync('.env', 'utf8').replace(/\n?$/, '\n')
writeFileSync(
  '.env',
  `${current}PRIVY_AUTHORIZATION_KEY=${keys.privateKey}\nPUBLIC_PRIVY_TIP_SIGNER_ID=${quorum.id}\nPUBLIC_PRIVY_TIP_POLICY_ID=${policy.id}\n`,
)
console.log('.env updated. The private key was written there and not shown.')
