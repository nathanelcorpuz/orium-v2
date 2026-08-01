# REMINDER.md

Scratchpad for things raised between sessions. Write anything here, in any shape - it does not need to be a well-formed task.

**How this file works** (per CLAUDE.md's session workflow): at the start of a session, everything here is triaged into its proper home - SPEC.md for scoped tasks and product decisions, BUGS.md for defects, a standalone document for anything bigger - and then **removed from this file**. SPEC.md is the record; this file is the inbox. Git history has every previous version if an old note needs looking up.

---

## Pending (NJ will be filling this with raw ideas)

(nothing - inbox is empty, see the triage note below)
- budget accounts should have almost identical functionality with main accounts, but they don't have to have projected total balance
- budget items when adjusted in any way should reflect on the budget account connected to it accordingly. if there are more than one budget account connected to a budget item, we can implement a dropdown selection for which account it should be auto calculated from in log spend, add funds, or take funds, as well as in the forecast page in the replenishment, we can have a default account set for a budget item and that should populate in the replenishment forecast item but should also be editable

---

## Last triage

- **2026-08-01, eighth pass**: 1 item (reminders add/edit UX) → built directly, same session: the add-reminder form now collapses behind a button (**T207**, SPEC.md Phase 29), and the reported edit-mode breakage is **Bug #17** (BUGS.md, fixed - a missing `min-w-0` on the edit input).
- **2026-08-01, seventh pass**: 1 item (account filter should be a dropdown) → **T206** (SPEC.md Phase 27, not yet built).
- **2026-08-01, sixth pass**: 1 item (mobile Forecast table height) → **T205** (SPEC.md Phase 27, not yet built). Same session: built the budget-accounts feature the user asked about directly (T204, SPEC.md Phase 28) - a separate `budget_accounts` table, storage for budgets, optionally linked, never counted in Total Balance/the forecast, managed from the Budgets page itself.
- **2026-08-01, fifth pass**: 1 item ("move funds in budgets") → **T203** (SPEC.md Phase 27, not yet built). Same session: fixed a real bug found while testing against the newly-duplicated staging data - "Pocket Money" (a budget linked to an income after that income's occurrence already settled) kept saying "Replenishes today" - now **Bug #16** in BUGS.md, fixed.
- **2026-08-01, fourth pass**: 3 UI polish items (collapsed-sidebar layout for the help icons and the Updates badge; Dashboard loading state) → **T200-T202** (SPEC.md Phase 27, not yet built). Also this session: confirmed the production account (`nathanelcorpuz@gmail.com`, ₱89,211.17 total balance) and duplicated it one-way into the staging Supabase project under the same email, for local testing without touching production again - see STAGING.md's "Progress" section for the mechanism, repeatable on request.
- **2026-08-01, third pass**: 11 items. The budget replenishment bug → **Bug #15** in BUGS.md (root cause confirmed against live production data, code fix committed; a data correction for today's affected rows is identified and awaiting the user's go-ahead before anything touches the real records). Two process complaints (always re-check REMINDER/SPEC on "continue"; document interruptions and confirm what changed) became standing rules in CLAUDE.md's session workflow rather than T-numbers - process, not product. The remaining 8 became **T193-T199** (SPEC.md Phase 27, not yet built) and two "Before MVP launch" discussion bullets (auto-move between accounts on income settle; FIRE-style financial goal reminders, explicitly not to be built yet).
- **2026-08-01, second pass**: 18 items → **T177-T188** (SPEC.md Phase 23, now done - see ARCHIVE.md). One was a false alarm: "leftover sample data in production" (originally T170) turned out to be a cross-account query bug mixing the real account with throwaway QA test accounts - corrected in SPEC.md (T151's real figure was ₱2,000, not ₱26,000), not a real task. The Supabase service-role key for the new Orium Staging project was provided directly and saved to `.env.local` - not a task, just closing STAGING.md's one open manual step.

---

## Prior triage (condensed - full history in git log and SPEC.md's ARCHIVE.md)

- **2026-07-31, second pass**: 6 items → **T171-T176** (SPEC.md Phase 22).
- **2026-07-31, first pass**: 30 items → 4 became bugs (**Bug #11-#14 / T150-T153**), 11 became tasks (**T154-T164**), 4 became **Phase 21** (**T165-T168**, mostly already built), 1 became **STAGING.md**, 3 became standing decisions in SPEC.md's "Before MVP launch", 2 were already-shipped commits documented retroactively (**T148**, **T149**).
