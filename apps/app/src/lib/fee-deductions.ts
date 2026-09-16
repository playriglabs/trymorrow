/**
 * How much cash to take out of each gift when the sender cannot pay every fee from cash left after
 * the gifts. The fee transfer still pays the treasury in full; reducing the locked cash by the
 * same total keeps the sender's debit within their balance. Null means at least one gift would be
 * emptied, so the caller must try a share-paid fee or refuse the send.
 */
export function cashGiftFeeDeductions(
  feeRaws: bigint[],
  cashAfterGifts: bigint,
  cashPerGift: bigint,
): bigint[] | null {
  const total = feeRaws.reduce((sum, fee) => sum + fee, 0n)
  let remaining = total > cashAfterGifts ? total - cashAfterGifts : 0n
  const maximumPerGift = cashPerGift - 1n
  if (maximumPerGift < 0n) return null

  const capacities = feeRaws.map((fee) => (fee < maximumPerGift ? fee : maximumPerGift))
  if (capacities.reduce((sum, capacity) => sum + capacity, 0n) < remaining) return null

  return capacities.map((capacity) => {
    const deduction = capacity < remaining ? capacity : remaining
    remaining -= deduction
    return deduction
  })
}
