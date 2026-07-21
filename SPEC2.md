# Orium — SPEC2 (rev 3: Phases 5–7)

**This file replaces all earlier SPEC2 versions.** Reality check baked in: T22–T25 are done. T24–T25 were built under the old monthly-budget rules — their tables/engine are the *baseline* that Phase 6B converts. **T26 and T27 are cancelled — never build them.** Execution order: **6A → 6B → 7**. All SPEC.md global rules apply (integer centavos, calendar dates, pure engine, RLS, one task per session).

## Phase 5 — Bug fixes (done)
- [x] **T22.** Monthly totals via integer multipliers (`monthlyEquivalent`). Generalized later in T34.
- [x] **T23.** Greeting: profile name, else email local part.

## Phase 6A — Flexible recurrence (all transaction types)

Replace the fixed 4-frequency system with Google-Calendar-style rules on `recurring_items` (bills, income, debt, savings). Budgets reuse the same column set in 6B.

### Rule shape (new columns on `recurring_items`)
- `interval` int ≥ 1 — repeat every N units.
- `unit` text enum — `day` | `week` | `month` | `year`.
- `weekdays` int[] nullable — 0=Sun…6=Sat; required when unit=week (multi-select).
- `days_of_month` int[] nullable — 1–31, for unit=month; days beyond a month's length clamp to its last day.
- `ordinal` int nullable + `ordinal_weekday` int nullable — nth-weekday monthly rules: ordinal 1–4 or −1 (last); (3,2)=third Tuesday, (−1,5)=last Friday. Unit=month uses **either** `days_of_month` **or** the ordinal pair.
- `start_date` date — anchor; first possible occurrence.
- `ends_type` text enum — `never` | `on_date` | `after_count`; `end_date` becomes nullable; new `occurrence_count` int nullable.

### Expansion semantics (engine)
- **day**: start_date, then every `interval` days.
- **week**: weeks anchored to the week containing start_date; every `interval` weeks emit each selected weekday; skip before start_date.
- **month**: months anchored to start_date's month, stepping by `interval`; emit each clamped day in `days_of_month`, or the resolved nth-weekday date.
- **year**: start_date's month/day every `interval` years; Feb 29 → Feb 28 in non-leap years.
- **ends**: `never` → generate to horizon; `on_date` inclusive; `after_count` → stop after N emitted occurrences.
- `ends_type=never` items are excluded from finite "remaining total" stats (e.g. total remaining debt).

### Migration (T32) — backfill live data
monthly → (1, month, days=[day_of_month]) · weekly → (1, week, weekdays=[weekday]) · biweekly → (2, week, weekdays=[weekday]) · semi_monthly_15_30 → (1, month, days=[15,30]). Existing rows get `ends_type='on_date'` + current end_date. Drop old columns after backfill verification, same migration file, rollback notes in header. **User applies the SQL manually in the SQL editor; back up first with `pg_dump` only if real data is at stake by then (see CLAUDE.md "Hard rules" — free tier has no dashboard Backups feature).**

### Generalized monthly-equivalent stat (supersedes T22 table)
`occurrencesPerMonth = round(f)`, f = day: 30/interval · week: (4 × len(weekdays))/interval · month: (len(days_of_month) or 1)/interval · year: 1/(12×interval); minimum 0. `monthlyEquivalent = amount × occurrencesPerMonth` (integer × integer). Old presets still yield ×4 / ×2 / ×2 / ×1.

### Recurrence picker (shared component)
Used by Bills, Income, Debt, Savings, Budgets. Select with contextual presets from the chosen start date — "Monthly on the 21st", "Weekly on Tuesday", "Every 2 weeks on Tuesday", "Every 15th and 30th", "Monthly on the third Tuesday", "Custom…". Custom panel: Repeat every [N] [unit]; weekday chips (week); day list or nth-weekday (month); Ends: Never / On [date] / After [N] occurrences.

### Tasks
- [ ] **T32.** Migration: columns + enums + constraints + backfill + drop old columns. **Status: written, Part 1 (add + backfill, non-destructive) ready for the user to run directly in the Supabase SQL editor — see `supabase/migrations/0004_recurrence_rules.sql` header for steps (backup is optional right now; database only holds disposable test data). Part 2 (drop old columns) is deliberately deferred until after T35 ships, so the live app never reads a missing column mid-rollout.**
- [ ] **T33.** Engine: day/week/month(days)/year expansion + ends rules; port existing tests; add: every-2-weeks multi-weekday, days=[15,30] Feb, interval-3 months, after_count, never→horizon.
- [ ] **T34.** Engine: nth-weekday resolution (incl. last-X) + generalized `monthlyEquivalent`; tests.
- [ ] **T35.** Recurrence picker component wired into all four CRUD forms; human-readable rule summary shown on each row (e.g. "Every 2 weeks on Sat · until Apr 2030").

## Phase 6B — Budgets v2 (cycles, carryover, income-linked replenishment)

Converts the existing T24/T25 budgets (monthly-only, no rollover) into cycle-based budgets. A budget replenishes at each **cycle boundary**; boundaries come from a linked income OR the budget's own schedule. Everything derives from logged spends — no manual resets.

### Data model — T36 is an ALTER of the existing tables
`budgets` (exists): RENAME `monthly_allocation` → `allocation`; ADD `carryover_enabled` bool default true; ADD `linked_income_id` uuid nullable REFERENCES recurring_items(id) ON DELETE SET NULL; ADD the full 6A recurrence column set (all nullable). App-level rule: `linked_income_id` must point at a type=income item.
`budget_entries` (exists): unchanged.

### Replenishment source & cycle boundaries (engine, pure)
- **Linked income set** → boundaries are that income's *effective* occurrence dates: after overrides (moved dates move the boundary), excluding skipped occurrences (no reset that round — the cycle extends).
- **Else, own recurrence set** → boundaries are its occurrences.
- **Neither** (e.g. linked income deleted) → fallback: monthly on the 1st; Budgets page shows a "needs a schedule" badge prompting relink/schedule.
- After the final boundary (source ended), the last cycle extends to the horizon — no further replenishment.

### Cycle math
- Cycle k spans [boundaryₖ, boundaryₖ₊₁). Entries belong to the cycle containing entry_date; boundary-date entries belong to the **new** cycle; entries before the first boundary count toward the first cycle.
- `available₀ = allocation`; `availableₖ = allocation + (carryover_enabled ? availableₖ₋₁ − spentₖ₋₁ : 0)` — carryover may be negative.
- `remaining = max(available_current − spent_current, 0)`; `over = max(spent_current − available_current, 0)`.

### Forecast integration
- Current cycle: one row per budget, "{name} — remaining this cycle", amount = −remaining, dated **today**; omit when remaining = 0.
- Each future boundary within the horizon: row "{name} — allocation", amount = −allocation, dated the boundary.
- Rows are type `budget` (teal), not editable, not settleable.

### Logging a spend
`budget_entries` row AND a settlement (source_type `budget`, type `budget`, name = budget name + note, actual_amount = −amount, actual_date = entry_date, forecasted fields mirror actuals, forecasted_balance = 0). History renders budget rows with a "budget" tag, no forecast-vs-actual comparison.

### UI
- **Modal**: Name, Allocation, **Replenishes** segmented control — "With an income" (select from the user's income items, helper: resets each time it lands) / "On a schedule" (recurrence picker) — plus the carryover checkbox.
- **Forecast tab — Budgets panel** (above Reminders): per budget — name; carryover badge when nonzero carried in ("+₱700 carried over" / "−₱800 carried over"); progress bar (spent vs available; over state = full red bar + "Over by ₱X · next cycle starts at ₱Y"); "₱X left · resets {date}" or "resets with {income name} · {date}"; quick **Log spend** (amount, date=today, note).
- **Budgets page** (`/budgets`): CRUD incl. replenish source + carryover; per-budget current-cycle entries with delete; simple all-entries list; "needs a schedule" badge state.
- **Dashboard**: compact "Budgets this cycle" card (name + mini bar + remaining).

### Tasks
- [ ] **T36.** ALTER migration per above (back up first only if real data exists by then — `pg_dump` method as T32, no dashboard Backups on the free tier; user applies manually). Existing budget rows: keep working via fallback until edited.
- [ ] **T37.** Engine rework: replace T25's monthly logic with boundary/cycle/carryover model. Tests: linked-income boundaries (incl. moved + skipped occurrence), own-schedule weekly cycles, fallback, income-ends extension, carryover on/off/negative, remaining/over, boundary-date entry, integer math.
- [ ] **T38.** Budgets page: CRUD + replenish source UI + entries + log spend.
- [ ] **T39.** Forecast: budgets panel + budget rows + quick log-spend.
- [ ] **T40.** Dashboard card + History budget-tag rendering + empty states; verify summary stats ignore budgets except through forecast rows.

## Phase 7 — Notion-style redesign (scope includes 6A/6B UI)

Tokens/layout as before: Notion palette (`#37352F` text, `#E9E9E7` hairlines, `#2383E2` accent, soft pill backgrounds), Inter, 14px base, full-width shell with 240px sidebar, tables with hairline dividers and hover `#F1F1EF`, **Peaks and Drops keeps the v1 year×month pill grid**. Budget teal `#0B6E99`. Restyle only — no behavior changes.

- [ ] **T28.** Foundation: tokens, Inter, full-width shell, sidebar, base components — incl. recurrence picker, segmented control, progress bars.
- [ ] **T29.** Restyle Dashboard + Forecast (list, chips, modals, reminders, budgets panel).
- [ ] **T30.** Restyle all CRUD pages (Balances, Bills, Income, Debt, Savings, Extras, Budgets).
- [ ] **T31.** Restyle Auth, Settings, History; consistency pass; screenshot review with the user before closing.

**Still out of scope**: payments, mobile app, notifications, bank sync.
