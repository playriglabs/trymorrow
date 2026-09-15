import { PublicKey } from '@solana/web3.js'

export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const TOKEN_2022_PROGRAM = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')

export type Asset = {
  symbol: string
  /** Name shown in the app; token symbols never reach the UI */
  name: string
  ticker: string
  mint: PublicKey
  decimals: number
  tokenProgram: PublicKey
}

export const USDC: Asset = {
  symbol: 'USDC',
  name: 'Cash',
  ticker: 'USD',
  mint: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  decimals: 6,
  tokenProgram: TOKEN_PROGRAM,
}

// Verified xStocks mints (Jupiter token search, isVerified = true), all Token-2022 with 8 decimals
const xstock = (symbol: string, name: string, ticker: string, mint: string): Asset => ({
  symbol,
  name,
  ticker,
  mint: new PublicKey(mint),
  decimals: 8,
  tokenProgram: TOKEN_2022_PROGRAM,
})

export const STOCKS: Asset[] = [
  xstock('NVDAx', 'Nvidia', 'NVDA', 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh'),
  xstock('AAPLx', 'Apple', 'AAPL', 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp'),
  xstock('SPYx', 'S&P 500', 'SPY', 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W'),
  xstock('TSLAx', 'Tesla', 'TSLA', 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB'),
  xstock('MSFTx', 'Microsoft', 'MSFT', 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX'),
  xstock('AMZNx', 'Amazon', 'AMZN', 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg'),
]

export function findAsset(mint: string): Asset | undefined {
  return [USDC, ...STOCKS].find((asset) => asset.mint.toBase58() === mint)
}

export function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole = '0', fraction = ''] = amount.trim().split('.')
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) throw new Error(`Invalid amount: ${amount}`)
  return BigInt(whole + fraction.padEnd(decimals, '0').slice(0, decimals))
}

export function fromBaseUnits(raw: bigint, decimals: number): string {
  const text = raw.toString().padStart(decimals + 1, '0')
  const whole = text.slice(0, -decimals)
  const fraction = text.slice(-decimals).replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}
