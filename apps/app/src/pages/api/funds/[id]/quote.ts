import { PublicKey } from '@solana/web3.js'
import { z } from 'astro/zod'
import { MAX_CONTRIBUTION_STOCKS } from '@/lib/funds'
import { findStock } from '@/lib/server/catalog'
import { contributionFee } from '@/lib/server/fees'
import { allocationMints, fundAddress, getFund } from '@/lib/server/funds'
import { badRequest, json, readBody, route } from '@/lib/server/http'
import { requireUser } from '@/lib/server/users'
import type { FundFeeQuote } from '@/lib/types'

const schema = z.object({
  /** The stocks going in; the fund's whole mix when left out */
  mints: z.array(z.string().min(32).max(44)).max(MAX_CONTRIBUTION_STOCKS).optional(),
})

/** What adding to this fund costs right now, before anything is bought or signed */
export const POST = route(async ({ params, request }) => {
  const [fund, ,] = await Promise.all([getFund(params.id), requireUser(request)])
  const body = await readBody(request, schema)

  const mints = body.mints?.length ? body.mints : allocationMints(fund)
  const assets = await Promise.all(
    mints.map(async (mint) => {
      const asset = await findStock(mint)
      if (!asset) throw badRequest('We can’t add that stock right now.')
      return asset
    }),
  )

  const fee = await contributionFee(
    fundAddress(fund),
    new PublicKey(fund.beneficiary_wallet),
    assets,
  )
  const quote: FundFeeQuote = { feeUsd: fee.usd, newVaults: fee.newVaults.length }
  return json(quote)
})
