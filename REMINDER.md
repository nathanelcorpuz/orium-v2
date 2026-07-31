# REMINDER.md

Scratchpad for things raised between sessions. Write anything here, in any shape - it does not need to be a well-formed task.

**How this file works** (per CLAUDE.md's session workflow): at the start of a session, everything here is triaged into its proper home - SPEC.md for scoped tasks and product decisions, BUGS.md for defects, a standalone document for anything bigger - and then **removed from this file**. SPEC.md is the record; this file is the inbox. Git history has every previous version if an old note needs looking up.

---

## Pending

(nothing - inbox is empty)

---

## Last triage

**2026-07-31.** The 30 items collected between 2026-07-29 and 2026-07-30 were sorted as follows.

**Became bugs** (BUGS.md, all four confirmed by reading the code and scoped at the top of SPEC.md Phase 20):
- Forecast dropping past-dated unsettled transactions, which hid a real negative balance: **Bug #11 / T150**.
- The "20,000 income minus 1,000 budget = 19,000" note turned out to describe a defect rather than a missing feature - settling a linked income double-counts the allocation: **Bug #14 / T151**.
- Accounts opened from the Forecast not showing connected finances: **Bug #12 / T152**.
- "First goes negative" being the wrong label when the danger threshold is above zero: **Bug #13 / T153**.

**Became tasks** (SPEC.md Phase 20, T154-T164): the missing test for same-day ordering, bold Forecast dates and comment bubbles, start dates on list rows, the Yearly preset and "Ends: never" default, Forecast row details, upgraded filters, somewhere for completed debts and savings to go, the desktop date-grouped Forecast layout, the activity log, the "what changed since you last logged in" feed, and the family calendar view.

**Became a phase** (SPEC.md Phase 21, T165-T168): seven separate budget-account notes turned out to describe one feature - budget accounts as a second layer behind the cash-flow accounts - so they were grouped rather than scoped individually.

**Became a document**: the production-safety, staging and inviting-users note is now **STAGING.md** in the repo root, with the decisions it raises listed in SPEC.md's "Before MVP launch" section.

**Became decisions, deliberately not tasks** (SPEC.md "Before MVP launch"): raising the horizon from 5 to 25 years (this reverses T146, confirmed only three days earlier, so it needs an explicit re-decision), email notifications (requested four separate ways and still on the "Out of scope" list), user-defined categories, and per-account forecasted balances.

**Already shipped**: same-day income-before-deductions ordering had already landed in commit `c6b85d3`; it is now documented as **T148**. The Add/Take funds change in `f7aee0d` is documented as **T149**.
