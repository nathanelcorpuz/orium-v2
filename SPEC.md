# Orium — Product Spec

**The single source of truth.** Product definition, data model, engine rules, and the active roadmap live here. Working rules for Claude live in CLAUDE.md; open bugs in BUGS.md; build write-ups for finished tasks in ARCHIVE.md (indexed at the bottom of this file); the production-safety and staging plan in STAGING.md. (This file absorbed and replaced SPEC2.md in July 2026; task numbers are continuous across both.)

*Split 2026-07-31: this file had reached ~318KB, almost entirely completed-task write-ups, which made a file that must be read before every session too large to read in one pass. The history moved to ARCHIVE.md verbatim and nothing was reworded. Finished tasks are still findable here through the index in "Completed work" at the bottom.*

## What Orium is

Orium is a family cash-flow forecasting app. Users manually enter their account balances, recurring bills, income, debt payments, savings goals, one-off expenses, and spending budgets. Orium projects every upcoming transaction in chronological order and shows the **running future balance** at each date, color-coded by safety level. The core promise: *know exactly how much money you'll have on any future date, and never miss a bill.*

v1 (shipped) rebuilt the original Orium (github.com/nathanelcorpuz/orium) on a cleaner engine. The current work replaces its fixed 4-frequency recurrence with calendar-style rules (Phase 6A), restyles everything Notion-like (Phase 7), and adds Forecast/Dashboard clarity features (Phase 8/9). Budgets converted to replenishing cycles in Phase 6B, then — after that model proved confusing in practice — got rebuilt again as a simple running ledger in Phase 10 (in progress); see "Budgets v3" below for why.

## Core purpose (user, 2026-07-26)
**Orium exists to show you how much money you'll have at any point in the future.** Everything else - accounts, bills, income, debt, savings, budgets, misc, settling - is machinery serving that one question; the forecast's running balance *is* the product, not one page among several. User-facing copy should lead with that promise (a future balance you can point at) rather than generic budgeting or expense-tracking language, and settling should be explained as what keeps that number honest. Applied to the tour's opening/forecast steps and the welcome modal in T120.

## Writing style
- **No long em dashes (—) anywhere** - not in UI copy, seed/sample data, commit messages, or this file's own prose (code comments in this file are the one exception, to keep entries readable). Use a plain hyphen `-` instead. (User rule, 2026-07-25/26; enforced retroactively in seed data by T109, going forward by T113.) **Automatically enforced** by `src/lib/writingStyle.test.ts` (T113), which fails `npm run test` naming the exact file and line. That check covers `src/` and the re-runnable `supabase/*.sql` scripts; `supabase/migrations/` is deliberately outside it (an applied migration records what really ran, so it isn't rewritten to satisfy a later style rule), as are this file and the other project docs, whose historical entries still contain them.

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
6. **Make sure any edge cases are handled properly when fixing bugs or adding/editing new features.**

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
| `ends_type` | enum | `never` \| `on_date` \| `after_count` (`never` stays available except for Debt/Savings, T72 — as of T85, Phase 12, it's implicitly bounded by the forecast horizon, which is itself capped at `MAX_TRACKING_YEARS` from today; an explicit `on_date`/`after_count` end is separately rejected app-level if it would resolve past that same cap, no DB constraint) |
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
The budget ledger. `id, user_id, budget_id (fk cascade), entry_date, amount (bigint > 0, always a positive magnitude), note, created_at`. Unchanged by 6B. Plus (Phase 10, migration 0009, added 2026-07-23): `direction (text, 'incoming' | 'outgoing', not null, no default — every insert must say which)`. Existing rows backfilled `'outgoing'` (they're all past logged spends, so their meaning is unchanged).

### `reminders`
`id, user_id, text, created_at`.

### `preferences`
One row per user, created on signup. `user_id pk, currency (default '₱'), balance_ranges (bigint[] — 5 ascending centavo thresholds: [danger, low, medium, high, higher]; balance ≤ ranges[0] = danger, above ranges[4] = highest)`.

## The forecast engine (`src/lib/engine/`)

Pure functions. `generateForecast({ balances, recurringItems, overrides, oneOffs, budgets?, budgetEntries?, today, horizon }) → ForecastRow[]` where each row is `{ sourceType, sourceId, originalDate, name, amount, dueDate, type, runningBalance }`.

Pipeline: expand each recurring rule from `max(today, start_date)` to the rule's end (capped at horizon) → apply overrides (move/change/skip) → merge one-offs dated today or later → merge budget rows (below) → sort by due date, then incoming-before-outgoing within a date (stable beyond that) → running balance = sum of `balances.amount` plus cumulative signed amounts, always integer centavos. Occurrences strictly before `today` are excluded (they belong in settlements).

**Same-day ordering (T148):** rows sharing a `dueDate` put incoming amounts (`amount >= 0`) ahead of outgoing ones, so a salary landing on the 5th is credited before a bill due the same day is deducted - the running balance never shows a dip that wouldn't really happen. Rows with the same date *and* the same sign keep insertion order (`Array.prototype.sort` is stable from ES2019).

**Past-due occurrences (open question, Bug #11 / T150):** the "strictly before today" exclusion above is under active revision. Production use showed that an unsettled item whose date has passed silently disappears from the forecast and stops counting against the running balance, which hides a real obligation. T150 carries the decision on what replaces this rule; until it lands, the exclusion above is what the engine actually does.

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

### Budgets v2 engine (T37, superseded by Budgets v3 below as of T57 — `budgetCycles.ts` and this whole model are deleted; kept here only as a historical record of how it worked)
A budget replenishes at each **cycle boundary**; everything derives from logged spends — no manual resets. `budgets.ts`'s T24/T25 monthly-only functions (`currentMonthBudgetStatus`, `expandBudgetOccurrences`) are kept exactly as they were rather than rewritten in place — they're still what the currently-deployed Budgets page calls, and per the T35→0005 incident this session isn't taking chances with a caller it can't fully verify mid-task. T38/T39 do the actual cutover once the UI can produce v2 data; `budgets.ts` gets deleted then, mirroring how `monthly.ts`/`interval.ts`/`semi-monthly.ts` were deleted only once nothing called them.

**Boundary source:** linked income set → that income's *effective* occurrence dates (after overrides — moved dates move the boundary; skipped occurrences produce no reset, the cycle extends). Else own recurrence set → its occurrences. Else (e.g. linked income deleted) → fallback monthly on the 1st + a "needs a schedule" badge in the UI. After the final boundary, the last cycle extends to the horizon.

**Cycle math:** cycle k spans [boundaryₖ, boundaryₖ₊₁). Entries belong to the cycle containing entry_date; boundary-date entries belong to the **new** cycle; entries before the first boundary count toward the first cycle. `available₀ = allocation`; `availableₖ = allocation + (carryover_enabled ? availableₖ₋₁ − spentₖ₋₁ : 0)` — carryover may be negative. `remaining = max(available_current − spent_current, 0)`; `over = max(spent_current − available_current, 0)`.

**Forecast integration:** current cycle → one row per budget, "{name} — remaining this cycle", amount −remaining, dated today, omitted when remaining = 0. Each future boundary within the horizon → "{name} — allocation", amount −allocation, dated the boundary. Budget rows are type `budget` (teal), never settleable (logging a spend covers that). The current-cycle row also stays uneditable — it's a live status snapshot always dated today, not a discrete future transaction. Future boundary rows *are* editable (T42): move date, change amount, or skip, via `budget_occurrence_overrides` (keyed `budget_id`+`original_date`, mirroring `occurrence_overrides`), applied in `forecast.ts`'s merge loop the same way recurring-item overrides are.

**Future-dated spends (T43):** an entry dated after today counts toward `spent`/`remaining`/`over` for whichever cycle it actually falls in — current or a later one — everywhere those appear (Budgets page, Dashboard card, current-cycle forecast row); the entries list and the totals now always agree (was Bug #3). `computeBudgetCycleStatus` gained `currentCycleEnd` (the next boundary, resolved via `horizon` — defaulted to a ~1yr lookahead for callers with no real forecast horizon, e.g. `BudgetCard.tsx`/`BudgetsPanel.tsx`/the Dashboard card; `expandBudgetCycleOccurrences` passes the real one) so a future-dated entry can be bounded to the correct cycle instead of leaking into whichever one is "current". Each future-dated entry also renders as its own Forecast row (sourceType `budget_entry`, sourceId = the entry's own id) on its `entry_date` — name `"{budget} - {note}"` matching the settlement-naming convention, amount −entry amount — so the balance dips on the day the money actually leaves. Whichever boundary row (current-cycle "remaining" or a future "allocation") the entry would otherwise have inflated is reduced by exactly its amount (floored at 0) so the two never double-count: `futureBudgetEntries(entries, budgetId, today)` in `budgetCycles.ts` is the shared helper both `expandBudgetCycleOccurrences` (for the subtraction) and `forecast.ts` (for the standalone rows) use. `budget_entry` rows are editable/deletable directly from the Forecast (user decision 2026-07-21, consistent with T42's boundary-row editability) — `EditSettleModal` gets an amount+date+note form reusing the *existing* `updateBudgetEntry`/`deleteBudgetEntry` actions from `budgets/actions.ts` rather than new ones. `BudgetCard.tsx`'s current-cycle entries list is now bounded above by `currentCycleEnd` too — previously unbounded, so an entry from a *further* future cycle used to leak into the wrong card even though the totals never counted it (part of the Bug #3 root cause).

**Logging a spend** writes a `budget_entries` row AND a settlement (source_type `budget`, type `budget`, name = budget name + note, actual_amount = −amount, actual_date = entry_date, forecasted fields mirror actuals, forecasted_balance = 0). History renders budget rows with a "budget" tag, no forecast-vs-actual comparison.

### Budgets v3 — running ledger (Phase 10, live as of T57 — this is the current, only budget model)
User feedback 2026-07-23: the cycle-boundary model above was confusing in the Forecast table (reservation rows that aren't real transactions) and didn't match how people actually think about a budget — a pool of money, not a recurring reset. Rebuilt as a simple ledger in `budgetLedger.ts` (T54), staged in alongside the untouched `budgetCycles.ts` at first (same "build alongside, cut over once the UI can produce/consume it" pattern T37 used for `budgets.ts`) and fully cut over by T57, which deleted `budgetCycles.ts` and everything that depended on it.

**The model:** no cycle boundaries, allocation targets, or carryover math. Every `budget_entries` row is `'incoming'` (a replenishment) or `'outgoing'` (a logged spend, or a manual take) against a budget's running total. `computeBudgetBalance(entries, budgetId, asOf) = Σ incoming − Σ outgoing` for every entry dated `asOf` or earlier — carryover is implicit (nothing ever resets) and overspending is allowed to go negative, no clamping, exactly like a real account. A budget optionally links to an income (`linked_income_id`) with an `allocation` amount (how much gets added when it replenishes); **replenishment fires when that linked income's occurrence is actually settled** (T56) — an `'incoming'` entry for `allocation` gets written then, dated at the actual settle date, not a projected one. A budget with no linked income instead gets manual "Add funds"/"Take funds" actions (T55), each just another `'incoming'`/`'outgoing'` entry. There's no "replenishes on its own schedule" option anymore — every non-income budget is manual. `carryover_enabled` and the own-schedule recurrence columns are gone from `budgets` entirely (migration 0010, T57).

**Forecast integration:** budget rows in the Forecast are *only* future-dated ledger entries (`futureBudgetLedgerEntries` — same shape T43 established for future spends, now covering incoming entries too, e.g. a future-dated manual add or a future replenishment), never a projected boundary/reservation row — there's nothing to project, since the running total simply *is* whatever's been entered so far. No `budget_occurrence_overrides`, no uneditable "remaining this cycle" row, no T45 reservation-badge/grouping logic (all gone with the boundary rows they existed to soften). The Forecast sidebar's `BudgetsPanel` is gone — budget status and quick actions live on the Budgets page (T55) instead.

**Logging a spend / adding / taking funds** all write a `budget_entries` row *and* a matching settlement (`actual_amount` sign follows direction — incoming positive, outgoing negative) so History keeps a full record regardless of which kind of entry it is.

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
2. **Dashboard** (`/`): Total Balance, Total Monthly Bills, Total Monthly Income cards; per-balance breakdown; Remaining Debt + debt-free date + days until; a "Budgets" card (name + running balance, red when negative — T57); Peaks and Drops grid. Greeting shows profile name, else email local part.
3. **Forecast** (`/forecast`): total balance + editable balance chips; the full occurrence list color-coded by `balance_ranges` (danger = dark, low = red tint, medium = white, high→highest = deepening green); every row is clickable, opening Edit/Settle for recurring/one-off rows or a direct amount/date/note edit for a budget ledger entry (T57 — every budget row is now a real transaction, never a projection). Right sidebar: just Reminders CRUD (the old Budgets panel moved to the Budgets page itself, T55).
4. **Balances / Bills / Income / Debt / Savings / Extras** (`/balances`, `/bills`, `/income`, `/debt`, `/savings`, `/extra`): CRUD pages; each shows its summary total; all four recurring forms use the shared recurrence picker with a human-readable rule summary per row ("Every 2 weeks on Sat · until Apr 2030").
5. **Budgets** (`/budgets`): CRUD + a running balance per budget (red when negative) + a month-filterable entries list + Log spend, plus Add funds/Take funds for budgets not linked to an income (T55, Phase 10).
6. **History** (`/history`): settlements table — forecasted vs actual amount/date, forecasted balance, type (budget rows shown as a pill tag).
7. **Settings** (`/settings`): profile, preferences (currency, balance ranges), log out, delete account (removes all user data).

### Recurrence picker (shared component, T35)
Used by Bills, Income, Debt, Savings, Budgets. Select with contextual presets computed from the chosen start date — "Monthly on the 21st", "Weekly on Tuesday", "Every 2 weeks on Tuesday", "Every 15th and 30th", "Monthly on the third Tuesday", "Custom…". Custom panel: Repeat every [N] [unit]; weekday chips (week); day list or nth-weekday (month); Ends: Never / On [date] / After [N] occurrences.

### Phase 7 — Notion-style redesign (restyle only, no behavior changes)
Notion palette (`#37352F` text, `#E9E9E7` hairlines, `#2383E2` accent, soft pill backgrounds), Inter, 14px base, full-width shell with 240px sidebar, tables with hairline dividers and hover `#F1F1EF`. Budget teal `#0B6E99`. Peaks and Drops keeps the v1 year×month pill grid.

**Edited-occurrence indicator** (added 2026-07-21, user request after verifying T42): any Forecast row whose occurrence differs from its rule — i.e. it has an `occurrence_overrides` or `budget_occurrence_overrides` row with a moved date or changed amount/name (skips never render, so they need no indicator) — shows a small icon next to the row name (pencil glyph or similar, muted slate, with a `title` tooltip like "Edited from its usual schedule"). Requires the forecast pipeline to expose an `edited` flag on `ForecastRow` at the merge layer where overrides are applied. Implemented as part of T29's Forecast restyle.

**Date display format**: replace every raw `YYYY-MM-DD` shown to the user with a human-readable format — full dates as "Jun 1, 2025" (Month Day, Year), month-only dates (e.g. a recurrence rule's "until" suffix, a debt-free date rounded to the month) as "Jun 2025" (Month Year). Storage/computation stays `YYYY-MM-DD` everywhere per the core design rules — this is purely a UI formatting change, which is why it's scoped to Phase 7 rather than done ad hoc. `recurrenceSummary.ts`'s internal `formatMonthYear` already produces the "Jun 2025" style; export it (or a shared equivalent) for reuse instead of duplicating. Applies wherever T28–T31 touch a page showing dates: Bills/Income/Debt/Savings row summaries and start/end dates, Forecast due dates, History forecasted/actual dates, Dashboard's debt-free date.

## Operations

- **`npm run build` is always run by Claude, never the user** (2026-07-24 — mirrored in CLAUDE.md's session workflow). If a dev server is already active on :3000, Claude stops it, runs the build, then restarts the dev server afterward rather than asking the user to run it themselves.
- **Migrations are written as files** in `supabase/migrations/` and applied by Claude directly via the connected Supabase MCP integration (falls back to the user pasting into the SQL editor if that connection isn't available in a session — see CLAUDE.md "Hard rules"). Back up first via `pg_dump` only when real data is at stake.
- **The recurrence migration was split across two files**, each paste-and-run whole: `0004_recurrence_rules.sql` (add columns + backfill, non-destructive) and `0005_recurrence_drop_legacy_after_t35.sql` (enforce NOT NULL + drop legacy columns). Both are applied — 0004 on 2026-07-21, 0005 the same day once T35 was live in production.
- **Sample data**: `supabase/seed.sql` fills every feature with a realistic family dataset (run after 0004; re-runnable; all seed rows share the id prefix `00000000-0000-4000-a000-` for easy wiping).
- **Dev auto-login for browser verification** (added 2026-07-21): `GET /api/dev-login` signs in the dedicated test account so automated Browser-pane sessions reach a logged-in state without a password ever being typed. Dev-only twice over: it 404s unless `NODE_ENV` is development **and** `DEV_LOGIN_EMAIL`/`DEV_LOGIN_PASSWORD` exist in `.env.local` (gitignored; never set on Vercel). The route is listed in the middleware's `PUBLIC_PATHS` so a logged-out hit isn't bounced to `/login` first.

### How to test the onboarding flow (recipe - hand this to the user verbatim whenever they ask)
Added 2026-07-26 at the user's request, so the steps live here instead of in their head. Both routes are dev-only and send no email, so this can be repeated as often as needed (see T120/T121, and the "email rate limit exceeded" problem that made this necessary).

1. **Become a brand-new user:** open `http://localhost:3000/api/dev-new-account`. This creates a real, already-confirmed account and signs into it. The **Welcome to Orium** box should appear, with a "0 of 6" Getting started checklist and zero balances behind it.
2. **Pick a path to test.** The modal offers exactly three. Re-open the same link before each one so every run starts clean:
   - *Take the short tour* - the 6-step walkthrough: "Welcome to Orium" (centred, no highlight), then Accounts, Bills, Forecast, Settings, and back to the Dashboard's Peaks and Drops. It simply ends on the last step. **There is no post-tour prompt** - T123 deleted it, along with the tour's "Prefer step-by-step setup?" link, because between them the app was asking the same question up to four times.
   - *Start guided setup* - goes to `/setup`, a normal page (not a gate), stepping through accounts, bills and income, then debt, savings, budgets and misc as optional. Every step has "Exit setup for now", and the nav stays usable throughout.
   - *Maybe later* - skips onboarding; check it stays skipped while navigating, and that the modal does not return.
3. **To test that progress survives a logout:** start the tour, click Next once or twice, log out, then log back in with the account's own address (shown in the URL bar after step 1, and in the sidebar) plus `DEV_LOGIN_PASSWORD`. The tour must resume on the same step, not restart (T119).
4. **Clean up afterwards:** open `http://localhost:3000/api/dev-new-account?cleanup=1`. It deletes only accounts this route created (matched on the `orium-dev+` prefix), so the real test account can never be caught by it.
5. **Return to the normal seeded account:** open `http://localhost:3000/api/dev-login`.

Quicker alternative when a full fresh account isn't needed: `http://localhost:3000/api/dev-reset-onboarding` resets the *current* account's onboarding columns only (add `?wipe=1` to also clear its financial rows). Not a faithful new user - currency, balance thresholds, tier labels, dismissed form tips and the sample-data stamp all survive it - so prefer step 1 when testing the real first-run experience.

## Roadmap

**Task order is non-negotiable: work strictly top to bottom through this section — always the topmost unchecked (`- [ ]`) item.** Never skip ahead or cherry-pick a later task without the user explicitly saying so. (Mirrored in CLAUDE.md's session workflow.)

### Before MVP launch (needs discussion)
- ~~Interactive onboarding experience for new users~~ — discussed and scoped 2026-07-24. Decisions locked with the user: seeded sample data + reset/restore actions rather than a separate sandbox for v1 (a switchable demo sandbox is a possible follow-up if real-user testing shows demand — deliberately not scoped now); spotlight tours for the Dashboard/Forecast intros plus a persistent "Getting started" checklist for the add-data steps; all hand-built, no tour library without explicit approval. Now **Phase 16 (T96–T100)**.
- **Post-build milestones (logged 2026-07-24 — milestones, not tasks):** after Phases 13–16 ship: (1) the user's wife uses the app for 1–2 weeks and feedback is collected; (2) iterate on that feedback; (3) then a launch discussion — landing page, first users, marketing, and whether a mobile app comes before or after launch.
- ~~Per-item progress bars for Debt/Savings goals~~ — scoped 2026-07-24 and moved to the roadmap as **T72** (Phase 12). The open "what does progress mean" question was resolved by the user: progress is occurrence-count-based (occurrences settled / total occurrences), made computable by requiring every debt/savings item to have an ending.
- **A more insightful History page.** Flagged by the user (2026-07-23): History should help users understand past spending patterns and cash flow, not just list settlements. Not yet scoped — needs a discussion on what specific insights (spending by category over time? month-over-month comparison? something else?) before it becomes a T-number. Reaffirmed 2026-07-25 ("history - graphs insights") — same ask, still not yet scoped.
- **Phone notifications.** Raised 2026-07-25, explicitly informational only per the user ("don't set them as T yet, only informational once these start") — not yet scoped, and directly in tension with the existing "Out of scope" list below, which already names notifications. Needs a decision on whether that exclusion still holds before this becomes a real task.
- **Beta launch strategy.** Raised 2026-07-27, moved here from REMINDER.md 2026-07-28: sizing how many free beta users the current Supabase free-tier project can actually support; how to vet sign-ups as legitimate (currently leaning toward posting to the user's own Facebook page for friends/family, wary of Reddit's strict/unfamiliar-with-Filipino-subreddits self-promotion norms); the overall sequencing (beta ~3 months → act on feedback and build paid features 1-2 months → public launch with paid features → mobile app timing, possibly after a browser-only launch). A landing page draft already exists (`landing-page.html`, repo root). Not yet scoped into tasks — needs an actual discussion session, not a unilateral decision, since it's business/product strategy rather than an engineering call.
- **GTM playbook.** Raised 2026-07-27, moved here 2026-07-28: the user has a private GTM playbook they'll share for an ongoing planning discussion (explicitly **not** to be included in the public GitHub source — keep it out of any committed file). Claude should ask the user to send it when starting this discussion. Feeds into the beta launch strategy item above and into scope decisions on the future-features list below.
- **Future pre-launch feature list.** Raised 2026-07-27, moved here 2026-07-28 — the user asked to spec four things before public launch: (1) notifications (already covered by the Phone notifications bullet above), (2) import / templates / a guided first-time build so setup isn't solo, (3) sharing the app with a partner, (4) "what-if" scenarios (e.g. "what if we buy the car"). Two of these directly conflict with the existing "Out of scope" list below - **partner sharing conflicts with "multi-user families"** the same way phone notifications already conflicts with "notifications" - so both need an explicit scope decision (keep the exclusion, or lift it for these specific cases) before becoming real tasks. Import/templates and what-if scenarios don't conflict with anything currently out of scope and are the more straightforward candidates to scope first.
- **Production safety, staging, and inviting real users.** Raised 2026-07-30, triaged 2026-07-31. The user is now running Orium in production against their own real finances under `nathanelcorpuz@gmail.com`, and wants (a) a safe place to test changes before they reach that data, (b) their real data available as realistic test data, duplicated into something like `nathanelcorpuz+test@gmail.com`, and (c) to start inviting specific other users. **A written one-pager covering all three lives in `STAGING.md`** (repo root, added 2026-07-31) with a recommended zero-cost setup; what remains here is the user's decision on which option to adopt, since it affects cost and workflow. Note the internal tension the one-pager resolves: "my production data must stay untouched unless I explicitly demand it" and "always pull my up-to-date data to use as test data" pull in opposite directions, so the copy has to be strictly one-way (prod → test, never back).
- **Raise the tracking horizon from 5 years to 25.** Raised 2026-07-30. This directly reverses **T146**, which the user confirmed on 2026-07-28 as "keep the existing from-today behavior." Needs an explicit re-decision rather than a silent flip. Two things are entangled in the single constant `MAX_TRACKING_YEARS` (`src/lib/engine/date-utils.ts`, currently `5`): the *validation* cap on how far out a start/end/due date may be set, and the *forecast horizon* actually expanded and rendered (`src/lib/forecastData.ts`). Raising the first is cheap and probably what the user wants (a 20-year mortgage should be enterable). Raising the second means a daily-recurring item expands to roughly 9,100 rows, times every item, computed per page load and rendered into one table - a performance and usability problem, not just a number change. Recommendation to put to the user: split the constant into `MAX_ENTRY_YEARS = 25` and a separate, smaller rendered horizon, rather than moving one number to 25.
- **Email notifications (three separate asks, all currently out of scope).** Raised 2026-07-27 through 2026-07-30: (1) a 12am email whenever any forecasted transaction falls due that day, (2) an alert for past-due unsettled transactions (the notification half of Bug #11 / T150), (3) the user's mental model of "one email with multiple toggles" rather than several separate emails. Together with the earlier "Phone notifications" bullet above, that is four requests against an "Out of scope" line that still reads *notifications*. That exclusion is now clearly stale and should be lifted deliberately. Beyond the scope call there is an infrastructure decision: a 12am send needs something running on a schedule (a cron trigger plus a transactional email provider), which is new infrastructure, a new dependency, and probably a new cost - none of which are covered by the fixed stack in this file. The existing Operations note about custom SMTP for signup email volume is related and should be settled at the same time.
- **User-defined categories.** Raised 2026-07-30: alongside the built-in types (bills, income, debt, savings) the user wants their own - birthdays, occasions, events - for money that is set aside and predictable but is not a bill. Their own suggested shape is "main categories" (the existing fixed set) plus "custom categories" (user-created). This is a data-model change: `recurring_items.type` is a DB-enforced enum, and type drives colors, per-type pages, per-type summary stats, and the debt/savings goal logic. Worth deciding whether custom categories are a genuine new *type* or just a **label/tag** on existing items - the second is dramatically cheaper and may cover the actual need (a birthday fund is arguably a Savings item with a tag).
- **Forecasted balance per account.** Raised 2026-07-30, and the user explicitly flagged it as needing discussion rather than a build. Today the forecast produces one running balance across all accounts; this would additionally answer "what will *this specific account* hold on a given future date." Feasible in principle since T71 already links most items to an account, but two things need answering first: what happens to rows with **no** linked account (excluded, or spread somehow), and whether per-account balances are allowed to be individually negative while the total stays healthy. The user's own scoping is helpful and should be honored: desktop only, surfaced on hover over an account, deliberately not on mobile.

### Carried over from Phase 19
One task from the pre-launch sweep is still open. Everything else in Phases 6A-19 is done and archived.

- [ ] **T138.** Fix: guided setup throws a network error after entering 10+ bills and advancing to the next step. *Investigated 2026-07-28, not yet reproduced: added 11 bills total (9 via the regular Bills page, matching the reported count) then loaded `/setup` fresh - it correctly resolved straight to "Step 3 of 7: Add income" with no error. Also drove the wizard's own "Add another income" -> reopen -> save cycle (the actual code path the report describes, distinct from the regular page) twice in a row with no error. Checked browser console and dev server logs throughout both attempts - clean. Left open rather than closed, since "not reproduced yet" isn't "doesn't exist" - a transient Supabase hiccup or a genuinely higher item count could still trigger it. Needs more specific repro info next time it happens: the exact error text/toast, whether it's a browser-level "Failed to fetch" or an app-level message, and roughly how many items were in the step at the time.*

### Phase 20 - Post-production backlog (scoped 2026-07-31, not yet built)
Everything below came from REMINDER.md's untriaged backlog (items added 2026-07-29 through 2026-07-30, 30 in total). Checked against the whole of this file for duplicates first: no true duplicates, but several items turned out to overlap existing work in ways worth recording - the "budget accounts" cluster is one coherent feature, not seven items (split out as Phase 21 below), the "yearly repeats" ask is a discoverability gap rather than a missing capability (same finding as T144), and two items turned out to describe **bugs in live production data** rather than feature requests.

**Ordering principle for this phase:** the app is now running against the user's real finances, so accuracy bugs come before features. T150 and T151 are both cases where the number Orium shows is wrong in a way that could drive a real financial decision, and they sit at the top for that reason. Five further items raised in the same batch are *not* listed here at all - horizon 5 → 25 years, email notifications, custom categories, per-account forecasted balance, and production/staging safety - because each needs a product decision before it can be a task; all five are written up in "Before MVP launch (needs discussion)" above.

- [x] **T148.** Forecast: same-day rows sort income before deductions, so a salary landing on the 5th is credited before a bill due the same day. *Shipped 2026-07-29 in commit `c6b85d3` ahead of this triage, which is why it has no build write-up of its own - documented here retroactively so the roadmap and `git log` agree. `generateForecast`'s final sort in `src/lib/engine/forecast.ts` gained a sign comparison between rows sharing a `dueDate` (`amount >= 0` sorts first), keeping insertion order for rows matching on both date and sign. Engine semantics section above updated to match, 2026-07-31. **Left an untested engine rule behind** - see T154.*
- [x] **T149.** Budgets: "Add funds" and "Take funds" show on every budget, not only budgets without a linked income. *Shipped 2026-07-29 in commit `f7aee0d` ahead of this triage, documented retroactively for the same reason as T148. `BudgetCard.tsx` dropped its `isManual` guard around the two buttons. The original Phase 10 design deliberately gated them (T55: income-linked budgets replenish automatically, so manual top-ups were assumed unnecessary), but every one of the user's real budgets is income-linked, which meant the buttons were invisible in actual use. Manual correction is now available regardless of replenish mode.*
- [ ] **T150.** Fix: the Forecast silently drops past-dated transactions that were never settled (**Bug #11**, user-reported 2026-07-30 from real production data). An unsettled Jul 29 Misc payment vanished from the forecast on Jul 30, and with it a genuine negative balance around Sep 1 - the app reported the user as solvent when they were not. *Carries a spec decision, which is why it is a task rather than a straight fix: the engine's current "occurrences strictly before `today` are excluded" rule (see "The forecast engine" above) has to be replaced with something explicit. Recommended shape, to confirm with the user before building: past-due unsettled occurrences stay in the forecast indefinitely until settled or deleted, render at the top of the table under a distinct past-due treatment (the user asked for them to be visually alarming), and count against the running balance from the start rather than being folded into the opening balance. Open sub-questions: how far back to look (all history, or a bounded window - a rule that started 3 years ago and was never settled would otherwise generate hundreds of past-due rows), and whether recurring occurrences are treated the same as one-offs here. The email-notification half of the user's report is deliberately **not** in this task - it depends on the notifications scope decision listed above.*
- [ ] **T151.** Fix: settling an income linked to a budget double-counts the allocation (**Bug #14**, found 2026-07-31 while scoping the user's "20,000 income minus 1,000 budget = 19,000" request). Settling a ₱20,000 income with a ₱1,000 linked budget puts the full ₱20,000 in the cash account *and* ₱1,000 in the budget ledger; the Forecast had already projected the ₱1,000 as leaving (T59), so the real balance ends up ₱1,000 higher than the forecast promised. *The user filed this as a feature request ("the total to add will now just be 19000"); it is actually a description of correct behavior that the code does not implement. `settleOccurrence` applies `actualAmount` to the chosen account once, up front, and the linked-budget loop below it never removes the allocation from that account. Fix is contained (a second `applyToBalance` call, or netting the allocation before the first one), but two things need settling first: confirm the behavior against the user's live account rather than assuming from code, and decide whether historical balances need a one-time correction for settles already made or only a forward fix. Should also gain engine or action-level test coverage, since this is money movement.*
- [ ] **T152.** Fix: the Forecast's balance chips open an account without its connected finances (**Bug #12**, user-reported 2026-07-30). *`ForecastClient.tsx` renders the shared `BalanceModal` without a `connectedItems` prop, so the T71 links that the Balances page shows are simply absent there. Documented in `BalanceModal.tsx` as an intentional shortcut at the time; the user now expects parity. Fix is to fetch and thread the connected-items list into the Forecast page, not to change the modal.*
- [ ] **T153.** Fix: "First goes negative" is the wrong label whenever the danger threshold is above zero (**Bug #13**, user-reported 2026-07-30). *Both call sites render `findFirstDangerPoint(..., balanceRanges[0], ...)` - by its own name a danger-threshold crossing, not a zero crossing - and pass the figure through `Math.abs()`, so a positive ₱3,000 danger balance prints as "₱3,000.00" under the word "negative". The user's preferred fix (of the two they proposed) is conditional wording: "negative" only when the figure is genuinely below zero, otherwise a danger-tier phrasing. T76/T80 already built the tier machinery and the user-editable tier labels, so this is reusing `balanceRangeTier`, not writing new logic.*
- [ ] **T154.** Add engine test coverage for T148's same-day ordering rule. *T148 changed `generateForecast`'s sort without adding a test, which leaves a project rule unmet: CLAUDE.md requires the engine keep passing coverage of the cases listed in this file, and same-day income-before-deduction is now one of those cases. Small and purely additive - a case with an income and a bill sharing a due date asserting order and the resulting running balance, plus a same-date same-sign case asserting insertion order still holds.*
- [ ] **T155.** Forecast row polish: bold the dates, and show a comment-bubble icon on any row whose underlying record has a comment, revealing that comment on hover. *Two independent asks from the same batch, grouped because they touch the same rows in the same file. The comment half needs `comments` threading through to `ForecastRow` (it is on `recurring_items` and `one_off_items` but not currently carried into the forecast), so it is slightly more than a styling change. Reuse the existing edited-occurrence indicator's icon-plus-title pattern rather than inventing a new hover mechanism.*
- [ ] **T156.** Show each item's start date on the Bills, Income, Debt and Savings list rows. *Currently the row summary shows the recurrence rule and end date but not when the item began, which the user wants when reviewing a list. `recurrenceSummary.ts` already formats the "until" suffix; extend the same summary rather than adding a separate field to each row.*
- [ ] **T157.** Recurrence picker: add a "Yearly" preset, and make "Ends: never" the default for Bills and Income. *Yearly recurrence is already fully supported by the engine (`unit = 'year'`) and reachable through the Custom panel - this is the same discoverability gap T144 identified for two-day-a-month rules, so it is a preset button, not new capability. The "never" default is separate and Bills/Income only: Debt and Savings deliberately require an ending (T72) because their progress bars are occurrence-count based, so this must not change their default.*
- [ ] **T158.** Forecast: expand a clicked transaction to show its full detail, hidden behind a "see more" control. *User's list: type, comments inherited from the finance record, date, connected account, and forecasted balance, in addition to the name and amount already shown. Depends on the same `comments` threading as T155, so build T155 first. Fits the existing Edit/Settle modal rather than a new surface.*
- [ ] **T159.** Comprehensive filters on finance records (Bills, Income, Debt, Savings, Budgets, Misc). *The user asked for "a comprehensive upgraded filter" without specifics. Current state is an amount-range filter (T50-era) plus the T143 amount sort; the obvious gaps are filtering by connected account, by date range, by recurrence frequency, and free-text name search. Needs a short scoping conversation on which of those actually matter before building, rather than shipping every axis at once.*
- [ ] **T160.** Give completed debts and savings goals somewhere to go once fully settled, separate from History. *User's framing: "maybe in their own pages." Today a finished goal either lingers in its list or is only visible as settlements. Decide between an archive section on the existing page and a separate route; the existing per-item progress work (T72) already knows when an item is complete, so the detection is done.*
- [ ] **T161.** Forecast desktop: adopt the mobile date-grouped layout - one date header with that day's transactions beneath it, dropping the date column entirely. *User request 2026-07-30, explicitly to make desktop match mobile. Interacts with T150's past-due grouping and with T155's row polish, so it is sequenced after both to avoid restyling the same rows twice.*
- [ ] **T162.** Activity log foundation: a table recording every create, edit, delete and settle, plus completion timestamps on reminders. *The user asked for this both as "a logs feature where all changes anywhere is logged" and, separately, as the data behind T163's updates feed - they are one mechanism with two surfaces, so the log is built first and T163 reads from it. Needs a new table with `user_id` and owner-only RLS like every other table, and a decision on write mechanism: application-level writes in each server action (explicit, easy to reason about, easy to forget) versus Postgres triggers (complete by construction, but logic living outside the app). Recommend application-level, since every mutation already funnels through a small number of server actions.*
- [ ] **T163.** "What's changed since you last logged in" feed, so a couple sharing one account can stay in sync. *Explicitly single-account for now per the user, which keeps it clear of the "multi-user families" exclusion. Reads T162's log and needs a per-user "last seen" marker. Build only after T162.*
- [ ] **T164.** Family calendar view built on the forecast - yellow for forecast transactions, green for reminders/todos. *The largest single item in this batch and the only one that is a genuinely new page rather than a change to an existing one. Should be scoped properly on its own before building (month grid versus agenda list, what a day with twelve transactions looks like, whether it is read-only or an entry point for editing).*

### Phase 21 - Budgets v4: budget accounts (scoped 2026-07-31, not yet built)
Seven separate REMINDER.md items turned out to describe one coherent feature, so they are grouped here rather than scattered through Phase 20. The user's own description of the model, condensed: **cash-flow accounts are the first layer** - income lands there and bills are paid from there - and **budget accounts are a second layer** holding money already earmarked for a budget. When an income is settled, the budgets tied to it are replenished automatically out of that income, and the money that moves into a budget account is **excluded from the cash-flow forecast**, because budget spending is unpredictable and should not be projected as if it were a scheduled transaction.

This is a real extension of the Budgets v3 ledger, not a rewrite: v3's running ledger already tracks money in and out per budget. What is missing is that a budget's balance is not an *account* today - it does not participate in the balances model, is not part of Total Balance, and has no relationship to the cash accounts the money actually came from.

**Open questions to settle before T165 is built** (these are architecture decisions the user owns): does a budget account become a row in `balances` with a flag, or stay a separate concept with its own table? Is a budget account's money subtracted from Total Balance (it is real money, just spoken for) or shown as a separate figure alongside it? And when a budget is spent, does that spend need to reduce a cash account too, or is the money considered already gone once it moved into the budget? The third question is the one that determines whether this model actually balances, and it is worth answering first.

- [ ] **T165.** Budget accounts: the data model, a running total per budget account and across all of them, and exclusion from the cash-flow forecast. *The foundation for the rest of this phase. Blocked on the open questions above.*
- [ ] **T166.** Auto-replenish budget accounts when a linked income is settled, distributing to each connected budget. *Depends on T151 first - the same settle path is where the double-count bug lives, and fixing it there is a prerequisite for building more behavior on top. The netting the user describes ("the total to add will now just be 19000") is exactly T151's fix; this task is the distribution layer above it.*
- [ ] **T167.** Budget display: show the configured allocation alongside the current remaining amount, show what a budget is tied to and how often, and update "replenishes today" to the next replenish date once the linked income is settled. *Three small display asks from the same batch. The first addresses a real confusion the user hit: a newly created budget shows ₱0 (correct, nothing has replenished yet) with no indication of what it will eventually hold. The third is a stale-label bug in spirit, since "replenishes today" persists after the replenishment has already happened.*
- [ ] **T168.** Make budget replenishments editable per instance from the Forecast table - change the amount for one occurrence (₱8,000 instead of ₱10,000) or move its date earlier. *The mechanism already exists: `budget_replenish_overrides` is the table the settle path writes skips into, and T42 established the same per-instance override pattern for recurring items. This is exposing amount and date edits through that existing table, not new infrastructure.*

### Completed work (T1-T147)
Full build write-ups live in **ARCHIVE.md**, in this same order. This index exists so a task number can be found quickly without opening it.

**Done**

- **Phases 0–4 (T1–T21)**: v1 built and deployed to Vercel — schema, pure engine + tests, all CRUD pages, Forecast/History/Dashboard, set...
- **Phase 5 (T22–T23)**: integer-multiplier monthly totals (Bug #1); greeting name fallback (Bug #2).
- **T24–T25**: budgets v1 tables + engine (monthly-only, no rollover) — the baseline Phase 6B converts.
- **T41**: sample data seed (`supabase/seed.sql`).
- ~~T26–T27~~ **cancelled** — superseded by Phase 6B; never build them.

**Phase 6A — Flexible recurrence (done)**

- T32 - Migration 0004: recurrence columns + enums + constraints + backfill; legacy-column drop split out...
- T33 - Engine: day/week/month(days)/year expansion + ends rules; port existing tests; add 6A cases (list...
- T34 - Engine: nth-weekday resolution (incl. last-X) + generalized `monthlyEquivalent`; tests.
- T35 - Recurrence picker wired into all four CRUD forms; human-readable rule summary per row.

**Phase 6B — Budgets v2 (after 6A)**

- T36 - ALTER migration on budgets (allocation, carryover, linked income, recurrence columns). Existing r...
- T37 - Engine rework: boundary/cycle/carryover model + tests (list above).
- T38 - Budgets page: CRUD + replenish-source UI + entries + log spend.
- T39 - Forecast: budgets panel + budget rows + quick log-spend.
- T40 - Dashboard card + History budget tags + empty states; verify summary stats ignore budgets except t...
- T42 - Editable transactions + stale-override cleanup, logged 2026-07-21 (user request, after T39), both...
- T43 - Future-dated spends as a first-class feature (user decision 2026-07-21, upgrading Bug #3 from dis...

**Phase 7 — Notion-style redesign (done)**

- T28 - Foundation: tokens, Inter, full-width shell, sidebar, base components — incl. recurrence picker...
- T29 - Restyle Dashboard + Forecast (list, chips, modals, reminders, budgets panel) — incl. the edited-o...
- T30 - Restyle all CRUD pages (Balances, Bills, Income, Debt, Savings, Extras, Budgets).
- T31 - Restyle Auth, Settings, History; consistency pass; screenshot review with the user before closing.
- T44 - Collapsible sidebar (added 2026-07-22, user request).

**Phase 8 — Forecast & Dashboard clarity (scoped 2026-07-22, not yet built)**

- T45 - Budget rows in the Forecast table read as confusing non-transactions (user's own question: "shoul...
- T46 - "Lowest balance ahead" indicator.
- T47 - Seed data negative/near-negative scenario.
- T48 - Peaks and Drops reformatted as a year × month grid (user request 2026-07-22) instead of the curre...
- T49 - Fixed-height, independently-scrollable containers instead of ever-growing page sections (user req...
- T50 - Forecast table filter bar (user request 2026-07-22): date (range), name (text match), type (multi...
- T61 - Forecast table density (user request 2026-07-23): shrink the row font and vertical padding as sma...
- T62 - Balance-range color highlight scoped to just the running-balance cell, not the whole row (user re...
- T63 - Peaks and Drops reflows instead of needing horizontal scroll (user request 2026-07-23, follow-up...
- T64 - Nav order: moved "Forecast" up to directly below "Dashboard" in the sidebar (user request 2026-07...
- T65 - Reminders panel becomes a full-height collapsible right sidebar on the Forecast page, mirroring t...
- T66 - Follow-up to T65 (user request 2026-07-23): move both sidebars' collapse/expand toggle onto the m...
- T67 - Peaks and Drops color-coded by `balance_ranges`, matching the Forecast table (user question 2026...
- T68 - Budget entries get their own scrollable, lazy-loading container on the Budgets page (user follow...
- T69 - Budget progress bar switched from time-based to money-based (user follow-up 2026-07-23/24) — the...

**Phase 9 — Finance category page enhancements (scoped 2026-07-22, not yet built)**

- T51 - Edited-occurrence indicator on finance category pages (user request 2026-07-22), extending T29's...
- T52 - Filters on each finance category page (user request 2026-07-22): Bills/Income/Debt/Savings/Extras...

**Phase 10 — Budgets rewritten as a running ledger (scoped 2026-07-23, in progress)**

- T53 - Migration 0009: `budget_entries.direction` (`'incoming'`/`'outgoing'`, not null, no default).
- T54 - New engine module `budgetLedger.ts`: `computeBudgetBalance` (Σ incoming − Σ outgoing up to a date...
- T55 - Budgets page rework: remove the carryover checkbox and "on a schedule" replenish option from `Bud...
- T56 - Wire replenishment: `settleOccurrence` (`forecast/actions.ts`) checks whether the settled item is...
- T57 - Forecast cleanup: delete `BudgetsPanel` and the boundary-row branch of `EditSettleModal`; simplif...

**Phase 11 — Budget replenish schedules + forecast deductions (scoped 2026-07-23, done)**

- T58 - Migration + engine only, nothing wired into the UI yet. Migration `0011_budget_replenish_schedule...
- T59 - Forecast + settle wiring. `forecast.ts` now projects a real deduction row (`sourceType: "budget_r...
- T60 - UI: `BudgetModal` gets "Replenish every" back as a third `SegmentedControl` option; Dashboard's B...

**Phase 12 — Filter modal, connected accounts, goal progress (scoped 2026-07-24, not yet built)**

- T70 - Forecast filter bar moves into a modal (user request 2026-07-24): a "Filter" button replaces the...
- T71 - Optional connected account per finance item (user request 2026-07-24): every settleable type — bi...
- T72 - Per-item progress bars for Debt/Savings (user request 2026-07-23, scoped 2026-07-24).
- T73 - Rename "Balance" → "Account" across the UI (user decision 2026-07-24 — they weighed that calling...
- T74 - Per-item transactions view on Debt/Savings (user request 2026-07-24): clicking an item (not its E...
- T75 - Budgets page card redesign (user request 2026-07-24).
- T76 - Lowest Balance Ahead card shows more than a negative/positive binary (user request 2026-07-24, mo...
- T77 - Direction-aware connected-account label (user request 2026-07-24, moved from REMINDER.md 2026-07...
- T78 - `RecurrencePicker`'s "Ends" control needs a better UX pass (user request 2026-07-24).
- T79 - Every date, including form date *inputs*, should follow the human-readable format Phase 7 already...
- T80 - Make the "lowest balance" tier labels (T76's "Comfortable low point", "Healthy low point", etc.)...
- T81 - Forecast Insights container (user request 2026-07-24). The "lowest balance ahead" line lived as p...
- T82 - Amount sign auto-inferred by finance category when editing/settling a forecasted transaction, so...
- T83 - Dashboard's Accounts/Remaining Debt/Savings/Budgets cards each get a "Manage" button linking to t...
- T84 - Reminders get a "completed" state, distinct from delete (user request 2026-07-25, moved from REMI...
- T85 - Free-tier 5-year tracking cap (user request 2026-07-25): "every user should have a max of only up...
- T86 - Dashboard's Accounts list gets divider lines between entries (user request 2026-07-25).
- T87 - "Highest" balance tier's green pill had low text contrast (user request 2026-07-25).

**Phase 13 — Sample data reset (scoped 2026-07-24, done)**

- T88 - Full wipe of the test account's data + a rewritten canonical `supabase/seed.sql`.

**Phase 14 — Full mobile compatibility (scoped 2026-07-24, not yet built)**

- T89 - Responsive navigation: the left sidebar becomes a hamburger-triggered drawer below `lg`; the Fore...
- T90 - Forecast page mobile: 3-column table (Name / Amount / Balance) at narrow widths — proposal to con...
- T91 - Dashboard mobile pass: card stacking/order, Peaks and Drops (already reflows since T63) verified...
- T92 - CRUD pages + shared components mobile pass: all six category pages, every modal, and `DatePicker`...
- T93 - Settings / History / Auth mobile pass + a full-app sweep at phone (375px) and tablet (768px) widt...

**Phase 15 — Branding (scoped 2026-07-24, not yet built)**

- T94 - Logo: 2–3 minimalist SVG directions mocked up for the user to choose from (pure SVG, no image ass...
- T95 - Branded login / signup: the four auth pages (+ `AuthCard`) get the logo and a light branded treat...

**Phase 16 — Onboarding (scoped 2026-07-24 — the user's main selling point for new users; the precision/UX bar is deliberately high)**

- T96 - Settings Preferences UI separation (user request 2026-07-24): currency, balance color thresholds...
- T97 - New-user sample data + reset: signup seeds the sample dataset into the new account; an always-fin...
- T98 - Spotlight tour component (hand-built overlay: dim + highlight + step text + next/skip) + the Dash...
- T99 - "Getting started" checklist: a persistent, dismissible panel tracking the add-data steps in order...
- T100 - Onboarding polish pass: exact copy, empty states, skip/replay ("Review the tour again"), and a fu...
- T101 - "First goes negative" as a second, distinct stat alongside Lowest Balance Ahead (user feedback 20...
- T102 - End-of-tour "keep or reset sample data?" prompt (user request 2026-07-25, part 1 of a larger onbo...
- T103 - Opt-in "preview with sample data" mode, available to any user regardless of whether they already...
- T104 - Dashboard card reorder (user request 2026-07-26): Lowest Balance Ahead and Peaks and Drops moved...
- T105 - Getting Started checklist (T99) tweaks (user request 2026-07-26): debt/savings marked optional al...
- T106 - "Extras" renamed to "Misc" everywhere in the UI (user request 2026-07-26).
- T108 - Forecast intro tour (T98) gets a line about settling transactions to keep the forecast accurate (...
- T107 - Date guardrails (user request 2026-07-26): a new bill/income/debt/savings/misc item can't start o...
- T109 - Sample dataset personalized to the user's actual family, and long em dashes removed from every se...
- T110 - "How to use" guide: walk the user through the whole app in one smooth flow, start to end. (User r...
- T114 - Lightbulb "How to use" icon in the main nav, directly below Settings - the part of T110's origina...
- T111 - Rename the route `/extra` to `/misc`, to match T106's user-facing "Misc" rename. (User request 20...
- T115 - Required onboarding wizard for completely new users, distinct from T110's skippable tour (user re...
- T116 - Guided tour rebuilt from scratch as a single short walkthrough, and guided setup (T115) changed f...
- T119 - First-login onboarding gets a "welcome" choice screen (tour vs. guided setup), and progress throu...
- T120 - Onboarding audit and rebuild of the short tour, plus explainer tips across every add/edit form, p...

**Phase 18 - Onboarding, rebuilt (scoped 2026-07-26; flow agreed 2026-07-26, T122)**

- *Tour feedback (user, 2026-07-26):* (1) the Next button should show a loading state before the step's card disappears, so a click doesn...
- *Structural fragility found during T114 (2026-07-26):* the `preferences` row is created by app code at exactly two call sites (`login()...
- *First-run finding from T121's own testing (2026-07-26):* a brand-new, empty account immediately shows a red "Goes negative by ₱0.00" w...
- *Surfaces to rationalize:* welcome modal, spotlight tour, guided-setup wizard, post-tour prompt, getting-started checklist, sample-data...
- **One question, asked once.** A new account sees a single welcome modal: show me around / help me set up / explore on my own. The answe...
- **Nothing blocks.** `(app)/layout.tsx`'s hard gate (T115) is removed outright. The wizard keeps a quiet "Exit setup for now" on *every*...
- **Show me around** runs the 6-step tour (T120). It no longer offers guided setup mid-tour and no longer ends in a prompt - it simply ends.
- **Help me set up** walks accounts, then income, then bills, offering debt/savings/budgets/misc afterwards as optional. Its starting scr...
- **Explore on my own** goes straight to the app.
- **One progress surface.** The Getting Started checklist (T99) on the Dashboard becomes the single place tracking what's left. It alread...
- **Deleted, because each re-asks a question already answered at the welcome modal:** the post-tour prompt and its three options (T120), ...
- **Empty is a designed state**, not an accident - starting with the Dashboard's Lowest Balance Ahead card, which currently greets a bran...
- T121 - Dev-only "fresh account" route, so onboarding can be tested end to end without hitting Supabase's...
- T122 - Onboarding design pass: agree the whole flow end to end before building any of it. What a brand-n...
- T123 - Stop the repeats and stop the blocking. Remove the post-tour prompt (`OnboardingNextStepPrompt`...
- T124 - Tour polish - the four issues the user reported 2026-07-26 while testing: (1) the Next button nee...
- T125 - Real empty states. The Dashboard's Lowest Balance Ahead card currently shows "Goes negative by ₱0...
- T126 - Prune the onboarding state left unused once T123-T125 land. Nine `preferences` columns currently...
- T127 - Four small follow-ups from live testing after T126 (user request 2026-07-26): (1) the short tour...
- T128 - Replace the "enter it as a positive number" style form tips with a keyboard-level guard, so a neg...
- T129 - Five items left in REMINDER.md from earlier tour/guided-setup testing (user request 2026-07-26)...

**Phase 17 - UI polish and Dashboard customization (reordered 2026-07-26)**

- T112 - All buttons everywhere get a hand-cursor (`cursor-pointer`) and a slight color change on hover. (...
- T113 - Style rule: never use long em dashes anywhere in the app - user-facing strings, seed/sample data...
- [x] **T117+T118.** Dashboard customization panel plus reordering, built together at the user's request (2026-07-27) rather than in the ...
- T130 - A dismissed "Quick tour" or "Guided setup" sidebar shortcut (T127) used to disappear outright, re...
- T131 - Tour bug from REMINDER.md (user report 2026-07-27): the highlighted Bills nav item during the sho...
- T132 - Signup confirmation by typed 6-digit code instead of an emailed link, ahead of giving the app to...
- T133 - Loading feedback on every button that needed it, ahead of giving the app to real users (user requ...

**Phase 19 - Pre-launch stress test, bug sweep & polish (scoped 2026-07-28, not yet built)**

- T134 - Full manual stress test pass across every page and flow, at both desktop (1280px) and mobile (375...
- T135 - Fix: recurring items collapsing to "today's day-of-month" regardless of the date or frequency act...
- [x] **T136+T137.** Fix: in guided setup, clicking "Add another X" then Cancel/Close left the add-item modal stuck open with no way out,...
- T139 - Fix: Add Debt's date picker gets clipped on its right edge inside the modal - the calendar is nev...
- T140 - Fix: Misc still shows at least one raw `YYYY-MM-DD` date, missing Phase 7's "Jun 1, 2025" human-r...
- T141 - Misc copy cleanup: remove the redundant "info" wording on the Money in / Money out fields (should...
- T142 - Verify: editing a Misc one-off transaction from the Forecast table should update what's shown on...
- T143 - Feature: ascending/descending sort by amount on every finance list (Bills, Income, Debt, Savings...
- T144 - Feature: a "varying twice-monthly" recurrence option (e.g. 16th & 31st, 5th & 25th) distinct from...
- T145 - Feature: user-orderable finance lists (Bills, Income, Debt, Savings, Budgets, Misc) - not the Das...
- T146 - Verify/clarify: REMINDER.md asked for "ends on date should limit to 5 years from the start date."...
- T147 - Fix: `EditSettleModal`'s "Delete this entry" (for a future-dated budget ledger entry) closed the...

### Out of scope
Payments/subscriptions, mobile app, notifications, bank sync, multi-user families.

**Two of these are actively contested and this list is out of date (noted 2026-07-31).** *Notifications* has now been requested four separate times (phone notifications, a 12am due-today email, past-due alerts, and the "one email with multiple toggles" shape) and is very likely to be lifted. *Multi-user families* is contested from two directions: the partner-sharing item in "Before MVP launch", and T163's updates feed, which is deliberately scoped to a single shared account precisely so it does not cross this line. Nothing here should be treated as settled without the user saying so; the exclusions stay in force until then, but they should be revisited as a group rather than eroded one task at a time.
