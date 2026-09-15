import { PublicKey } from '@solana/web3.js'
import { badRequest, json, route } from '@/lib/server/http'
import { quoteTrade } from '@/lib/server/trades'
import { requireUser, requireWallet } from '@/lib/server/users'

export const GET = route(async ({ request, url }) => {
  const user = await requireUser(request)
  const side = url.searchParams.get('side')
  const mint = url.searchParams.get('mint') ?? ''
  const amount = url.searchParams.get('amount') ?? ''
  if ((side !== 'buy' && side !== 'sell') || !/^[1-9]\d{0,19}$/.test(amount)) {
    throw badRequest('Enter an amount.')
  }
  // Quoted for this wallet so the gasless fee shown matches what the trade will cost, falling
  // back to a wallet-free price so an empty account still sees what the trade would look like
  const { view } = await quoteTrade(
    side,
    mint,
    BigInt(amount),
    new PublicKey(requireWallet(user)),
    {
      allowPreview: true,
    },
  )
  return json(view)
})
