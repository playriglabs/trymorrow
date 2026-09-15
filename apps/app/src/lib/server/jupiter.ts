import { HttpError } from '@/lib/server/http'

/**
 * Keyless Jupiter Ultra endpoints. With a `taker`, Ultra returns a gasless transaction: a market
 * maker or Jupiter pays network fees and rent, and the cost comes out of the swap.
 * Jupiter now points new integrations at Swap V2 (API key required); move there after the hackathon.
 */
const ULTRA_API = 'https://lite-api.jup.ag/ultra/v1'

export type UltraOrder = {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  slippageBps: number
  /** Total fee taken from the swap, including gasless costs and our integrator fee */
  feeBps: number
  feeMint?: string
  gasless: boolean
  router: string
  /** Unsigned transaction for the taker; null without a taker or when it can't be filled */
  transaction: string | null
  requestId: string
  errorMessage?: string
}

export type UltraExecution = {
  status: 'Success' | 'Failed'
  signature?: string
  code: number
  error?: string
  inputAmountResult?: string
  outputAmountResult?: string
}

export async function getOrder({
  inputMint,
  outputMint,
  amount,
  taker,
  referral,
}: {
  inputMint: string
  outputMint: string
  amount: bigint
  taker?: string
  /** Our integrator fee; Jupiter replaces its own Ultra fee with it and keeps 20% */
  referral?: { account: string; feeBps: number }
}): Promise<UltraOrder> {
  const params = new URLSearchParams({ inputMint, outputMint, amount: amount.toString() })
  if (taker) params.set('taker', taker)
  if (referral) {
    params.set('referralAccount', referral.account)
    params.set('referralFee', referral.feeBps.toString())
  }

  const response = await fetch(`${ULTRA_API}/order?${params}`)
  const body = (await response.json().catch(() => null)) as UltraOrder | null
  if (!response.ok || !body?.outAmount) {
    throw new HttpError(
      422,
      'no_route',
      'We couldn’t get a price for that right now. Try another amount.',
    )
  }
  return body
}

/** Jupiter lands the signed transaction and reports the real amounts */
export async function executeOrder(
  signedTransaction: string,
  requestId: string,
): Promise<UltraExecution> {
  const response = await fetch(`${ULTRA_API}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ signedTransaction, requestId }),
  })
  const body = (await response.json().catch(() => null)) as UltraExecution | null
  if (!body) {
    throw new HttpError(
      502,
      'trade_failed',
      'That trade didn’t go through and nothing moved. Try again.',
    )
  }
  return body
}
