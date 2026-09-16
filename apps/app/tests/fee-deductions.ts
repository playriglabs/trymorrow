import { strict as assert } from 'node:assert'
import { cashGiftFeeDeductions } from '../src/lib/fee-deductions.ts'

assert.deepEqual(
  cashGiftFeeDeductions([250_000n], 1_000_000n, 25_000_000n),
  [0n],
  'cash left after the gift pays the fee first',
)

assert.deepEqual(
  cashGiftFeeDeductions([250_000n], 0n, 25_000_000n),
  [250_000n],
  'sending the whole cash balance takes the fee out of the gift',
)

assert.deepEqual(
  cashGiftFeeDeductions([200_000n, 200_000n], 100_000n, 4_000_000n),
  [200_000n, 100_000n],
  'partial spare cash covers part of a multi-recipient fee',
)

assert.deepEqual(
  cashGiftFeeDeductions([0n, 0n], 0n, 4_000_000n),
  [0n, 0n],
  'a free cash gift stays whole',
)

assert.equal(
  cashGiftFeeDeductions([700_000n, 700_000n], 400_000n, 500_000n),
  null,
  'the plan refuses to empty a recipient cash gift',
)

console.log('cash gift fee deductions: ok')
