# Orium — Product Spec

**The single source of truth.** Product definition, data model, engine rules, and the full roadmap live here. Working rules for Claude live in CLAUDE.md; open bugs in BUGS.md. (This file absorbed and replaced SPEC2.md in July 2026; task numbers are continuous across both.)

## What Orium is

Orium is a family cash-flow forecasting app. Users manually enter their account balances, recurring bills, income, debt payments, savings goals, one-off expenses, and spending budgets. Orium projects every upcoming transaction in chronological order and shows the **running future balance** at each date, color-coded by safety level. The core promise: *know exactly how much money you'll have on any future date, and never miss a bill.*

v1 (shipped) rebuilt the original Orium (github.com/nathanelcorpuz/orium) on a cleaner engine. The current work replaces its fixed 4-frequency recurrence with calendar-style rules (Phase 6A), converts budgets to replenishing cycles (Phase 6B), and restyles everything Notion-like (Phase 7).

## Tech stack (fixed — do not add alternatives)

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth (email/password), Row Level Security
- `@supabase/supabase-js` + `@supabase/ssr` per official Next.js patterns
- Vitest for unit tests (engine only)
- No other dependencies without asking the user first

## Core design rules (non-negotiable)

1. **Money is integer centavos.** Never floats. `₱1,500.00` = `150000`. Format only at the UI layer. Default currency `₱`, user-configurable.
2. **Due dates are calendar dates** — `YYYY-MM-DD` strings / Postgres `date`. Never UTC timestamps for due dates.
3. **Rules, not pre-generated rows.** Recurrence is stored as rules; occurrences are computed on the fly.
4. **The forecast engine is pure TypeScript** in `src/lib/engine/` — no database or network calls, fully unit-tested.
5. **Every table has `user_id`** with owner-only RLS.

## Data model (Postgres — migrations in `supabase/migrations/`)

### `balances`
Real money accounts. `id, user_id, name, amount (bigint centavos), comments, created_at, updated_at`.

### `recurring_items`
One row per recurring rule (bills, income, debt, savings). Amount sign convention: income positive; bills/debt/savings negative (DB-enforced).

Identity: `id, user_id, name, type (bill|income|debt|savings), amount, comments`.

**Recurrence rule (new model, live from migration 0004):**
| column | type | notes |
|---|---|---|
| `interval` | int ≥ 1 | repeat every N units |
| `unit` | enum | `day` \| `week` \| `month` \| `year` |
| `weekdays` | int[] nullable | 0=Sun…6=Sat; required when unit=week (multi-select) |
| `days_of_month` | int[] nullable | 1–31 for unit=month; days beyond a month's length clamp to its last day |
| `ordinal` + `ordinal_weekday` | int nullable pair | nth-weekday monthly rules: ordinal 1–4 or −1 (last); (3,2)=third Tuesday, (−1,5)=last Friday. unit=month uses **either** `days_of_month` **or** the ordinal pair |
| `start_date` | date | anchor; first possible occurrence |
| `ends_type` | enum | `never` \| `on_date` \| `after_count` |
| `end_date` | date nullable | set iff ends_type=on_date |
| `occurrence_count` | int nullable | set iff ends_type=after_count |

**Legacy columns `frequency`/`day_of_month`/`weekday` are gone** — dropped by migration 0005 (2026-07-21) once T35 shipped. Backfill mapping used to populate the new columns before the drop: monthly → (1, month, days=[day_of_month, falling back to start_date's day]) · weekly → (1, week) and biweekly → (2, week), both with weekdays=[dow(start_date)] — **not** the legacy `weekday` column, which the v1 engine never read and which may have been null or disagreed with the real schedule · semi_monthly_15_30 → (1, month, days=[15,30]); existing rows got `ends_type='on_date'` + their then-current end_date.

### `occurrence_overrides`
Per-instance edits to a recurring rule (calendar-exception style). `id, user_id, recurring_item_id (fk), original_date, new_date, new_amount, new_name, skipped (bool)`. Unique on (`recurring_item_id`, `original_date`).

### `one_off_items`
"Extras" — single dated transactions. `id, user_id, name, amount (signed), due_date, comments`.

### `settlements`
"History" — what actually happened, written when the user settles an occurrence or logs a budget spend. `id, user_id, source_type (recurring|one_off|budget), source_id, name, type (bill|income|debt|savings|extra|budget), forecasted_amount, actual_amount, forecasted_date, actual_date, forecasted_balance`. Settling a recurring occurrence also writes a `skipped` override so it leaves the forecast.

### `budgets` (T36 columns live; app still on the pre-6B baseline until T37/T38)
`id, user_id, name, created_at`, plus (still pre-6B, current app): `monthly_allocation (bigint ≥ 0)`. Plus (T36, migration 0006, added 2026-07-21): `allocation (bigint ≥ 0, NOT NULL, backfilled 1:1 from monthly_allocation)`, `carryover_enabled (bool, default true)`, `linked_income_id (uuid nullable, REFERENCES recurring_items ON DELETE SET NULL — app-level rule: must point at a type=income item, not DB-enforced)`, and the full recurrence rule shape (all nullable — `start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count`; `interval`/`unit`/`start_date`/`ends_type` are constrained to move together as a complete-or-nothing group). `monthly_allocation` is dropped by migration 0007 once T38 ships and the app no longer reads it — same additive-then-drop pattern as 0004/0005.

### `budget_entries`
Logged spends. `id, user_id, budget_id (fk cascade), entry_date, amount (bigint > 0 = money spent), note, created_at`. Unchanged by 6B.

### `reminders`
`id, user_id, text, created_at`.

### `preferences`
One row per user, created on signup. `user_id pk, currency (default '₱'), balance_ranges (bigint[] — 5 ascending centavo thresholds: [danger, low, medium, high, higher]; balance ≤ ranges[0] = danger, above ranges[4] = highest)`.

## The forecast engine (`src/lib/engine/`)

Pure functions. `generateForecast({ balances, recurringItems, overrides, oneOffs, budgets?, budgetEntries?, today, horizon }) → ForecastRow[]` where each row is `{ sourceType, sourceId, originalDate, name, amount, dueDate, type, runningBalance }`.

Pipeline: expand each recurring rule from `max(today, start_date)` to the rule's end (capped at horizon) → apply overrides (move/change/skip) → merge one-offs dated today or later → merge budget rows (below) → sort by due date (stable, date only) → running balance = sum of `balances.amount` plus cumulative signed amounts, always integer centavos. Occurrences strictly before `today` are excluded (they belong in settlements).

### Recurrence expansion (target semantics, T33–T34)
- **day**: start_date, then every `interval` days.
- **week**: weeks anchored to the week containing start_date; every `interval` weeks emit each selected weekday; skip dates before start_date.
- **month**: months anchored to start_date's month, stepping by `interval`; emit each clamped day in `days_of_month` (day > month length → last day of month), or the resolved nth-weekday date (`ordinal` 1–4 or −1=last + `ordinal_weekday`).
- **year**: start_date's month/day every `interval` years; Feb 29 → Feb 28 in non-leap years.
- **ends**: `never` → generate to horizon; `on_date` inclusive; `after_count` → stop after N emitted occurrences.
- `ends_type=never` items are excluded from finite "remaining total" stats (e.g. total remaining debt).

The old fixed 4-frequency expansion (monthly/weekly/biweekly/semi_monthly_15_30) is gone — removed along with its columns by migration 0005 once T35 shipped. Every `recurring_items` row now uses this rule shape exclusively; `RecurringItem` has no legacy fields.

### Monthly-equivalent summary stat
Summary cards ("Total Monthly Income/Bills") use integer multipliers, never fractional math (a displayed `86,666.7` means float leakage — bug). Generalized form: `occurrencesPerMonth = round(f)` where f = day: 30/interval · week: (4 × len(weekdays))/interval · month: (len(days_of_month) or 1)/interval · year: 1/(12 × interval); minimum 0. `monthlyEquivalent = amount × occurrencesPerMonth` (integer × integer). Old presets yield ×4 (weekly), ×2 (biweekly), ×2 (semi-monthly), ×1 (monthly). The *forecast* keeps real occurrence dates (a 5-Saturday month genuinely shows 5 incomes) — only summary stats use multipliers.

### Budgets v2 engine (T37 — built in `budgetCycles.ts`, a new module alongside the untouched `budgets.ts`)
A budget replenishes at each **cycle boundary**; everything derives from logged spends — no manual resets. `budgets.ts`'s T24/T25 monthly-only functions (`currentMonthBudgetStatus`, `expandBudgetOccurrences`) are kept exactly as they were rather than rewritten in place — they're still what the currently-deployed Budgets page calls, and per the T35→0005 incident this session isn't taking chances with a caller it can't fully verify mid-task. T38/T39 do the actual cutover once the UI can produce v2 data; `budgets.ts` gets deleted then, mirroring how `monthly.ts`/`interval.ts`/`semi-monthly.ts` were deleted only once nothing called them.

**Boundary source:** linked income set → that income's *effective* occurrence dates (after overrides — moved dates move the boundary; skipped occurrences produce no reset, the cycle extends). Else own recurrence set → its occurrences. Else (e.g. linked income deleted) → fallback monthly on the 1st + a "needs a schedule" badge in the UI. After the final boundary, the last cycle extends to the horizon.

**Cycle math:** cycle k spans [boundaryₖ, boundaryₖ₊₁). Entries belong to the cycle containing entry_date; boundary-date entries belong to the **new** cycle; entries before the first boundary count toward the first cycle. `available₀ = allocation`; `availableₖ = allocation + (carryover_enabled ? availableₖ₋₁ − spentₖ₋₁ : 0)` — carryover may be negative. `remaining = max(available_current − spent_current, 0)`; `over = max(spent_current − available_current, 0)`.

**Forecast integration:** current cycle → one row per budget, "{name} — remaining this cycle", amount −remaining, dated today, omitted when remaining = 0. Each future boundary within the horizon → "{name} — allocation", amount −allocation, dated the boundary. Budget rows are type `budget` (teal), never settleable (logging a spend covers that). The current-cycle row also stays uneditable — it's a live status snapshot always dated today, not a discrete future transaction. Future boundary rows *are* editable (T42): move date, change amount, or skip, via `budget_occurrence_overrides` (keyed `budget_id`+`original_date`, mirroring `occurrence_overrides`), applied in `forecast.ts`'s merge loop the same way recurring-item overrides are.

**Future-dated spends (T43):** an entry dated after today counts toward `spent`/`remaining`/`over` for whichever cycle it actually falls in — current or a later one — everywhere those appear (Budgets page, Dashboard card, current-cycle forecast row); the entries list and the totals now always agree (was Bug #3). `computeBudgetCycleStatus` gained `currentCycleEnd` (the next boundary, resolved via `horizon` — defaulted to a ~1yr lookahead for callers with no real forecast horizon, e.g. `BudgetCard.tsx`/`BudgetsPanel.tsx`/the Dashboard card; `expandBudgetCycleOccurrences` passes the real one) so a future-dated entry can be bounded to the correct cycle instead of leaking into whichever one is "current". Each future-dated entry also renders as its own Forecast row (sourceType `budget_entry`, sourceId = the entry's own id) on its `entry_date` — name `"{budget} - {note}"` matching the settlement-naming convention, amount −entry amount — so the balance dips on the day the money actually leaves. Whichever boundary row (current-cycle "remaining" or a future "allocation") the entry would otherwise have inflated is reduced by exactly its amount (floored at 0) so the two never double-count: `futureBudgetEntries(entries, budgetId, today)` in `budgetCycles.ts` is the shared helper both `expandBudgetCycleOccurrences` (for the subtraction) and `forecast.ts` (for the standalone rows) use. `budget_entry` rows are editable/deletable directly from the Forecast (user decision 2026-07-21, consistent with T42's boundary-row editability) — `EditSettleModal` gets an amount+date+note form reusing the *existing* `updateBudgetEntry`/`deleteBudgetEntry` actions from `budgets/actions.ts` rather than new ones. `BudgetCard.tsx`'s current-cycle entries list is now bounded above by `currentCycleEnd` too — previously unbounded, so an entry from a *further* future cycle used to leak into the wrong card even though the totals never counted it (part of the Bug #3 root cause).

**Logging a spend** writes a `budget_entries` row AND a settlement (source_type `budget`, type `budget`, name = budget name + note, actual_amount = −amount, actual_date = entry_date, forecasted fields mirror actuals, forecasted_balance = 0). History renders budget rows with a "budget" tag, no forecast-vs-actual comparison.

### Peaks and Drops
One row per year in the horizon, one column per calendar month (Jan–Dec); each cell shows that month's max (peak) and min (drop) running balance, color-coded by `balance_ranges`.

### Required test coverage (Vitest, all must stay green)
v1 core: day-31 monthly across Feb/Apr (clamping) · leap-year Feb 29 · semi-monthly across February · biweekly anchored mid-week across a month boundary · overrides move/change/skip · running balance with mixed signs · end_date cutoff and future start_date.
6A (T33–T34): every-2-weeks multi-weekday · days=[15,30] in February · interval-3 months · after_count · never→horizon · nth-weekday incl. last-X · generalized monthlyEquivalent.
6B (T37): linked-income boundaries incl. moved + skipped occurrence · own-schedule weekly cycles · fallback · income-ends extension · carryover on/off/negative · remaining/over · boundary-date entry · integer math.
6B (T43): future entry within the current cycle counts toward spent/remaining · a future entry in a LATER cycle doesn't leak into the current one · currentCycleEnd correctness (incl. null when the schedule ends) · a future boundary row reduced by known future spend in that specific cycle, floored at 0 · a future-dated entry renders as its own Forecast row without double-counting the running balance · a future-cycle entry reduces that boundary's row while still appearing as its own row.

## Pages & features

All pages require auth; unauthenticated users go to `/login`. Type colors: income green, debt orange, savings blue, extra purple, budget teal, bill default text.

1. **Auth**: sign up (email verification), log in, log out, password reset.
2. **Dashboard** (`/`): Total Balance, Total Monthly Bills, Total Monthly Income cards; per-balance breakdown; Remaining Debt + debt-free date + days until; Peaks and Drops grid. Greeting shows profile name, else email local part. *Planned (T40): compact "Budgets this cycle" card (name + mini bar + remaining).*
3. **Forecast** (`/forecast`): total balance + editable balance chips; the full occurrence list color-coded by `balance_ranges` (danger = dark, low = red tint, medium = white, high→highest = deepening green); row click opens Edit/Settle modal (edit → override; settle → actual amount/date → settlement) — except budget rows, which are not editable/settleable (T39; becomes editable in T42). Right sidebar: Budgets panel above Reminders (T39) — per budget: name, carryover badge when nonzero carried in ("+₱700 carried over"), progress bar (spent vs available; over state = full red bar + "Over by ₱X · next cycle starts at ₱Y"), "₱X left · resets {date}" or "resets with {income name} · {date}", quick Log-spend (amount, date=today, note); then reminders CRUD.
4. **Balances / Bills / Income / Debt / Savings / Extras** (`/balances`, `/bills`, `/income`, `/debt`, `/savings`, `/extra`): CRUD pages; each shows its summary total. *Planned (T35): all four recurring forms use the shared recurrence picker; each row shows a human-readable rule summary ("Every 2 weeks on Sat · until Apr 2030").*
5. **Budgets** (`/budgets`): CRUD + per-budget current-month entries + log spend (current page is the pre-6B baseline). *Planned (T38): replenish-source UI — modal with Name, Allocation, "Replenishes" segmented control ("With an income" → select from income items, helper: resets each time it lands / "On a schedule" → recurrence picker), carryover checkbox; per-budget current-cycle entries with delete; "needs a schedule" badge state.*
6. **History** (`/history`): settlements table — forecasted vs actual amount/date, forecasted balance, type. *Planned (T40): budget-tag rendering.*
7. **Settings** (`/settings`): profile, preferences (currency, balance ranges), log out, delete account (removes all user data).

### Recurrence picker (shared component, T35)
Used by Bills, Income, Debt, Savings, Budgets. Select with contextual presets computed from the chosen start date — "Monthly on the 21st", "Weekly on Tuesday", "Every 2 weeks on Tuesday", "Every 15th and 30th", "Monthly on the third Tuesday", "Custom…". Custom panel: Repeat every [N] [unit]; weekday chips (week); day list or nth-weekday (month); Ends: Never / On [date] / After [N] occurrences.

### Phase 7 — Notion-style redesign (restyle only, no behavior changes)
Notion palette (`#37352F` text, `#E9E9E7` hairlines, `#2383E2` accent, soft pill backgrounds), Inter, 14px base, full-width shell with 240px sidebar, tables with hairline dividers and hover `#F1F1EF`. Budget teal `#0B6E99`. Peaks and Drops keeps the v1 year×month pill grid.

**Edited-occurrence indicator** (added 2026-07-21, user request after verifying T42): any Forecast row whose occurrence differs from its rule — i.e. it has an `occurrence_overrides` or `budget_occurrence_overrides` row with a moved date or changed amount/name (skips never render, so they need no indicator) — shows a small icon next to the row name (pencil glyph or similar, muted slate, with a `title` tooltip like "Edited from its usual schedule"). Requires the forecast pipeline to expose an `edited` flag on `ForecastRow` at the merge layer where overrides are applied. Implemented as part of T29's Forecast restyle.

**Date display format**: replace every raw `YYYY-MM-DD` shown to the user with a human-readable format — full dates as "Jun 1, 2025" (Month Day, Year), month-only dates (e.g. a recurrence rule's "until" suffix, a debt-free date rounded to the month) as "Jun 2025" (Month Year). Storage/computation stays `YYYY-MM-DD` everywhere per the core design rules — this is purely a UI formatting change, which is why it's scoped to Phase 7 rather than done ad hoc. `recurrenceSummary.ts`'s internal `formatMonthYear` already produces the "Jun 2025" style; export it (or a shared equivalent) for reuse instead of duplicating. Applies wherever T28–T31 touch a page showing dates: Bills/Income/Debt/Savings row summaries and start/end dates, Forecast due dates, History forecasted/actual dates, Dashboard's debt-free date.

## Operations

- **Migrations are written as files** in `supabase/migrations/` and applied by Claude directly via the connected Supabase MCP integration (falls back to the user pasting into the SQL editor if that connection isn't available in a session — see CLAUDE.md "Hard rules"). Back up first via `pg_dump` only when real data is at stake.
- **The recurrence migration was split across two files**, each paste-and-run whole: `0004_recurrence_rules.sql` (add columns + backfill, non-destructive) and `0005_recurrence_drop_legacy_after_t35.sql` (enforce NOT NULL + drop legacy columns). Both are applied — 0004 on 2026-07-21, 0005 the same day once T35 was live in production.
- **Sample data**: `supabase/seed.sql` fills every feature with a realistic family dataset (run after 0004; re-runnable; all seed rows share the id prefix `00000000-0000-4000-a000-` for easy wiping).
- **Dev auto-login for browser verification** (added 2026-07-21): `GET /api/dev-login` signs in the dedicated test account so automated Browser-pane sessions reach a logged-in state without a password ever being typed. Dev-only twice over: it 404s unless `NODE_ENV` is development **and** `DEV_LOGIN_EMAIL`/`DEV_LOGIN_PASSWORD` exist in `.env.local` (gitignored; never set on Vercel). The route is listed in the middleware's `PUBLIC_PATHS` so a logged-out hit isn't bounced to `/login` first.

## Roadmap

### Before MVP launch (needs discussion)
- **Interactive onboarding experience for new users.** Flagged as a priority by the user (2026-07-21) — not yet scoped or designed. Needs a dedicated discussion with the user on approach/flow before it becomes a task with its own T-number.

### Done
- **Phases 0–4 (T1–T21)**: v1 built and deployed to Vercel — schema, pure engine + tests, all CRUD pages, Forecast/History/Dashboard, settings, responsive/polish, legal pages.
- **Phase 5 (T22–T23)**: integer-multiplier monthly totals (Bug #1); greeting name fallback (Bug #2).
- **T24–T25**: budgets v1 tables + engine (monthly-only, no rollover) — the baseline Phase 6B converts.
- **T41**: sample data seed (`supabase/seed.sql`).
- ~~T26–T27~~ **cancelled** — superseded by Phase 6B; never build them.

### Phase 6A — Flexible recurrence (done)
- [x] **T32.** Migration 0004: recurrence columns + enums + constraints + backfill; legacy-column drop split out into migration 0005 (runs only after T35). *0004 applied and seeded 2026-07-21; 0005 (drops legacy `frequency`/`day_of_month`/`weekday`) applied 2026-07-21 via the connected Supabase MCP integration, after T35 shipped to production. Verified via `list_tables` + `get_advisors` — legacy columns gone, `interval`/`unit`/`ends_type` now `NOT NULL`, all 18 rows intact, no new advisories.*
- [x] **T33.** Engine: day/week/month(days)/year expansion + ends rules; port existing tests; add 6A cases (list above). *`src/lib/engine/recurrence.ts`; originally dispatched per item alongside a legacy fallback path (new engine when migrated, old monthly/weekly/biweekly/semi-monthly functions otherwise) so pre-T35 forms kept working. That dispatch and the legacy functions were removed once migration 0005 dropped the columns they depended on — `recurrence.ts` is now the only expansion path.*
- [x] **T34.** Engine: nth-weekday resolution (incl. last-X) + generalized `monthlyEquivalent`; tests. *Ordinal resolution in `recurrence.ts`; generalized formula in `monthlyTotals.ts` (same migrated/legacy dispatch pattern as T33's `forecast.ts`).*
- [x] **T35.** Recurrence picker wired into all four CRUD forms; human-readable rule summary per row. *Browser-verified 2026-07-21 after a dev server restart; pushed and deployed to production the same day. Migration 0005 is ready for the user to run — see its header for steps.*

### Phase 6B — Budgets v2 (after 6A)
- [x] **T36.** ALTER migration on budgets (allocation, carryover, linked income, recurrence columns). Existing rows keep working via fallback until edited. *Migration 0006 applied 2026-07-21 via the connected Supabase MCP integration, additive-only (kept `monthly_allocation` in place rather than renaming, so the currently-deployed Budgets page needed zero code changes — chosen specifically after the T35→0005 outage). Verified via `execute_sql` — all 4 budgets backfilled correctly (`allocation = monthly_allocation`), `carryover_enabled=true`, `unit=null`. Drop-legacy migration 0007 written but not run until T38.*
- [x] **T37.** Engine rework: boundary/cycle/carryover model + tests (list above). *`src/lib/engine/budgetCycles.ts` + tests (20 cases covering the full required list). New module, not a rewrite of `budgets.ts` — see "Budgets v2 engine" above for why. Two real bugs caught and fixed before landing: (1) the fallback schedule's anchor was a fixed distant-past constant, which with carryover enabled would have silently accumulated decades of phantom "unused allocation" — fixed by anchoring to the budget's own `createdAt` instead; (2) a moved override could shift a boundary to either side of the query window and get miscounted — fixed by expanding generously past the window then filtering the *effective* (post-override) dates, not the raw ones. `Budget` type extended with the new fields (backward-compatible — `Pick<Budget,...>`-typed old functions are structurally unaffected); one existing test literal updated to match. 120/120 tests, tsc, eslint all clean. Not yet wired into forecast.ts/forecastData.ts — that's T39.*
- [x] **T38.** Budgets page: CRUD + replenish-source UI + entries + log spend. *Rewrote `BudgetModal`/`BudgetCard`/`actions.ts`/`page.tsx`: "Replenishes" segmented control (with-an-income select vs. on-a-schedule `RecurrencePicker` reuse), carryover checkbox, "Needs a schedule" badge, current-cycle entries with delete (also removes the matching settlement so History doesn't keep a phantom spend — matched by source_type/source_id/actual_date/actual_amount since there's no FK). `monthly_allocation` still written as a mirror of `allocation` on every save (stays DB `NOT NULL` until migration 0007 runs). Browser-verified 2026-07-21 by the user directly (Browser-pane automation was stuck against this project's dev server — known issue, see project memory — so verification was manual). Caught and fixed a real T37 bug in the process: linked-income/own-schedule boundaries walked the schedule's own history from its start date rather than the budget's, so a budget linked to a months-old income with carryover on and nothing spent accumulated one full allocation per phantom pre-existence cycle (₱145,000 available on a ₱5,000 budget, reported and confirmed fixed by the user). Fix: boundaries are now clipped to the most recent one at-or-before the budget's own `createdAt`. New regression test added; 121/121 tests, tsc, eslint clean. `budgets.ts` (v1 engine) now has no live callers left but is deliberately not deleted yet, and migration 0007 (drops `monthly_allocation`) deliberately not run yet — both deferred to a follow-up the user explicitly confirms, per the T35→0005 outage precedent.*
- [x] **T39.** Forecast: budgets panel + budget rows + quick log-spend. *`forecast.ts` swapped from `budgets.ts`'s old monthly-only `expandBudgetOccurrences` to T37's `expandBudgetCycleOccurrences` — budget rows never actually reached the Forecast page before this (the page didn't even fetch budgets), which is why linked-income budgets like Freelance-Aya-linked Groceries never showed up there. `forecastData.ts` now fetches budgets/budget_entries and exposes `budgets`/`budgetEntries`/`overrides`/`recurringItems` for the new sidebar `BudgetsPanel` (name, carryover badge, progress bar, status line, quick log-spend reusing T38's `logSpend` action with date hardcoded to today). Main forecast-list budget rows are now explicitly non-clickable (not editable/settleable per spec, and the generic Edit/Settle modal would have errored on them). Pulled the snake_case-DB-row-to-engine-type conversions T38 wrote into a shared `src/lib/budgetView.ts` so `BudgetCard.tsx` and `BudgetsPanel.tsx` don't duplicate them. Added a test proving recurringItems/overrides now actually reach budget cycle math (a moved income occurrence correctly shifts which cycle a logged spend counts against) - the old code path never used them at all. 122/122 tests, tsc, eslint clean. Browser-verified 2026-07-21 by the user directly.*
- [x] **T40.** Dashboard card + History budget tags + empty states; verify summary stats ignore budgets except through forecast rows. *Dashboard: "Budgets this cycle" card (`src/app/page.tsx`) — per budget, mini progress bar + "₱X left"/"Over by ₱X", using `computeBudgetCycleStatus` directly on `loadForecast()`'s already-engine-shaped `budgets`/`budgetEntries`/`recurringItems`/`overrides` (no snake_case conversion needed here, unlike the Budgets page). Empty state "No budgets yet." matching the existing Balances box pattern. History: added `budget` to `TYPE_COLOR` (teal) and render its Type cell as a small pill tag instead of plain text; Forecasted/Forecasted-date/Balance cells blank to "—" for budget rows since those are placeholder zeros (`forecasted_amount`/`forecasted_balance`=0, `forecasted_date`=`actual_date`) per the "no forecast-vs-actual comparison" rule above — Actual amount/date stay real. Verified summary stats (`totalMonthlyBills`/`totalMonthlyIncome`/`remainingDebt`) by inspection: they're computed strictly from `recurringItems`/`balances`, which structurally never include budget data — no code change needed, budgets only ever reach the Dashboard through the new card and existing forecast rows. 122/122 tests, tsc, eslint clean. Browser-verified 2026-07-21 by the user directly (Browser-pane automation stuck against this project's dev server again — fourth session in a row, see project memory).*
- [x] **T42.** Editable transactions + stale-override cleanup, logged 2026-07-21 (user request, after T39), both parts built same day, browser-verified manually by the user 2026-07-21 (both parts working). *Two deliberate scope calls made during planning and confirmed with the user before building: (1) only **future** budget boundary rows are editable — the "remaining this cycle" row (always dated today, a live status snapshot) has no override concept at all, not even a stale one; (2) `budget_entries` editing lives on the Budgets page only, not duplicated into the compact Forecast sidebar panel.*
  - **A — stale-override cleanup** (`src/lib/staleOverrides.ts`, `deleteStaleOverrides`): editing an item's rule directly from its own page checks each existing `occurrence_overrides` row against the *new* rule via a tight `expandRecurrenceOccurrences(rule, date, date)` probe and deletes only the ones the new rule no longer produces — everything still valid (including already-settled/skipped ones) is untouched, since removing an override never touches the separate, permanent `settlements` record. Wired into `updateIncome`/`updateBill`/`updateDebt`/`updateSavings` (the latter two share `src/lib/recurringItem.ts`). Also fixed a pre-existing gap while in these files: none of the four revalidated `/forecast` on any create/update/delete, so edits wouldn't show up there without a manual refresh — same fix already applied to budgets in T39.
  - **B — editable budget forecast rows + editable logged spends.** Migration `0008_budget_occurrence_overrides.sql` (applied 2026-07-21 via the connected Supabase MCP integration — purely additive new table, verified via `list_tables`/`get_advisors`, zero new advisories). `forecast.ts`'s budget merge loop applies these overrides to rows where `occurrence.date > today` only, exactly mirroring how `occurrence_overrides` are applied for recurring items (no signature change needed to `expandBudgetCycleOccurrences`/`budgetCycles.ts` itself — overrides are applied purely at the merge layer, same architecture as recurring items). `ForecastClient`'s row-click guard uses `row.originalDate > today` to distinguish editable future rows from the uneditable current-cycle row even after a move puts `dueDate` on/before today. `EditSettleModal` gets a budget-specific branch: no Edit/Settle toggle (Settle has no budget equivalent), an Amount+Date form, and a "Skip this occurrence" button — new `editBudgetOccurrence`/`skipBudgetOccurrence` actions. `budget_entries` gets `updateBudgetEntry` (Budgets page only, inline per-entry edit in `BudgetCard.tsx`), which also updates the entry's mirrored settlement row using the same no-FK field-matching trick `deleteBudgetEntry` (T38) already established. `updateBudget` now runs Part A's cleanup against `budget_occurrence_overrides` too, via a newly-exported `resolveBoundaries` (membership-check instead of a tight-window probe, since a budget's boundaries aren't a single expandable rule). `src/lib/budgetView.ts`'s `BudgetRow`/`toEngineBudget`/etc. reused directly in `updateBudget`'s cleanup path rather than re-derived. New tests: `recurrence.test.ts` (tight single-date window), `budgetCycles.test.ts` (`resolveBoundaries` membership-check usage), `forecast.test.ts` (move/skip a future row; current-cycle row proven immune even to an override dated exactly today). 129/129 tests, tsc, eslint clean. Verified manually by the user 2026-07-21.*
- [x] **T43.** Future-dated spends as a first-class feature (user decision 2026-07-21, upgrading Bug #3 from display fix to feature): entries dated after today count in all cycle totals AND render as their own Forecast rows on their entry date, editable/deletable directly from Forecast — full write-up in "Forecast integration" above. 139/139 tests, tsc, eslint clean. Browser-verified 2026-07-21 (via the new `/api/dev-login` route): logged a future-cycle spend, confirmed the target boundary row dropped by exactly that amount while the entry appeared as its own row, edited its amount from the Forecast modal (boundary row recalculated live), deleted it (boundary row and entry row both reverted cleanly, no phantom History settlement), and confirmed the Dashboard/Budgets page immediately reflect the corrected same-cycle totals for a pre-existing future entry (Bug #3's original repro case) — now closed.

### Phase 7 — Notion-style redesign (last)
- [ ] **T28.** Foundation: tokens, Inter, full-width shell, sidebar, base components — incl. recurrence picker, segmented control, progress bars.
- [ ] **T29.** Restyle Dashboard + Forecast (list, chips, modals, reminders, budgets panel) — incl. the edited-occurrence indicator icon (see style section above).
- [ ] **T30.** Restyle all CRUD pages (Balances, Bills, Income, Debt, Savings, Extras, Budgets).
- [ ] **T31.** Restyle Auth, Settings, History; consistency pass; screenshot review with the user before closing.

### Out of scope
Payments/subscriptions, mobile app, notifications, bank sync, multi-user families.
