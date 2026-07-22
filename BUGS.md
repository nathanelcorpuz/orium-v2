# BUGS.md — Orium bug tracker

Format per bug: steps to reproduce → what happened → what was expected. Claude Code: when fixing, add a test (or a manual verification note), move the bug to Fixed with the commit reference.

## Open

(none currently)

## Fixed

### Bug #3 — Future-dated spend is listed but not counted in cycle totals
- **Reproduce**: on the Budgets page, log a spend dated later than today but still inside the current cycle (e.g. today 2026-07-22, entry dated 2026-07-23 on the monthly-on-the-1st "food" budget). Observed with the seeded test account on 2026-07-21.
- **What happened**: the entry shows in the budget's current-cycle entries list, but is excluded from "₱X of ₱Y spent this cycle", the progress bar, "remaining", the Dashboard "Budgets this cycle" card, and the Forecast current-cycle row — the list and every total disagree.
- **Expected**: the user confirmed (2026-07-21) that future-dated spends are a real use case and upgraded this to a feature rather than a plain fix.
- **Fixed by**: **T43** in SPEC.md — `computeBudgetCycleStatus`/`expandBudgetCycleOccurrences` in `src/lib/engine/budgetCycles.ts` now count a future-dated entry toward whichever cycle it actually falls in; `BudgetCard.tsx`'s entries list is bounded the same way. Browser-verified 2026-07-21 with the pre-existing "sinigang" repro entry — Budgets card, Dashboard card, and Forecast now all agree. See SPEC.md "Forecast integration" for the full write-up.

### Bug #2 — Greeting name wrong by default
- **Reproduce**: log in with an account that has no profile name set; view Dashboard greeting.
- **What happened**: greeting showed the raw email instead of a sensible name.
- **Expected**: show profile name when set; otherwise the email's local part (before `@`). Example: `juan.lopez@gmail.com` → "Welcome, juan.lopez."
- **Fixed by**: `displayName()` in `src/lib/displayName.ts`, wired into the Dashboard greeting, covered by Vitest in `displayName.test.ts`. See SPEC.md roadmap → T23.

### Bug #1 — Total Monthly Income uses fractional weekly math
- **Reproduce**: add a weekly income of ₱20,000; open Dashboard or Income page.
- **What happened**: Total Monthly Income showed ₱86,666.7 (20,000 × 52 ÷ 12), with a decimal.
- **Expected**: ₱80,000 — weekly items count ×4 per month.
- **Fixed by**: `monthlyEquivalent()` in `src/lib/engine/monthlyTotals.ts`, integer multipliers (monthly ×1, weekly ×4, biweekly ×2, semi_monthly_15_30 ×2), covered by Vitest in `monthlyTotals.test.ts`. See SPEC.md roadmap → T22.
