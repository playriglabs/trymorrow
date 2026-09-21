/**
 * Below this a stock's pool is thin enough that the price can sit away from the real market
 * for days and a fill costs more than the quote suggests. The list says so, and a blocked
 * trade uses it to decide whether waiting is worth suggesting.
 */
export const LOW_LIQUIDITY_USD = 10_000

/**
 * A pool this thin with this few people trading in a day isn't a market: its last print can sit
 * anywhere (Uber's xStock showed $199.93 against $70.69 on the exchange, off two trades). Such a
 * stock shows no price and no pool chart. Market makers can still fill it, so a real price turns
 * up on Review.
 */
export const NO_MARKET_TRADERS = 10
