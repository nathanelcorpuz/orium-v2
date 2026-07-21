# Orium — SPEC2 (Addendum: Phases 5–7)

Read together with SPEC.md. All rules there still apply (integer centavos, calendar dates, pure engine, RLS, one task per session). Task numbering continues from T21.

## Phase 5 — Bug fixes

Active bugs live in `BUGS.md`. Fix format: reproduce → fix → add a test or manual check → mark fixed in BUGS.md → commit.

- [x] **T22. Monthly totals use simple multipliers (Bug #1).**
  "Total Monthly Income" (dashboard + income page) and "Total Monthly Bills" are *summary stats*, defined as the sum of each item's monthly equivalent using fixed multipliers:
  `monthly ×1 · weekly ×4 · biweekly ×2 · semi_monthly_15_30 ×2`.
  Never 52/12 or any fractional math. Implement as a pure helper `monthlyEquivalent(item)` in `src/lib/engine/` with unit tests (weekly 20,000_00 → 80,000_00). Audit for float leakage — a displayed value like `86,666.7` means non-integer math somewhere; all sums must stay integer centavos. Note: the *forecast* keeps using real occurrence dates (a 5-Saturday month genuinely shows 5 incomes) — only these summary stats use multipliers.

- [x] **T23. Greeting shows name or email prefix (Bug #2).**
  Display name rule everywhere a user is greeted: `profile.name` if non-empty, else the part of their email before `@`. Never show a blank or "undefined" greeting.

## Phase 6 — Budgets (variable monthly spending)

A **budget** is a monthly allocation for variable spending (food, gas, grocery). Unlike bills, the amount isn't fixed — the user logs spends against it during the month.

### Data model
`budgets`: id, user_id, name, monthly_allocation (bigint centavos), created_at.
`budget_entries`: id, user_id, budget_id (fk, cascade delete), entry_date (date), amount (bigint centavos, positive = money spent), note (text nullable), created_at.
Owner-only RLS on both.

### Behavior rules
1. **Current month**: the forecast shows one outflow per budget, amount = `max(allocation − sum(entries this calendar month), 0)`, dated **today**. If spends exceed the allocation, remaining is 0 and the UI shows an "over by ₱X" flag.
2. **Future months**: one outflow per budget per month for the **full allocation**, dated the **1st of the month** (conservative: assumes the money can be spent early). Generated to the same horizon as recurring items.
3. **No rollover**: unspent amounts vanish at month end; each month resets to the full allocation.
4. **Logging a spend** creates a `budget_entries` row AND a settlement row (source_type `budget`, forecasted_amount = 0-context not required; record name = budget name + note, actual_amount = −amount, actual_date = entry_date, type `budget`) so History stays a complete record of actual money movement.
5. Budget forecast rows are type `budget` (no overrides, no settle action on them — they update automatically as spends are logged).

### Engine
Extend `generateForecast` input with `budgets` and `budgetEntries`; emit budget occurrence rows per the rules above. Required tests: remaining calc mid-month; overspend → 0 + over flag; month boundary reset; future months full allocation on the 1st; integer math.

### Tasks
- [x] **T24.** Migration: `budgets` + `budget_entries` + RLS. Save in `supabase/migrations/`.
- [x] **T25.** Engine: budget occurrence generation + all tests above.
- [ ] **T26.** Budgets page (`/budgets`): CRUD for budgets; per-budget card with progress bar (spent vs allocation, over-flag state), current-month entries list, and a quick "Log spend" form (amount, date defaulting to today, note). Add "Budgets" to the sidebar under Transaction Types.
- [ ] **T27.** Integration: budget rows appear in the Forecast list (type color below); History shows logged spends; Dashboard gets a compact "Budgets this month" card (each budget: name, spent/allocation mini progress bar).

## Phase 7 — Notion-style redesign

Goal: calm, flat, content-first. Hairline borders instead of shadows, generous whitespace, muted grays, small accents. Restyle only — no behavior changes in this phase.

### Design tokens (put in `tailwind.config` / CSS variables; use everywhere)
- Background `#FFFFFF`; sidebar `#F7F7F5`; hover fill `#F1F1EF`; hairline border `#E9E9E7` (1px, no shadows except modals: `0 4px 12px rgba(0,0,0,0.08)`).
- Text primary `#37352F`; secondary `#787774`; disabled `#B9B9B7`.
- Accent blue `#2383E2` (primary buttons, links, focus rings).
- Semantic type colors (Notion palette): income green `#0F7B6C`, debt orange `#D9730D`, savings blue `#2383E2`, extra purple `#6940A5`, budget teal `#0B6E99`, danger red `#E03E3E`.
- Soft pill backgrounds: green `#DDEDEA`, red `#FBE4E4`, orange `#FAEBDD`, blue `#DDEBF1`, purple `#EAE4F2`, gray `#EBECED`. Balance-range coloring maps to these (danger = red pill w/ dark red text; low = orange; medium = gray; high→highest = green pills of increasing saturation).
- Typography: Inter (fallback ui-sans-serif); base 14px; page titles 24px/600; card labels 12px uppercase-free, secondary color. Numbers get `tabular-nums`.
- Radius: 6px cards/inputs, 4px pills/buttons. Spacing: 24–32px page padding, 16px card padding.

### Layout rules
- **Full-width desktop**: remove max-width containers; fixed 240px sidebar; content fills the remaining viewport with fluid tables/grids.
- **Peaks and Drops keeps the v1 layout**: a year-by-month grid, each month showing two stacked pills — peak (top) and drop (bottom) — colored by balance range. Do not replace with a chart.
- Tables: full-width rows, hairline row dividers, row hover `#F1F1EF`, no zebra striping.

### Tasks
- [ ] **T28.** Foundation: tokens, Inter font, full-width layout shell, restyled sidebar + buttons/inputs/modals base components.
- [ ] **T29.** Restyle Dashboard (cards, Peaks & Drops pill grid per above) + Forecast (list, balance chips, edit/settle modal, reminders).
- [ ] **T30.** Restyle all CRUD pages (Balances, Bills, Income, Debt, Savings, Extras, Budgets) — shared table + form styling.
- [ ] **T31.** Restyle Auth, Settings, History; consistency pass: hover/focus states, empty states, loading states. Screenshot review with the user before closing the phase.

**Still out of scope**: payments, mobile app, notifications, bank sync.
