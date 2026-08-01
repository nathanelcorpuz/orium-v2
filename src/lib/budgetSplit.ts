// T218: splits a single settled amount across however many budget accounts
// are connected to a budget, proportional to each account's configured
// `replenish_amount` share (budget_budget_accounts). Pure/integer-only so a
// multi-account replenishment (or a per-occurrence override total, T168/
// Bug#15) always lands on exact centavos with no float drift, matching
// every other money computation in this app.
//
// If every configured share is 0 (accounts just connected, shares not set
// up yet), splits evenly instead of dividing by zero - a defined fallback
// rather than an error, since "connect now, configure shares later" is an
// explicitly supported flow (user request 2026-08-02).
export function splitAmountByShares(total: number, shares: number[]): number[] {
  if (shares.length === 0) return [];
  if (shares.length === 1) return [total];

  const sumShares = shares.reduce((sum, share) => sum + share, 0);
  const effectiveShares = sumShares > 0 ? shares : shares.map(() => 1);
  const effectiveSum = sumShares > 0 ? sumShares : shares.length;

  const amounts = effectiveShares.map((share) => Math.floor((total * share) / effectiveSum));
  const distributed = amounts.reduce((sum, amount) => sum + amount, 0);
  // Any leftover from flooring goes to the last account, so the legs always
  // sum to exactly `total` - never more, never less.
  amounts[amounts.length - 1] += total - distributed;
  return amounts;
}
