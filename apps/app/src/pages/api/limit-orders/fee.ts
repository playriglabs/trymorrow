import { USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { findStock } from '@/lib/server/catalog'
import { limitOrderFee } from '@/lib/server/fees'
import { badRequest, json, route } from '@/lib/server/http'
import { requireUser, requireWallet } from '@/lib/server/users'

/** What placing an order of this stock would cost this person, before they commit to one */
export const GET = route(async ({ request, url }) => {
  const user = await requireUser(request)
  const wallet = new PublicKey(requireWallet(user))
  const side = url.searchParams.get('side')
  const stock = await findStock(url.searchParams.get('mint') ?? '')
  if (!stock || (side !== 'buy' && side !== 'sell')) throw badRequest('Pick a stock.')
  const [input, output] = side === 'buy' ? [USDC, stock] : [stock, USDC]
  const fee = await limitOrderFee(wallet, input, output)
  return json({ feeUsd: fee.usd })
})
