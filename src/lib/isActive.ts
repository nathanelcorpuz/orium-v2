// T175 (SPEC.md Phase 17): `active === false` means a bill/income/debt/
// savings/one-off/budget has been switched off - "temporarily disable a
// financial record without deleting it, to preview the forecast's shape
// without it." `forecast.ts` already filters on exactly this predicate
// (`item.active !== false`, so undefined/older rows stay active) before
// generating any row.
//
// Bug report 2026-08-03 (REMINDER.md): "switching off any finance items
// should assume that its been completely removed from everything.
// switching off my debt doesn't remove the total remaining debt as of
// now." Every page/Dashboard summary stat computed directly from a raw
// items array (bypassing the forecast engine) had never applied this same
// filter - Total Monthly Bills/Income/Debt/Savings/Budgets, Remaining
// Debt/Savings, the debt-free/savings-goal dates, and both aggregate
// progress bars all silently kept counting a switched-off item. This
// shared predicate is the fix applied at each of those call sites, so
// "switched off" means the same thing everywhere it's checked - not
// reimplemented per page with a risk of `active === true` (which would
// wrongly exclude the common case of `active` being unset/undefined).
export function isActive(item: { active?: boolean }): boolean {
  return item.active !== false;
}
