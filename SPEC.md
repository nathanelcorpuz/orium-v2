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
7. **Always keep UI and UX clean on any changes made, responsive on all devices.**

## Data model (Postgres — migrations in `supabase/migrations/`)

### `balances`
Real money accounts. `id, user_id, name, amount (bigint centavos), comments, created_at, updated_at`. Plus (T172, migration 0032): `transaction_fee_centavos (bigint >= 0, default 0)` - a flat cost auto-deducted from every forecasted transaction connected to this account, both incoming and outgoing.

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
`id, user_id, name, created_at`, plus (still pre-6B, current app): `monthly_allocation (bigint ≥ 0)`. Plus (T36, migration 0006, added 2026-07-21): `allocation (bigint ≥ 0, NOT NULL, backfilled 1:1 from monthly_allocation)`, `carryover_enabled (bool, default true)`, `linked_income_id (uuid nullable, REFERENCES recurring_items ON DELETE SET NULL — app-level rule: must point at a type=income item, not DB-enforced)`, and the full recurrence rule shape (all nullable — `start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count`; `interval`/`unit`/`start_date`/`ends_type` are constrained to move together as a complete-or-nothing group). `monthly_allocation` is dropped by migration 0007 once T38 ships and the app no longer reads it — same additive-then-drop pattern as 0004/0005. Plus (T204, migration 0040): `budget_account_id (uuid nullable, REFERENCES budget_accounts ON DELETE SET NULL)` - optional link to a `budget_accounts` row (below).

### `budget_accounts` (T204, migration 0040)
`id, user_id, name, amount (bigint), comments (nullable), created_at`. Separate storage for budgets - never read by `generateForecast`/`loadForecast`, never counted toward Total Balance. A linked budget's ledger activity (replenish, spend, manual add/take) moves this account's `amount` the same way a connected main account moves on settle.

### `budget_entries`
The budget ledger. `id, user_id, budget_id (fk cascade), entry_date, amount (bigint > 0, always a positive magnitude), note, created_at`. Unchanged by 6B. Plus (Phase 10, migration 0009, added 2026-07-23): `direction (text, 'incoming' | 'outgoing', not null, no default — every insert must say which)`. Existing rows backfilled `'outgoing'` (they're all past logged spends, so their meaning is unchanged).

### `reminders`
`id, user_id, text, created_at`. Plus (T84, migration 0015): `completed (bool, default false), completed_at (timestamptz, nullable)`. Plus (T190, migration 0039): `due_date (date, nullable)` - when set, the reminder also plots on the Forecast page's calendar view as a green dot on that day; null behaves exactly as before (list-only).

### `preferences`
One row per user, created on signup. `user_id pk, currency (default '₱'), balance_ranges (bigint[] — 5 ascending centavo thresholds: [danger, low, medium, high, higher]; balance ≤ ranges[0] = danger, above ranges[4] = highest)`. Plus (T174, migration 0033): `active_scenario_id (uuid nullable, references scenarios, ON DELETE SET NULL)` - the scenario currently merged into the Forecast/Dashboard, if any.

### `scenarios`, `scenario_recurring_items`, `scenario_one_off_items` (T174, migration 0033)
A "what-if" scenario is a named container (`scenarios`: `id, user_id, name, created_at`) for hypothetical bills/income/debt/savings (`scenario_recurring_items`) and one-offs (`scenario_one_off_items`) - genuinely separate tables mirroring `recurring_items`/`one_off_items`'s own columns and constraints exactly, not a shared `scenario_id` tag column on the real tables (see the Roadmap write-up for why). Deleting a scenario cascades to both child tables. Never touched by any existing query in the app - the only integration point is `loadForecast()`, which merges the active scenario's rows into its own arrays when `preferences.active_scenario_id` is set.

## The forecast engine (`src/lib/engine/`)

Pure functions. `generateForecast({ balances, recurringItems, overrides, oneOffs, budgets?, budgetEntries?, today, horizon }) → ForecastRow[]` where each row is `{ sourceType, sourceId, originalDate, name, amount, dueDate, type, runningBalance }`.

Pipeline: expand each recurring rule from `max(today, start_date)` to the rule's end (capped at horizon) → apply overrides (move/change/skip) → merge one-offs dated today or later → merge budget rows (below) → sort by due date, then incoming-before-outgoing within a date (stable beyond that) → running balance = sum of `balances.amount` plus cumulative signed amounts, always integer centavos. Occurrences strictly before `today` are excluded (they belong in settlements).

**Same-day ordering (T148):** rows sharing a `dueDate` put incoming amounts (`amount >= 0`) ahead of outgoing ones, so a salary landing on the 5th is credited before a bill due the same day is deducted - the running balance never shows a dip that wouldn't really happen. Rows with the same date *and* the same sign keep insertion order (`Array.prototype.sort` is stable from ES2019).

**Past-due occurrences (T150, replaces the old "strictly before today" exclusion):** an occurrence whose date has passed and which was never settled **stays in the forecast** and keeps counting against the running balance. It carries `pastDue: true` (omitted, not false, for ordinary rows). Recurring rules expand from their own `start_date` rather than from `today`, and past-dated one-offs are no longer skipped. The lookback is **unbounded** - the user chose this explicitly over a fixed window (2026-07-31) - and stays sane because settling writes a `skipped` override (recurring) or deletes the row outright (one-offs), so anything still showing is genuinely outstanding. Past-due is judged on a row's *effective* date, so moving an occurrence forward with an override clears it.

The backlog runs through the same cumulative running balance as everything else, before today's rows: the account balances the user maintains are what they hold *now*, and an unsettled obligation has not left the account yet. `splitPastDue(rows, startingBalance)` divides the two and reports `balanceAfterPastDue`; forward-looking stats (lowest balance ahead, first danger point, Peaks and Drops) take `upcoming` plus that balance, so a past-due dip is never mistaken for a future event while the numbers still start from a realistic position.

Two surfaces deliberately opt out. The Debt and Savings pages filter past-due out of their per-item "upcoming" lists, since a missed payment from months ago showing as the *next* one would read as a bug. The preview-mode sample fixture (`sampleFixture.ts`) drops past-due entirely: it backdates every rule 180 days so the recurrence summaries look established, nothing in preview can be settled, and the new-user tour would otherwise open on ~60 red rows.

**Known follow-up:** `seed_sample_data` (migration 0016) uses hardcoded January 2026 dates, so an account that restores sample data now shows about seven months of past-due. It is reached only through Settings > Restore sample data (typing "RESTORE"), never automatically at signup, so this is a wart rather than a blocker - and the hardcoded dates were already going stale on their own. Tracked as **T169**.

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
3. **Forecast** (`/forecast`): total balance + editable balance chips, each also showing that account's own lowest projected balance ahead (T180); the full occurrence list color-coded by `balance_ranges` (danger = dark, low = red tint, medium = white, high→highest = deepening green); every row is clickable, opening Edit/Settle for recurring/one-off rows or a direct amount/date/note edit for a budget ledger entry (T57 — every budget row is now a real transaction, never a projection). A Table/Calendar toggle (T190, folding in the old standalone `/calendar` page from T164) switches the same content area between the occurrence list and a month grid - each day shows a count badge for forecast transactions and a green dot for any reminder due that day, click a day to list both, click a listed transaction to open the same Edit/Settle modal. Right sidebar: Reminders CRUD, each with an optional due date (T190) that plots it on the calendar view (the old Budgets panel moved to the Budgets page itself, T55).
4. **Balances / Bills / Income / Debt / Savings / Extras** (`/balances`, `/bills`, `/income`, `/debt`, `/savings`, `/extra`): CRUD pages; each shows its summary total; all four recurring forms use the shared recurrence picker with a human-readable rule summary per row ("Every 2 weeks on Sat · until Apr 2030").
5. **Budgets** (`/budgets`): CRUD + a running balance per budget (red when negative) + a month-filterable entries list + Log spend, plus Add funds/Take funds for budgets not linked to an income (T55, Phase 10).
6. **History** (`/history`): settlements table — forecasted vs actual amount/date, forecasted balance, type (budget rows shown as a pill tag).
7. **Scenarios** (`/scenarios`, `/scenarios/[id]`, T174, extended by T182/T183): create/rename/delete named "what-if" scenarios (bills/income/debt/savings/misc items, and budgets as a plain named pot - T182); turn any number of them on at once (T183) and their items merge into the Forecast and Dashboard together (an amber banner states the count everywhere it applies, click to see which; a "Scenarios" button beside Forecast's Filter button lists every scenario with its own independent toggle). Turn one off and only its items drop back out. "Activate permanently" copies a scenario's items into real data and deletes the scenario - irreversible, typed confirmation required. Scenario rows are never clickable in either Forecast view (edit them from the scenario's own page instead), and are tinted on the Forecast table to read as clearly hypothetical.
8. **Updates** (`/updates`, T163): a reverse-chronological, day-grouped feed over `activity_log` (T162) - every create/edit/delete/settle/toggle anywhere in the app, so a couple sharing one account can see what changed since they last looked. Entries newer than the viewer's own `activity_log_seen_at` watermark are marked new; opening the page updates that watermark for next time. The sidebar nav link carries an unseen-count badge.
9. **Settings** (`/settings`): profile, preferences (currency, balance ranges), log out, delete account (removes all user data).

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
- **`/api/dev-login` is currently disabled** (noted 2026-07-31): `DEV_LOGIN_EMAIL` is present but empty in `.env.local`, and the route 404s unless *both* it and `DEV_LOGIN_PASSWORD` have values. This silently blocks browser verification in every session - the route just returns "Not found" with no hint as to why. To restore it, put the test account's email address in that variable. `DEV_LOGIN_PASSWORD` already has a value, so nothing else is needed. Until then, `/api/dev-new-account` still works (it uses the service-role key plus `DEV_LOGIN_PASSWORD`) but gives a brand-new empty account rather than the seeded test one.
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
- **Future pre-launch feature list.** Raised 2026-07-27, moved here 2026-07-28 — the user asked to spec four things before public launch: (1) notifications (already covered by the Phone notifications bullet above), (2) import / templates / a guided first-time build so setup isn't solo, (3) sharing the app with a partner, (4) ~~"what-if" scenarios~~ (e.g. "what if we buy the car") - built 2026-07-31 as **T174**, no scope conflict (a scenario is single-account, same as everything else, so it never touched the "multi-user families" exclusion). Partner sharing still directly conflicts with the existing "Out of scope" list below, the same way phone notifications conflicts with "notifications" - still needs an explicit scope decision (keep the exclusion, or lift it) before becoming a real task. Import/templates remains the more straightforward remaining candidate to scope.
- **Production safety, staging, and inviting real users.** Raised 2026-07-30, triaged 2026-07-31. **Step 1 done 2026-08-01**: a second free Supabase project ("Orium Staging") now exists with all 33 migrations applied, and local `.env.local` points `npm run dev` at it instead of production - full details and the one remaining manual step (pasting the staging service-role key) in `STAGING.md`'s "Progress" section. Still open: custom SMTP (blocks inviting anyone), how signup gets gated, and building the one-way production-to-staging data refresh (decided to be on-request only, not automatic - not yet built).
- ~~Raise the tracking horizon from 5 years~~ - resolved as **T171** (below): the user gave a flat "final decision" of 50 years on 2026-07-31, superseding both this discussion and its earlier 25-year version, and superseding **T146**'s 2026-07-28 "keep 5" confirmation in turn. No split between a validation cap and a smaller rendered horizon - the single `MAX_TRACKING_YEARS` constant governs both, exactly as before, just larger.
- **Email notifications (three separate asks, all currently out of scope).** Raised 2026-07-27 through 2026-07-30: (1) a 12am email whenever any forecasted transaction falls due that day, (2) an alert for past-due unsettled transactions (the notification half of Bug #11 / T150), (3) the user's mental model of "one email with multiple toggles" rather than several separate emails. Together with the earlier "Phone notifications" bullet above, that is four requests against an "Out of scope" line that still reads *notifications*. That exclusion is now clearly stale and should be lifted deliberately. Beyond the scope call there is an infrastructure decision: a 12am send needs something running on a schedule (a cron trigger plus a transactional email provider), which is new infrastructure, a new dependency, and probably a new cost - none of which are covered by the fixed stack in this file. The existing Operations note about custom SMTP for signup email volume is related and should be settled at the same time.
- **User-defined categories.** Raised 2026-07-30: alongside the built-in types (bills, income, debt, savings) the user wants their own - birthdays, occasions, events - for money that is set aside and predictable but is not a bill. Their own suggested shape is "main categories" (the existing fixed set) plus "custom categories" (user-created). This is a data-model change: `recurring_items.type` is a DB-enforced enum, and type drives colors, per-type pages, per-type summary stats, and the debt/savings goal logic. Worth deciding whether custom categories are a genuine new *type* or just a **label/tag** on existing items - the second is dramatically cheaper and may cover the actual need (a birthday fund is arguably a Savings item with a tag).
- **Auto-move a portion of a settled income to another account.** Raised 2026-08-01: the user's own example - they receive "TNIT" income into "Wise Nanay" with no income of its own connected to "BDO Tatay," and want a specific amount to automatically move from Wise Nanay to BDO Tatay whenever that income settles, with BDO Tatay's own T172 transaction fee applying to the moved amount, same as a manual Move funds (T186) would. The user explicitly asked to discuss implementation approaches rather than have this built directly - candidate shapes worth weighing: a rule attached to the income itself (one or more "on settle, move ₱X to account Y" rules) vs. a rule attached to the *destination* account ("this account receives ₱X whenever income Z settles"); how it interacts with T186's existing `balance_transactions` ledger (each auto-move should probably write its own two-leg transfer, same as a manual move); and whether the forecast should project these moves ahead of time (an "Account balance after this" style preview would need to know about them) or only apply at actual settle time, mirroring how budget replenishment itself works today.
- **Financial goals / milestones reminders (FIRE-style).** Raised 2026-08-01, explicitly **not to be built yet** - discuss techniques for financial stability (FIRE, emergency-fund sizing, etc.) first. The user wants the app to proactively flag milestones that don't exist yet - starting with an Emergency Fund, HMO, Life Insurance, and Long Term Investing, which they've parked as plain Reminders for now specifically so the Forecast page keeps surfacing the gap. Needs a real discussion on what "doesn't exist yet" even means computationally (a Savings item tagged a certain way? a dedicated new concept?) before this becomes a task.
- **A budget linked to more than one budget account.** Raised 2026-08-01, right after T204/T209 shipped, explicitly hedged ("if... we can") rather than a firm ask - the user floated letting a budget draw from *multiple* budget accounts, with a dropdown at Log spend/Add funds/Take funds time picking which one applies, plus a "default account" on a budget that would show (and be editable) directly on its Forecast replenishment row. T204's own confirmed design was one optional link per budget (chosen explicitly over "many budgets → one account" when asked); moving to many-accounts-per-budget is a real data-model change (the FK would need to become a join, or per-transaction account selection), and showing/editing a budget account choice inside the Forecast needs reconciling with the earlier explicit decision that budget accounts never appear in the forecast at all. Needs the user's own confirmation on the shape before building, not an executive call - this is exactly the kind of architecture decision CLAUDE.md says to ask about.
- **A shareable "anyone with the link" view of Updates.** Raised 2026-08-01: the user wants to send their wife a link to the Updates feed (T163) that works like Google Drive's link-sharing - viewable by anyone holding the link, no login. This is a real security/scope decision, not a UI task: it means unauthenticated access to real financial activity data (every create/edit/delete/settle in the account), and directly touches the existing "Out of scope: multi-user families" exclusion the same way the partner-sharing item above already does. Needs answers before it's buildable - is the link read-only and revocable/regenerable (an unguessable token stored per-user, most likely), does it show the full feed or a scoped subset, does viewing it need its own rate limiting/abuse protection since it would bypass normal auth entirely. Not an executive call.

### Carried over from Phase 19
One task from the pre-launch sweep is still open. Everything else in Phases 6A-19 is done and archived.

- [ ] **T138.** Fix: guided setup throws a network error after entering 10+ bills and advancing to the next step. *Investigated 2026-07-28, not yet reproduced: added 11 bills total (9 via the regular Bills page, matching the reported count) then loaded `/setup` fresh - it correctly resolved straight to "Step 3 of 7: Add income" with no error. Also drove the wizard's own "Add another income" -> reopen -> save cycle (the actual code path the report describes, distinct from the regular page) twice in a row with no error. Checked browser console and dev server logs throughout both attempts - clean. Left open rather than closed, since "not reproduced yet" isn't "doesn't exist" - a transient Supabase hiccup or a genuinely higher item count could still trigger it. Needs more specific repro info next time it happens: the exact error text/toast, whether it's a browser-level "Failed to fetch" or an app-level message, and roughly how many items were in the step at the time.<br>**Second pass, 2026-07-31, code audit rather than a click-through** (the Browser pane was stuck on its known "Loading..." issue this session): read every server action the wizard's add-form path touches - `createBillForWizard`/`markWizardStepSaved` and `setWizardReopen`/`clearWizardState` (`onboardingActions.ts`), `setup/page.tsx`'s queries, and `OnboardingWizard.tsx`'s state derivation. Found nothing that scales with item count: no row-count trigger or constraint on `recurring_items` (checked every migration touching that table), no place the wizard serializes the full item list back to the server (the preview list's own delete/edit forms carry only a single `id`, not the array), and the `Promise.all` queries in `setup/page.tsx` have no `.limit()` that 10 rows would approach. The original hypothesis - the previous session's repro used the regular Bills page for 9 of the 11 items rather than the wizard's own "Add another" -> reopen -> save loop the report actually describes - still stands as the most likely gap between what was tested and what happened, since that loop calls `setWizardReopen`/`router.refresh()`/the create action/`clearWizardState` in sequence and hasn't been driven more than twice in a row by anyone investigating this. Left open; still needs the exact error text/toast and a repro run through that specific loop 10+ times in immediate succession, ideally with dev server logs open throughout.*<br>**Third pass, 2026-08-01** (during an uninterrupted roadmap run, executive call per the user's own standing instruction to make judgment calls rather than stall on this one): checked whether any file on the wizard's add-form path had changed since the second pass - none had (`git log` on `onboardingActions.ts`/`setup/`/`OnboardingWizard.tsx` shows nothing after T172, well before this bug was even reported). With no code change to re-audit and no fresh repro details available, a third investigation pass would just repeat the second one's steps for no new information. Left open rather than spending further unproductive time on it; still needs the same specifics as before the next time it happens.*

### Phase 27 - triaged from REMINDER.md 2026-08-01, not yet built
Bug reports from the same batch went straight to BUGS.md (Bug #15) instead - this phase is feature requests only, in the order raised. "Prioritize budgets" (the user's own instruction, 2026-08-01) means T199/T200 (budgets-related) go first among these once work resumes here, ahead of top-to-bottom order.

- [x] **T193.** Edit a forecasted transaction's connected account directly from the Forecast/Calendar's own Edit tab, not only at settle time. *`EditSettleModal`'s Edit form gets the same account `<select>` the Settle form already had, for both recurring and one-off rows. For a recurring item this is a permanent change to `recurring_items.balance_id` (not a per-occurrence override - there's no such column, and "connected to the wrong account" is a lasting fix), applied alongside the existing occurrence_overrides write; for a one-off, `balance_id` just joins the existing name/amount/date update since a one-off item is itself the single occurrence. Both actions now also revalidate `/accounts` so the Balances page's connected-items list picks up the change. 222/222 tests (unchanged - server actions), tsc, build, eslint clean.*
- [x] **T194.** The Settle form's account transaction fee (T172) becomes a real optional field, auto-populated from the connected account's own fee setting rather than only shown as an informational "Plus a X fee" line. *`readSettleForm`/`applyToBalance` (forecast/actions.ts) gain an explicit fee parameter - blank keeps the original behavior (read whatever the account is currently set to), a typed value overrides it for this one settlement only (a waived fee, a higher-than-usual one). Scoped to the account this row was already connected to; doesn't live-update if a different account is chosen in the settle form's own picker (T193) - not asked for, and would need the `balances` prop widened with each account's fee plus a controlled select to do properly. 222/222 tests, tsc, build, eslint clean.*
- [x] **T195.** Budgets' Add funds / Take funds get an optional comment field, matching what Accounts' own Add/Take/Move funds (T186) already has. *`FundsModal.tsx` gets the same "Comment (optional)" text input `AccountFundsModal.tsx` already has - the server action (`writeLedgerEntry`, budgets/actions.ts) already read `note` from the form (it's what `LogSpendModal.tsx`'s own comment field already fed), only the Add/Take form itself was missing the field. 222/222 tests, tsc, build, eslint clean.*
- [x] **T196.** Dashboard stat cards restructure: Total Balance gets its own section breaking out each account's individual balance (not just the combined total); Total Monthly Bills/Income/Debt/Savings each become their own category rather than sharing one card layout. *The old shared 3-card "stats" widget (T117) split into two: "Total Balance" (its own card, each account's own balance listed underneath) and "Monthly totals" (four cards - Bills/Income/Debt/Savings, all via `monthlyEquivalent`; Debt/Savings never had a monthly figure before, only "Remaining" further down, a different question). `DashboardWidgetsPanel`'s reconcile logic (already built to handle added/removed widget keys) means existing users' saved order/hidden state degrades gracefully - the old "stats" key just drops out, the two new ones append visible by default.*
- [x] **T197.** New Misc stat cards on the Dashboard: total money in (incoming one-offs) and total money out (outgoing one-offs), as their own cards alongside T196's restructure. *Misc has no "monthly" concept (one-offs, not recurring), so these total every not-yet-settled Misc forecast row instead, split by sign - the full `forecast` array (past-due included, same "not actually gone yet" convention T150 established), not just `upcoming`. 222/222 tests (unchanged - presentational), tsc, build, eslint clean.*
- [x] **T198.** Show a linked income's recurrence frequency (e.g. "Every 2 weeks on Tue") when adding or editing a budget on the Budgets page. Same `summarizeRecurrence` helper (`src/lib/recurrenceSummary.ts`) T199 below would also use. *The income `<select>` is now controlled (was `defaultValue`-only) so picking a different income updates the frequency line live. `BudgetModal`'s `incomes` prop widened to an `IncomeOption` type with the rule fields optional rather than required - the onboarding wizard's own income list is a bare `{id, name}[]`, and a runtime `hasRecurrenceRule` guard means the frequency text simply doesn't render there instead of forcing that unrelated list to carry data it's never had. 222/222 tests, tsc, build (confirms the wizard's narrower list still satisfies the widened prop), eslint clean.*
- [x] **T199.** Two follow-ups to T191 raised the same day, before T191's own commit: (1) show a forecasted transaction's recurrence frequency when it's clicked, for any recurring-sourced row (bill/income/debt/savings, and a budget replenishment via its linked income's own rule). (2) an explicit "Goes to budget: X" label on a budget replenishment's modal, distinct from the account-balance line T191 already shows. *New `budgetReplenishRuleSummary` (`recurrenceSummary.ts`) resolves a budget's effective rule - its linked income's, or its own schedule - mirroring how `forecast.ts` itself already decides which occurrence dates a budget's replenishment follows. `forecast/page.tsx` now threads `recurringItems`/`budgets` (already returned by `loadForecast()`, just not passed down before) through `ForecastClient`/`CalendarGrid`, each computing the same small `frequencyForRow` lookup independently (matching how each already computes its own `accountBalanceAfterRow` map, T191). `EditSettleModal`'s up-front banner (T191) now shows up to three independent lines - account balance, "Goes to budget," frequency - each rendering only when it applies. 222/222 tests, tsc, build, eslint clean.*
- [x] **T200.** Fix: the sidebar's purple help/tip icons don't lay out correctly when the sidebar is collapsed - they should stack vertically like everything else in the collapsed rail, not keep their expanded-width arrangement. *`AppShell.tsx`'s dismissed-shortcuts row (two 32px squares, Quick tour/Guided setup) used a plain horizontal `flex gap-2` regardless of collapsed state - two squares plus the gap (72px) don't fit in the 64px collapsed rail. Now `flex-col` when collapsed, same as every other collapsed-state element already is.*
- [x] **T201.** Fix: the Updates nav item's unseen-count badge (T163) is oversized when the sidebar is collapsed - should shrink to fit the narrow rail like every other collapsed-state element. *The collapsed badge shared the expanded version's `px-1.5 py-0.5` pill sizing, which has no size cap - a 2-digit count or "99+" grew wider than the rail. Collapsed now uses a fixed `h-4 min-w-4` circle, the same shape RemindersPanel's own bell badge already established for the same reason.*
- [x] **T202.** Add a loading state for the Dashboard - clicking into it currently shows nothing while its data fetches. *New `src/app/(app)/loading.tsx` (the one route-group level missing one - every sub-page already had its own). Reuses the existing `LoadingScreen` component, same as every other page's loading state. 222/222 tests, tsc, build, eslint clean (same pre-existing 6-problem baseline, none in the touched files).*
- [x] **T203.** Budgets get a Move funds action too, matching Accounts' own Add/Take/Move funds (T186) - moving money from one budget to another, logged the same two-leg way T186 already does for accounts. *New `moveBudgetFunds` (budgets/actions.ts) writes two `budget_entries` rows (outgoing on the source, incoming on the destination) plus paired `settlements` rows for History, same two-leg shape T186/T209 already established. Distinct from T209's `moveBudgetAccountFunds` - this moves money between two *budgets*, that one between two *budget accounts* (T204's separate storage layer); if either budget involved is itself linked to a budget account, that account's balance moves too on the same leg via `applyToBudgetAccount`, so the two layers stay in sync. `FundsModal.tsx` widened from add/take-only to a third "move" mode mirroring `BudgetAccountFundsModal.tsx`'s own pattern (a `budgets` prop for the move-to picker); `BudgetCard.tsx` gets a "Move funds" button, shown only when there's more than one budget to move to. 222/222 tests, tsc, build, eslint clean.*
- [ ] **T205.** Mobile Forecast table should occupy nearly the full viewport height when scrolled to it, with a small space above for Filter/Scenarios and room to scroll back up.
- [ ] **T206.** The account filter already on Bills/Income/Debt/Savings/etc. becomes a dropdown (matching whatever pattern the other filters on those pages already use), rather than however it's currently presented.

### Completed work (T1-T192, plus T204/T208/T209 - see Phase 28 below, completed out of order)
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

**Phase 20 — Post-production backlog (done 2026-07-31)**

- **T148.** Forecast: same-day rows sort income before deductions.
- **T149.** Budgets: "Add funds"/"Take funds" show on every budget, not just income-linked ones.
- **T150.** Fix: Forecast silently dropped past-dated unsettled transactions (Bug #11).
- **T151.** Fix: settling an income linked to a budget double-counted the allocation (Bug #14).
- **T152.** Fix: Forecast's balance chips opened an account without its connected finances (Bug #12).
- **T153.** Fix: "First goes negative" was the wrong label above a nonzero danger threshold (Bug #13).
- **T154.** Engine test coverage for T148's same-day ordering rule.
- **T155.** Forecast row polish: bold dates, comment-bubble icon on hover.
- **T156.** Start date shown on Bills/Income/Debt/Savings list rows.
- **T157.** Recurrence picker: "Yearly" preset; "Ends: never" default for Bills/Income.
- **T158.** Forecast: expand a clicked transaction to show its full detail.
- **T159.** Comprehensive filters on finance records (account filter was the real gap).
- **T160.** Completed debts/savings goals get their own archived section.
- **T161.** Forecast desktop adopts the mobile date-grouped layout.
- **T162.** Activity log foundation (every create/edit/delete/settle).
- **T163.** "What's changed since you last logged in" Updates feed.
- **T164.** Family calendar view built on the forecast.
- **T169.** `seed_sample_data`'s dates made relative to the seeding date, not hardcoded 2026.
- **T170.** ~~Leftover sample data in production~~ - invalid finding (cross-account query bug), retracted.
- **T171.** Hard tracking limit raised from 5 to 50 years - the user's final decision.

**Phase 21 — Budgets v4: budget accounts (done 2026-07-31)**

- **T165.** Combined running total across all budgets.
- **T166.** Verified: auto-replenish on linked income settle already worked as designed.
- **T167.** Budget display: allocation shown, frequency shown, "replenishes today" no longer goes stale.
- **T168.** Budget replenishments editable per instance from the Forecast table.

**Phase 22 — Second reminder batch (done 2026-07-31)**

- **T172.** Per-account transaction fee, auto-deducted from every connected forecasted transaction.
- **T173.** "Due today" amber tag in the Forecast, alongside the past-due red one.
- **T174.** "Run possible scenario" - a toggleable what-if layer over the forecast.
- **T175.** Temporarily disable a bill/misc/income/debt/savings/budget to preview its forecast impact.
- **T176.** History page widened to match Forecast's table width.

**Phase 23 — Third reminder batch (done 2026-08-01)**

- **T177.** Reminders are draggable (pointer-based drag-and-drop reorder).
- **T178.** Date-range filter added to Bills/Income/Debt/Savings.
- **T179.** Connected-items list in `BalanceModal` grouped by type, with a collapse toggle.
- **T180.** Per-account forecasted balance (hover tooltip on each account chip).
- **T181.** History page gets its own filter bar.
- **T182.** Budgets added to Scenarios.
- **T183.** Unlimited simultaneously active scenarios, redesigned Forecast toggle UI.
- **T184.** Toggled-off finance items read more clearly disabled (grayscale).
- **T185.** Hide an Updates entry from view without touching the underlying log row.
- **T186.** Add/Take/Move funds for accounts, replacing blind balance edits.
- **T187.** Updates stays unread until explicit action; its own filters and lazy loading.
- **T188.** View and edit a finance item's modified future transactions from its own page.

**Phase 24 — Accounts page UX pass (done 2026-08-01)**

- **T189.** Connected-items redesign (icon-based disconnect + confirm step), decluttered account row (icon buttons for History/Edit/Delete), and the per-account forecast stat surfaced visibly here too, not just on Forecast's hover tooltip.

**Phase 25 — Calendar folded into Forecast, reminder due dates (done 2026-08-01)**

- **T190.** Calendar is now a Table/Calendar toggle inside the Forecast page (the old `/calendar` route and nav item are gone), and reminders gained an optional due date that plots as a green dot on that calendar view. Also fixes a reported T177 drag-reorder bug (dragging a reminder forward could land it one slot past the intended target).

**Phase 26 — Per-transaction account balance, budget replenishments attributed to an account (done 2026-08-01)**

- **T191.** Clicking a forecasted transaction connected to an account now shows what that account's own balance will be right after this transaction, in both the Forecast table and calendar views - resolves the "Forecasted balance per account" discussion item, scoped down to a single transaction rather than a general per-date lookup. An income-linked budget's replenishment is now attributed to that income's own connected account (money really does leave it, per T151/Bug #14's settle-time behavior) and shows up in the Forecast table's Account column accordingly; an own-schedule budget's replenishment stays unattributed, since it isn't funded from any particular account in this model.
- **T192.** A forecasted transaction's amount can now be exactly 0 wherever it's entered - creating/editing a Bill/Income/Debt/Savings/Misc item or a scenario version of one, settling or editing a single occurrence, and a budget replenishment/ledger entry (real or scenario) - previously rejected outright as "not a valid amount" in seven places, only some of which even had a stated reason (the two that did were guarding against a negative, not a zero).

**Phase 28 — Budget accounts (done 2026-08-01, completed ahead of Phase 27)**

- **T204.** "I want to create accounts specified for budgets as well. The main accounts used in the cash flow will be separate, and I need another set of accounts that will be used as storage for the budgets." New `budget_accounts` table (migration 0040), separate from `balances` and never counted toward Total Balance or the forecast. A budget optionally links to one (same "optional connection" shape bills/income already use for a main account); once linked, every ledger change on that budget - replenish (auto from a settled income, or its own schedule), spend, manual add/take - moves the linked account's balance too, the same way settling a bill moves a connected main account. Managed from a collapsible "Budget Accounts" sub-section on the Budgets page itself, per the user's own answer, not a new nav item.
- **T208.** Two small follow-ups raised right after T204/T198 shipped: (1) an income-linked budget's card now also shows the main account that income is connected to ("From account: X"), one hop further than the existing "Connected to {income}" pill - `IncomeItemRow` gained `balanceId`, and `budgets/page.tsx` now also fetches `balances` (id/name only) to resolve it. (2) the "Storage account" field on a budget's own create/edit form was renamed "Budget account" for consistency with the Budgets page's own "Budget Accounts" section header.
- **T209.** "Budget accounts should have almost identical functionality with main accounts, but they don't have to have projected total balance." New `budget_account_transactions` table (migration 0041), mirroring `balance_transactions` (T186) exactly - Add funds / Take funds / Move funds for a budget account, each logged with an optional comment, same three-mode `BudgetAccountFundsModal` shape `AccountFundsModal.tsx` already established. No fee concept (a budget account was never part of the forecast/T172 fee model) and no separate History view (not asked for this time).

**Phase 29 — Reminders UX (done 2026-08-01)**

- **T207.** "Adding a new reminder should have an add button instead that shows the form instead of showing it outright." The add-reminder form is now collapsed behind a dashed "+ Add reminder" button by default, opening (with autofocus) on click and collapsing again on a successful add or Cancel - same "click to reveal a form" shape `ReminderItem`'s own edit/delete modes already use. Bundled with **Bug #17** (BUGS.md) - a long reminder name's edit-mode text input lacked `min-w-0`, so it refused to shrink and pushed the Cancel/Save buttons out of view.

### Out of scope
Payments/subscriptions, mobile app, notifications, bank sync, multi-user families.

**Two of these are actively contested and this list is out of date (noted 2026-07-31).** *Notifications* has now been requested four separate times (phone notifications, a 12am due-today email, past-due alerts, and the "one email with multiple toggles" shape) and is very likely to be lifted. *Multi-user families* is contested from two directions: the partner-sharing item in "Before MVP launch", and T163's updates feed, which is deliberately scoped to a single shared account precisely so it does not cross this line. Nothing here should be treated as settled without the user saying so; the exclusions stay in force until then, but they should be revisited as a group rather than eroded one task at a time.
