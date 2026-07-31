// T159 (SPEC.md Phase 20): filter a finance list by which account an item is
// connected to (T71's `balance_id`).
//
// Of the four axes the scoping note listed - connected account, date range,
// recurrence frequency, free-text name - the other three already existed:
// every finance page has had a name box and an amount-range filter since T52,
// and the four recurring pages have a recurrence-unit chip set. Connected
// account was the genuine gap, and the one that matters most in real use,
// where items are spread across several accounts.
//
// Shared rather than reimplemented per page specifically because the same
// filter now lives on Bills, Income, Debt, Savings and Misc - five call sites
// is exactly where copy-paste starts to drift (see Bug #12).

export type BalanceOptionLike = { id: string; name: string };

// Sentinel for "not connected to any account". A real balance id is a uuid,
// so this can never collide with one.
export const NO_ACCOUNT_FILTER_VALUE = "__no_account__";

export function accountFilterOptions(
  balances: BalanceOptionLike[],
): { value: string; label: string }[] {
  return [
    ...balances.map((balance) => ({ value: balance.id, label: balance.name })),
    // Offered unconditionally: "which of these did I forget to connect?" is a
    // real thing to want to ask, and it stays answerable even once every
    // current item happens to be linked.
    { value: NO_ACCOUNT_FILTER_VALUE, label: "No account" },
  ];
}

/**
 * True when the item should be shown. An empty selection means "no account
 * filter applied", matching how every other multi-select filter on these
 * pages already behaves - selecting nothing is not the same as excluding
 * everything.
 */
export function matchesAccountFilter(balanceId: string | null, selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  if (balanceId === null) return selected.has(NO_ACCOUNT_FILTER_VALUE);
  return selected.has(balanceId);
}
