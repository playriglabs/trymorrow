import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM, USDC } from '@morrow/sdk'
import { PublicKey } from '@solana/web3.js'
import { getStocks } from '@/lib/server/catalog'
import { getCostBasis } from '@/lib/server/pnl'
import { getPriceData } from '@/lib/server/prices'
import { connection } from '@/lib/server/solana'
import type { Holding, Portfolio } from '@/lib/types'

export async function getPortfolio(walletAddress: string): Promise<Portfolio> {
  const owner = new PublicKey(walletAddress)
  const [classic, extended, stocks] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM }),
    getStocks(),
  ])

  const cashMint = USDC.mint.toBase58()
  const stockByMint = new Map(stocks.map((stock) => [stock.mint.toBase58(), stock]))

  const balances = new Map<string, { raw: bigint; amount: number }>()
  for (const { account } of [...classic.value, ...extended.value]) {
    const info = account.data.parsed.info
    if (info.mint !== cashMint && !stockByMint.has(info.mint)) continue
    const current = balances.get(info.mint) ?? { raw: 0n, amount: 0 }
    balances.set(info.mint, {
      raw: current.raw + BigInt(info.tokenAmount.amount),
      // uiAmountString already applies Token-2022 scaled amounts (xStocks dividends/splits)
      amount: current.amount + Number(info.tokenAmount.uiAmountString),
    })
  }

  // Live prices only for what this person holds; the catalog price is a fallback
  const ownedStockMints = [...balances.keys()].filter(
    (mint) => mint !== cashMint && (balances.get(mint)?.raw ?? 0n) > 0n,
  )
  const prices = ownedStockMints.length > 0 ? await getPriceData(ownedStockMints) : {}

  const cash = balances.get(cashMint)
  const holdings: Holding[] = [
    {
      mint: cashMint,
      symbol: USDC.symbol,
      name: USDC.name,
      ticker: USDC.ticker,
      decimals: USDC.decimals,
      isCash: true,
      iconUrl: null,
      raw: (cash?.raw ?? 0n).toString(),
      amount: cash?.amount ?? 0,
      priceUsd: 1,
      valueUsd: cash?.amount ?? 0,
      costUsd: null,
    },
    ...ownedStockMints.flatMap((mint) => {
      const stock = stockByMint.get(mint)
      const balance = balances.get(mint)
      if (!stock || !balance) return []
      const priceUsd = prices[mint]?.usdPrice ?? stock.priceUsd
      return [
        {
          mint,
          symbol: stock.symbol,
          name: stock.name,
          ticker: stock.ticker,
          decimals: stock.decimals,
          isCash: false,
          iconUrl: stock.iconUrl,
          raw: balance.raw.toString(),
          amount: balance.amount,
          priceUsd,
          valueUsd: priceUsd == null ? null : balance.amount * priceUsd,
          costUsd: null,
        },
      ]
    }),
  ]

  const sum = (items: Holding[]) => items.reduce((total, item) => total + (item.valueUsd ?? 0), 0)
  const stockHoldings = holdings.filter((item) => !item.isCash && item.amount > 0)
  if (stockHoldings.length > 0) {
    const basis = await getCostBasis(
      walletAddress,
      new Map(
        stockHoldings.map((item) => [item.mint, { decimals: item.decimals, amount: item.amount }]),
      ),
    )
    for (const item of stockHoldings) item.costUsd = basis.get(item.mint) ?? null
  }

  // Convert each percentage move back to yesterday's value, then sum the dollar moves.
  // This gives a correctly weighted portfolio P&L rather than averaging percentages.
  const dailyMoves = stockHoldings.flatMap((item) => {
    const changePct = prices[item.mint]?.change24hPct ?? stockByMint.get(item.mint)?.change24hPct
    if (item.valueUsd == null || changePct == null || changePct <= -100) return []
    const previousValueUsd = item.valueUsd / (1 + changePct / 100)
    return [{ pnlUsd: item.valueUsd - previousValueUsd, previousValueUsd }]
  })
  const stocksPnl24hUsd =
    dailyMoves.length > 0 ? dailyMoves.reduce((total, move) => total + move.pnlUsd, 0) : null
  const previousStocksUsd = dailyMoves.reduce((total, move) => total + move.previousValueUsd, 0)

  return {
    walletAddress,
    cashUsd: sum(holdings.filter((item) => item.isCash)),
    stocksUsd: sum(holdings.filter((item) => !item.isCash)),
    stocksPnl24hUsd,
    stocksPnl24hPct:
      stocksPnl24hUsd != null && previousStocksUsd > 0
        ? (stocksPnl24hUsd / previousStocksUsd) * 100
        : null,
    holdings,
  }
}
