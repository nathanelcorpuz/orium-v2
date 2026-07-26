# BUGS.md — Orium bug tracker

Format per bug: steps to reproduce → what happened → what was expected. Claude Code: when fixing, add a test (or a manual verification note), move the bug to Fixed with the commit reference.

## Open

### Bug #5 - Guided setup opens claiming "Account added" on a brand-new account that has nothing
- **Reproduce**: create a genuinely new account (`/api/dev-new-account`, T121) and pick "Start guided setup" from the welcome modal. Reported by the user 2026-07-26 with a screenshot.
- **What happened**: the wizard opens on "Step 1 of 7: Add an account" but immediately shows the post-add interstitial - "Account added. Add another, or continue to the next step?" - with no add form and an empty item list. Nothing had been added.
- **Expected**: a brand-new account should open on the actual "add your first account" form.
- **Root cause**: `restartRequiredOnboarding` (`src/lib/onboardingActions.ts`) hardcodes `onboarding_wizard_state: "prompt:accounts"`, and `OnboardingWizard.tsx` renders that state as `{step.noun} added. Add another, or continue...`. That hardcoded state is T116's fix for the opposite situation: an *existing* user with data clicking "Start guided setup" used to have the wizard find nothing unresolved and silently self-complete, so it was forced to show the accounts review screen at least once. T119 then made the same action the primary entry point for brand-new accounts, where the forced state is simply false. One forced value is being asked to serve two opposite starting conditions.
- **Fix**: deliberately **not** patched in isolation - folded into T122's onboarding design pass (Phase 18), since "what does the wizard do on an empty account vs. one that already has data" is exactly the kind of question that pass exists to answer, and a spot fix here would likely be thrown away by it.

## Fixed

### Bug #4 — Logging a spend on a carryover budget doesn't reduce the next boundary's reserved amount
- **Reproduce**: on a carryover-enabled budget linked to an income (e.g. "Groceries" tied to "Freelance — Aya"), log a spend dated today, then check the Forecast table's next future boundary row for that same budget. Reported by the user 2026-07-23, reproduced with the seeded "Groceries"/"Freelance — Aya" budget (allocation ₱6,000, ₱2,000 already spent this cycle): logging a ₱500 spend correctly reduced today's "Budgets reserved" row by ₱500, but the next boundary's "Groceries" row stayed frozen at -₱6,000.00.
- **What happened**: `expandBudgetCycleOccurrences` in `src/lib/engine/budgetCycles.ts` computed every future boundary row as a flat `allocation − knownFutureSpend`, never factoring in carryover from the current (still-open) cycle — even though that cycle's spend-to-date is fully known, not speculative.
- **Expected**: the very next boundary should reserve `allocation + currentCycleLeftover − knownFutureSpend` when carryover is enabled, so a spend logged today visibly reduces it.
- **Fixed by**: `expandBudgetCycleOccurrences` now threads `currentCycleCarry = status.allocation + status.carriedIn − status.spent` into only the first future boundary (`i === 0`) — boundaries beyond that stay flat, deliberately not compounding the projection further (an unbounded chain would make a carryover-enabled weekly budget balloon across a 3-year horizon). Four new tests in `budgetCycles.test.ts` ("Bug #4" describe block) cover the projection, the spend-reduces-it case, carryover-disabled being a no-op, and non-compounding into the second future boundary; one pre-existing test's expectation updated (`generateForecast budgets` in `forecast.test.ts`) since it incidentally had `carryoverEnabled: true` with nothing spent, a case the fix now correctly changes. 145/145 tests, tsc, eslint, `npm run build` clean. Browser-verified 2026-07-23 against the real repro budget (after clearing a stray test-session skip override that was hiding the next boundary row): the row jumped from -₱6,000.00 to -₱9,500.00 (₱6,000 allocation + ₱3,500 current-cycle leftover), and the boundary after that stayed flat at -₱6,000.00, confirming no runaway compounding.

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
