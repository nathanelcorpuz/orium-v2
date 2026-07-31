# BUGS.md — Orium bug tracker

Format per bug: steps to reproduce → what happened → what was expected. Claude Code: when fixing, add a test (or a manual verification note), move the bug to Fixed with the commit reference.

## Open

### Bug #11 - Forecast silently drops past-dated transactions that were never settled
- **Reproduce**: log a Misc (one-off) item dated yesterday or earlier and never settle it, then open `/forecast` the next day. Same applies to any recurring occurrence whose date has passed unsettled. Reported by the user 2026-07-30 from real production data: a Jul 29 2026 Misc payment showed in the forecast on Jul 29, then vanished on Jul 30.
- **What happened**: the row disappears from the Forecast table entirely, and - far worse - the running balance recomputes as if that money were never going to leave. The user's forecast showed a negative balance around Sep 1 one day, then showed it as resolved the next, purely because an unpaid obligation dropped out of the projection. The bug actively hides insolvency.
- **Expected**: an unsettled transaction whose date has passed still appears in the Forecast (it is still owed) and still counts against the running balance. Past-due rows should additionally be visually highlighted so the user is alarmed rather than reassured. The user also wants an email-notification option tied to this, which is tracked separately as a scope decision, not part of the fix.
- **Root cause (identified, not yet fixed)**: this is current engine behavior, not an accident. `src/lib/engine/forecast.ts:92` does `if (oneOff.dueDate < today) continue;` for one-offs, and every recurring rule is expanded from `today` forward via `expandRecurrenceOccurrences(rule, today, horizon)` (same file, line 65). SPEC.md's engine section states the intent explicitly: *"Occurrences strictly before `today` are excluded (they belong in settlements)."* The assumption was that anything in the past has either been settled or is no longer real. Production use disproved that: the gap between "due" and "settled" is exactly where a cash-flow app earns its keep.
- **Why this needs a spec decision first**: fixing it changes what "running balance" means (the forecast would open with a backlog rather than at today's balance), and it interacts with how far back to look (all history, or a bounded window?). Scoped as **T150** in SPEC.md Phase 20, which carries the decision.

### Bug #14 - Settling an income linked to a budget double-counts the allocation (real money, live data)
- **Reproduce**: link a budget with an allocation (e.g. ₱1,000) to an income (e.g. ₱20,000). Settle one occurrence of that income with an account selected. Check the account balance and the budget's running total. Found 2026-07-31 while scoping the user's "20,000 income minus 1,000 budget = 19,000" request, which turns out to describe this bug rather than a missing feature.
- **What happened (traced in code, not yet confirmed against live data)**: the full ₱20,000 lands in the cash account *and* ₱1,000 lands in the budget ledger. The same ₱1,000 is now counted twice. Meanwhile the Forecast had already projected the ₱1,000 as a real deduction before settling (T59), so settling makes the actual balance land ₱1,000 *above* what the forecast promised - the opposite direction from Bug #11, and equally misleading.
- **Expected**: settling a ₱20,000 income with a ₱1,000 linked budget should put ₱19,000 in the cash account and ₱1,000 in the budget, matching what the Forecast projected.
- **Root cause (identified, not yet fixed)**: in `settleOccurrence` (`src/app/(app)/forecast/actions.ts`), the cash side is applied once, up front - `applyToBalance(supabase, fields.balanceId, actualAmount)` with the *full* income amount. The linked-budget loop further down (the `type === "income"` branch) then writes a `budget_entries` incoming row plus a `settlements` row carrying `actual_amount: -allocation`, and marks a `budget_replenish_overrides` skip - but it never calls `applyToBalance` again to take the allocation back out of the cash account. The settlement row records a cash effect that never actually happened. Dashboard/Forecast "Total Balance" is `balances.reduce(...)` over accounts only (budgets are deliberately not included), so nothing downstream corrects for it.
- **Severity**: the user is running this in production with real data. Every linked-income settle since T56/T59 shipped has likely overstated their true cash position by that budget's allocation, cumulatively. Confirm against their live account before fixing, and decide whether existing balances need a one-time correction or only a forward fix.
- Scoped as **T151** in SPEC.md Phase 20.

## Fixed

### Bug #13 - "First goes negative" is the wrong label when the danger threshold is not zero
- **Reproduce**: in Settings, set the lowest balance range (danger) to something above zero, e.g. ₱5,000. Then view the Dashboard and Forecast "First goes negative" line. Reported by the user 2026-07-30.
- **What happened**: the label always read "First goes negative" even when the balance being flagged never actually went below zero - it only crossed the user's own danger threshold. The figure was also passed through `Math.abs()`, so a positive ₱3,000 danger balance printed as "₱3,000.00" directly under the word "negative".
- **Expected**: say "First goes negative" only when the figure is genuinely below zero; otherwise something threshold-accurate. The user proposed both a blanket rename and a conditional version, and preferred the conditional one.
- **Fixed by**: **T153** in SPEC.md Phase 20 - new `firstDangerLabel()` in `src/lib/balanceColor.ts`, wired into both call sites. The label had simply never been updated to match `findFirstDangerPoint`, which by its own name reports a danger-threshold crossing rather than a zero crossing. See T153's write-up, including why T80's user-editable tier labels were deliberately not reused here.

### Bug #12 - Forecast's balance chips open an account without its connected finances
- **Reproduce**: on `/forecast`, click a balance chip at the top to edit that account. Compare against opening the same account from `/accounts`. Reported by the user 2026-07-30.
- **What happened**: the Forecast's version of the modal had no "connected items" section at all, so the bills/income/debt/savings/extras linked to that account (T71) were invisible there. From `/accounts` the same modal lists them and offers Disconnect.
- **Expected**: the same account shows the same information from either entry point.
- **Fixed by**: **T152** in SPEC.md Phase 20. The real cause was duplication rather than an oversight - the queries were inlined in `accounts/page.tsx` and the type lived in `accounts/BalancesClient.tsx`, so the Forecast page had nothing shared to call, and `BalanceModal`'s `connectedItems = []` default absorbed the gap silently. Fixed by extracting `src/lib/connectedItems.ts` (pure) and `src/lib/connectedItemsData.ts` (the Supabase query) and having both pages call the same code. See T152's write-up for the split's reasoning and for what could not be browser-verified this session.

### Bug #10 - Deleting a future budget entry from Forecast closed the modal before the delete finished
- **Reproduce**: log a spend/add funds on a manual budget dated in the future, open it from the Forecast table, click "Delete this entry." Flagged as a known gap in T133 (2026-07-27), confirmed and fixed during the T134 mobile stress-test pass (2026-07-28).
- **What happened**: the modal closed immediately on click, before the delete server action had actually run - a failed delete (the underlying function never even checked Supabase's own error result) would fail completely silently.
- **Expected**: the modal shows pending feedback, stays open on failure with an error message, and only closes once the delete genuinely succeeds.
- **Fixed by**: **T147** in SPEC.md - `deleteBudgetEntry` now returns an error state like every other budget action, and both call sites (`EditSettleModal.tsx`, `BudgetEntriesModal.tsx`) wait for it via `useActionState`. See T147's write-up for the full root cause and fix.

### Bug #9 - Missing space in Misc's account-connect helper text ("adds it tothat account's")
- **Reproduce**: open Add misc item, look at the helper text under the account dropdown. Reported by the user 2026-07-27/28 as "fromthat" (the "Money out"/subtracts-from branch); reproduced here as "tothat" (the default "Money in"/adds-to branch) - same bug, either direction.
- **What happened**: the two words ran together with no space, even though the JSX source has one.
- **Expected**: "adds it to that account's balance" / "subtracts it from that account's balance", properly spaced.
- **Fixed by**: **T141** in SPEC.md - a genuine Next.js/SWC JSX whitespace-collapsing quirk in this specific structural context, not a typo. See T141's write-up for the full explanation.

### Bug #8 - Date picker calendar clipped on the right edge, horizontal scroll resets the picked date
- **Reproduce**: on Add Debt (or any recurring form's "Ends: On date" field), open the date picker. Reported by the user 2026-07-27/28 on Add Debt specifically.
- **What happened**: the calendar's right columns were cut off by the modal's edge, with a horizontal scrollbar that reset the picked date when scrolled.
- **Expected**: the calendar is always fully visible within the modal, no scroll needed.
- **Fixed by**: **T139** in SPEC.md - `DatePicker.tsx` now measures available space and right-aligns the popover when it wouldn't otherwise fit, fixing every recurring form that shares this component, not just Debt. See T139's write-up for the full root cause and fix.

### Bug #7 - Guided setup's add-item modal gets stuck open with no way to close it
- **Reproduce**: in guided setup, on any step with at least one item already added, click "Add another X", then click Cancel or the X close button. Reported by the user 2026-07-27/28 on the Accounts step, said to apply to every step.
- **What happened**: the modal stayed open regardless of Cancel/Close, and the wizard's Back/Forward buttons stayed hidden with no visible way to leave the step.
- **Expected**: Cancel/Close actually closes the add-item form and returns to the normal step view.
- **Fixed by**: **T136+T137** in SPEC.md - `OnboardingWizard.tsx`'s `onClose` handlers only cleared local state, not the server-persisted "reopen" flag that was also keeping the modal open. See T136+T137's write-up for the full root cause and fix.

### Bug #6 - Recurring items save on today's day-of-month regardless of the date/frequency actually picked
- **Reproduce**: add a Bill (or Income/Debt/Savings), change the Start date away from its today default (e.g. to the 31st), leave a day-based preset selected ("Monthly on the 31st"), save. Reported by the user 2026-07-27/28 (income due-date 31st saving as 27th; "~90% of my future transactions dated the 27th" across a session of varied entries).
- **What happened**: the "Repeats" preset pill correctly relabeled itself to match the new start date and stayed visually selected, but the saved rule used the day/weekday from whichever start date was in effect when the form first mounted (almost always today, since every Add form defaults to it) - not the one actually picked.
- **Expected**: the saved recurrence rule matches whatever start date and preset are shown selected in the form.
- **Fixed by**: **T135** in SPEC.md - `RecurrencePicker.tsx`'s preset labels recomputed live from the `startDate` prop, but the actual submitted `value` state didn't. See T135's write-up for the full root cause and fix.

### Bug #5 - Guided setup opens claiming "Account added" on a brand-new account that has nothing
- **Reproduce**: create a genuinely new account (`/api/dev-new-account`, T121) and pick "Start guided setup" from the welcome modal. Reported by the user 2026-07-26 with a screenshot.
- **What happened**: the wizard opens on "Step 1 of 7: Add an account" but immediately shows the post-add interstitial - "Account added. Add another, or continue to the next step?" - with no add form and an empty item list. Nothing had been added.
- **Expected**: a brand-new account should open on the actual "add your first account" form.
- **Root cause**: `restartRequiredOnboarding` (`src/lib/onboardingActions.ts`) hardcodes `onboarding_wizard_state: "prompt:accounts"`, and `OnboardingWizard.tsx` renders that state as `{step.noun} added. Add another, or continue...`. That hardcoded state is T116's fix for the opposite situation: an *existing* user with data clicking "Start guided setup" used to have the wizard find nothing unresolved and silently self-complete, so it was forced to show the accounts review screen at least once. T119 then made the same action the primary entry point for brand-new accounts, where the forced state is simply false. One forced value is being asked to serve two opposite starting conditions.
- **Fixed by**: **T123**, and by deletion rather than a patch. The forced state existed only because the wizard was a *gate* that had to decide whether to let you through, so it needed something to show when the natural derivation said "nothing left to do". T123 made guided setup an ordinary `/setup` page, at which point there is nothing to force: each step renders what the account actually contains, and "everything's done" is simply an "You're all set" panel instead of a self-completing redirect. `restartRequiredOnboarding` (with its hardcoded `prompt:accounts`) is gone, replaced by `startGuidedSetup`, which sets no wizard state at all. Verified against a genuinely fresh account from `/api/dev-new-account`: setup now opens on "Step 1 of 7 / Add an account" with an Add button and no items, and the "Account added" line appears only after an account is really added, with that account listed beneath it.

### Bug #4 - Logging a spend on a carryover budget doesn't reduce the next boundary's reserved amount
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
