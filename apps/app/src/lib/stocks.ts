/**
 * Below this a stock's pool is thin enough that the price can sit away from the real market
 * for days and a fill costs more than the quote suggests. The list says so, and a blocked
 * trade uses it to decide whether waiting is worth suggesting.
 */
export const LOW_LIQUIDITY_USD = 10_000
