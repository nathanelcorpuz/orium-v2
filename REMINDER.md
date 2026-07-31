# REMINDER.md

Scratchpad for things raised between sessions. Write anything here, in any shape - it does not need to be a well-formed task.

**How this file works** (per CLAUDE.md's session workflow): at the start of a session, everything here is triaged into its proper home - SPEC.md for scoped tasks and product decisions, BUGS.md for defects, a standalone document for anything bigger - and then **removed from this file**. SPEC.md is the record; this file is the inbox. Git history has every previous version if an old note needs looking up.

---

## Pending

(nothing - inbox is empty)

---

## Last triage

**2026-08-01.** Eighteen items arrived in one message. One was a false alarm (see below); the rest became **SPEC.md Phase 23 (T177-T188)**.

- Reminders draggable, the finance-page date-range gap, connected-items UX, History's own filters, greyer disabled items, hiding an Updates entry from view, the Updates read-state/filters/lazy-load rework, per-item override viewing, per-account forecasted balance, Add/Take/Move funds for accounts, budgets in scenarios, and unlimited simultaneous active scenarios with a redesigned Forecast toggle UI - all scoped as **T177-T188**, not yet built. Full scope notes for each are in SPEC.md Phase 23 rather than repeated here.
- **"Leftover sample data in production" (originally flagged as T170)** - turned out to be a false alarm: an earlier investigation query hadn't filtered by `user_id` and silently mixed the real account together with two throwaway QA test accounts from this same session. Corrected directly in SPEC.md (T151's real figure was ₱2,000, not ₱26,000; T170 itself was retracted) rather than becoming a new task.
- The Supabase service-role key ("secret key" in current Supabase terminology - they've moved away from calling it "service_role") for the new Orium Staging project was provided directly and saved to `.env.local`; not a task, just closing the one manual step STAGING.md's progress note had flagged.

---

## Prior triage

**2026-07-31, second pass.** Six more items arrived after the first triage the same day. One (the tracking-horizon limit) was a direct follow-up to something already discussed, and got its own final answer from the user rather than staying a discussion point; the rest became **SPEC.md Phase 22**.

- **Raise the hard limit to 50 years, "final decision".** Closed out immediately as **T171** - the user's own flat framing meant no further discussion or split between validation cap and forecast horizon; both just moved to 50. Surfaced and fixed one real edge case in the process: a daily-recurring rule would have silently stopped projecting around 27 years without it, since `recurrence.ts`'s own defensive period cap was sized for the old 5-year horizon.
- **Transaction fee per account, auto-deducted from connected forecasted transactions**: **T172**, not yet built - needs a design decision on whether it applies to incoming amounts too and how it displays, before the schema question (a new column on `balances`) is even the hard part.
- **"Due today" yellow tag, alongside the past-due red one**: **T173**, not yet built - small, same spot in `forecast.ts` where `pastDue` is already set.
- **"Run possible scenario" simulation/toggle feature**: **T174**, not yet built. This is the same "what-if scenarios" item already flagged unscoped in "Before MVP launch" - now with real detail behind it, but still not started, since it's the largest feature raised so far (its own storage, a scenario-aware read path on every page, an "activate" step that commits synthetic rows across every table) and deserves a proper design pass before code, the same way Budgets v2's replacement by v3 taught this project not to build ahead of a plan that's still nebulous.
- **Temporarily disable a bill/misc/income/debt/savings/budget to preview its forecast impact**: **T175**, not yet built - smaller and more self-contained than T174, likely the more useful 80% of it for daily use.
- **History page too small on desktop**: **T176**, not yet built - no specifics given yet on what "too small" means; needs a look before it can be scoped precisely.

---

## Prior triage

**2026-07-31, first pass.** The 30 items collected between 2026-07-29 and 2026-07-30 were sorted as follows.

**Became bugs** (BUGS.md, all four confirmed by reading the code and scoped at the top of SPEC.md Phase 20):
- Forecast dropping past-dated unsettled transactions, which hid a real negative balance: **Bug #11 / T150**.
- The "20,000 income minus 1,000 budget = 19,000" note turned out to describe a defect rather than a missing feature - settling a linked income double-counts the allocation: **Bug #14 / T151**.
- Accounts opened from the Forecast not showing connected finances: **Bug #12 / T152**.
- "First goes negative" being the wrong label when the danger threshold is above zero: **Bug #13 / T153**.

**Became tasks** (SPEC.md Phase 20, T154-T164): the missing test for same-day ordering, bold Forecast dates and comment bubbles, start dates on list rows, the Yearly preset and "Ends: never" default, Forecast row details, upgraded filters, somewhere for completed debts and savings to go, the desktop date-grouped Forecast layout, the activity log, the "what changed since you last logged in" feed, and the family calendar view.

**Became a phase, and turned out mostly already built** (SPEC.md Phase 21, T165-T168): seven separate budget-account notes turned out to describe one feature. Re-reading them against the existing Budgets v3 ledger showed that "layer" already existed - excluded from cash-flow forecast, already auto-replenishing on income settle - so no new data model was built. What was missing (a combined total across all budgets) and what was genuinely broken (the settle-path double-count, per-instance edits, display gaps) got fixed; the rest was verified rather than duplicated.

**Became a document**: the production-safety, staging and inviting-users note is now **STAGING.md** in the repo root, with the decisions it raises listed in SPEC.md's "Before MVP launch" section.

**Became decisions, deliberately not tasks at the time** (SPEC.md "Before MVP launch"): email notifications (requested four separate ways and still on the "Out of scope" list), user-defined categories, and per-account forecasted balances. The horizon question was later closed out for real - see the second triage above.

**Already shipped**: same-day income-before-deductions ordering had already landed in commit `c6b85d3`; it is now documented as **T148**. The Add/Take funds change in `f7aee0d` is documented as **T149**.
