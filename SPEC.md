# Orium — Product Spec (v1 Rebuild)

## What Orium is

Orium is a family cash-flow forecasting app. Users manually enter their account balances, recurring bills, income, debt payments, savings goals, and one-off expenses. Orium projects every upcoming transaction in chronological order and shows the **running future balance** at each date, color-coded by safety level. The core promise: *know exactly how much money you'll have on any future date, and never miss a bill.*

v1 goal: feature parity with the original Orium (github.com/nathanelcorpuz/orium reference), rebuilt on a cleaner engine and modern stack. Subscriptions and mobile come later — do not build them in v1.

## Tech stack (fixed — do not add alternatives)

- Next.js (latest stable, App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth (email/password), Row Level Security
- `@supabase/supabase-js` + `@supabase/ssr` for Next.js integration (follow official Supabase Next.js quickstart patterns)
- Vitest for unit tests (engine only)
- No other dependencies without asking the user first

## Core design rules (non-negotiable)

1. **Money is stored as integer centavos.** Never floats. `₱1,500.00` = `150000`. Format for display only at the UI layer. Default currency symbol: `₱` (user-configurable in preferences).
2. **Due dates are calendar dates**, stored and passed as `YYYY-MM-DD` strings (Postgres `date` type). Never UTC timestamps for due dates — this avoids timezone drift bugs.
3. **Recurrence rules, not pre-generated rows.** The old Orium inserted every future transaction as a database row, which made edits cascade painfully. The rebuild stores *rules* and computes occurrences on the fly (see Engine below).
4. **The forecast engine is a pure TypeScript module** in `src/lib/engine/`. No database or network calls inside it. Fully unit-tested. UI and API layers call it with plain data.
5. **Every table has `user_id`** referencing `auth.users`, with RLS policies so users can only read/write their own rows.

## Data model (Postgres)

### `balances`
Real money accounts (cash, bank, e-wallets).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | RLS |
| name | text | e.g. "UB nanay", "cash", "wise" |
| amount | bigint | centavos |
| comments | text nullable | |
| created_at / updated_at | timestamptz | |

### `recurring_items`
One row per recurring rule. Replaces the old Bill / Income / Debt / Savings collections.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| name | text | |
| type | text enum | `bill` \| `income` \| `debt` \| `savings` |
| amount | bigint | centavos; sign convention: bills/debt/savings negative, income positive |
| frequency | text enum | `monthly` \| `weekly` \| `biweekly` \| `semi_monthly_15_30` |
| day_of_month | int nullable | 1–31, for `monthly` |
| weekday | int nullable | 0–6 (Sun–Sat), for `weekly`/`biweekly` |
| start_date | date | when the rule begins; also anchors biweekly cadence |
| end_date | date | last date occurrences are generated (debt payoff date, savings goal date, or tracking horizon) |
| comments | text nullable | |

### `occurrence_overrides`
Per-instance edits to a recurring rule (like calendar app exceptions).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| recurring_item_id | uuid fk | |
| original_date | date | identifies which occurrence is overridden |
| new_date | date nullable | moved due date |
| new_amount | bigint nullable | changed amount, centavos |
| new_name | text nullable | |
| skipped | boolean default false | occurrence removed from forecast |

Unique constraint on (`recurring_item_id`, `original_date`).

### `one_off_items`
The old "Extras" — single dated transactions (birthdays, gifts, refunds).
| column | type | notes |
|---|---|---|
| id, user_id | | |
| name | text | |
| amount | bigint | centavos, signed |
| due_date | date | |
| comments | text nullable | |

### `settlements`
The old "History" — what actually happened. Created when the user settles an occurrence.
| column | type | notes |
|---|---|---|
| id, user_id | | |
| source_type | text | `recurring` \| `one_off` |
| source_id | uuid nullable | original rule/item id |
| name | text | |
| type | text | bill/income/debt/savings/extra |
| forecasted_amount | bigint | |
| actual_amount | bigint | |
| forecasted_date | date | |
| actual_date | date | |
| forecasted_balance | bigint | running balance at settle time |

Settling a recurring occurrence also writes a `skipped` override for that `original_date` so it disappears from the forecast.

### `reminders`
| id, user_id, text (text), created_at |

### `preferences`
One row per user, created on signup.
| column | type | notes |
|---|---|---|
| user_id | uuid pk | |
| currency | text default '₱' | |
| balance_ranges | bigint[] default | 5 ascending thresholds in centavos: [danger, low, medium, high, higher]. Balance ≤ ranges[0] = danger; above ranges[4] = highest. |

## The forecast engine (`src/lib/engine/`)

Pure functions. Signature sketch:

```ts
generateForecast(input: {
  balances: Balance[];
  recurringItems: RecurringItem[];
  overrides: OccurrenceOverride[];
  oneOffs: OneOffItem[];
  today: string;        // YYYY-MM-DD
  horizon: string;      // YYYY-MM-DD, e.g. today + 3 years
}): ForecastRow[]
```

Each `ForecastRow`: `{ sourceType, sourceId, originalDate, name, amount, dueDate, type, runningBalance }`.

Behavior:
1. Expand each recurring rule into occurrences from `max(today, start_date)` to `min(horizon, end_date)`.
2. Apply overrides: replace date/amount/name; drop skipped occurrences.
3. Merge with one-off items dated today or later.
4. Sort by due date (stable: income before expenses on same date is NOT required — keep insertion-stable sort by date only).
5. Running balance = sum of all `balances.amount`, then cumulative addition of each occurrence's signed amount, rounded to integer centavos.

Recurrence expansion rules:
- `monthly` on `day_of_month`: if the month is shorter than the day (e.g. day 31 in April, day 29–31 in February), clamp to the **last day of that month**.
- `weekly` / `biweekly`: occurrences every 7 / 14 days anchored on `start_date`.
- `semi_monthly_15_30`: the 15th and 30th of each month; in February use the 15th and the **last day of February**.
- Occurrences strictly before `today` are excluded (they belong in settlements).

Test cases that MUST exist (Vitest):
- Day-31 monthly bill across Feb/Apr (clamping)
- Leap year February (Feb 29)
- semi_monthly_15_30 across February
- Biweekly anchored mid-week across a month boundary
- Override moves a date, changes amount, skips an occurrence
- Running balance math with mixed positive/negative amounts
- end_date cuts off generation; start_date in the future delays it

## Pages & features (v1)

All pages require auth; unauthenticated users go to `/login`.

1. **Auth**: sign up (email verification via Supabase), log in, log out, password reset.
2. **Dashboard** (`/`): cards for Total Balance, Total Monthly Bills, Total Monthly Income; per-balance breakdown; Remaining Debt + debt-free date (latest debt `end_date`) + days until; monthly **Peaks and Drops** grid — for each month in the forecast horizon, the max and min running balance.
3. **Forecast** (`/forecast`): total balance + editable balance chips; the full occurrence list (name, amount, due date, type, running balance) color-coded by `balance_ranges` (danger = dark, low = red tint, medium = white, high→highest = deepening green). Clicking a row opens an **Edit / Settle modal**: edit occurrence (writes override) or settle (enter actual amount + actual date → writes settlement). Right sidebar: reminders list with add/edit/delete.
4. **Balances** (`/balances`): CRUD.
5. **Bills / Income / Debt / Savings** (`/bills`, `/income`, `/debt`, `/savings`): CRUD over `recurring_items` filtered by type. Bills: monthly only (day + track-until date). Income: all four frequencies. Debt & Savings: monthly with start + end dates. Each page shows its total (monthly bills total, monthly income total, total remaining debt = sum of remaining occurrences).
6. **Extras** (`/extra`): CRUD over `one_off_items`; shows total of remaining extras.
7. **History** (`/history`): settlements table showing forecasted vs actual amount and date, forecasted balance, type.
8. **Settings** (`/settings`): profile (name, email), preferences (currency, balance ranges), log out, delete account (deletes all user data — required later by app stores).

Type colors (match old Orium): income green, debt orange, savings blue, extra purple, bill default text.

## Phased task list

Each task ≈ one 1-hour session. Finish = builds cleanly, works in the browser, tests pass, committed to git.

**Phase 0 — Foundation**
- [x] T1. Scaffold Next.js + TypeScript + Tailwind; git init; push to GitHub; `.env.local` in `.gitignore`.
- [x] T2. Supabase project connection: env vars, browser + server clients per `@supabase/ssr` docs; health-check page proving connection.
- [x] T3. Auth: sign up / log in / log out / password reset pages; middleware protecting all app routes; auto-create `preferences` row on first login.

**Phase 1 — Schema + Engine (the product's heart)**
- [x] T4. SQL migration: all tables above + RLS policies (owner-only) + enums + constraints. Run in Supabase SQL editor; save the SQL in `supabase/migrations/`.
- [x] T5. Engine: types + monthly expansion incl. clamping; Vitest setup; tests green.
- [x] T6. Engine: weekly, biweekly, semi_monthly_15_30 + February cases; tests.
- [x] T7. Engine: overrides (move/change/skip), one-offs merge, running balance; tests.

**Phase 2 — CRUD pages**
- [x] T8. Balances page (list, add, edit, delete) + shared modal/form components.
- [x] T9. Bills page.
- [x] T10. Income page (frequency-dependent form fields).
- [ ] T11. Debt page + Savings page (same pattern).
- [ ] T12. Extras page.

**Phase 3 — Forecast, History, Dashboard**
- [ ] T13. Forecast page: fetch data, run engine, render color-coded list + balance chips.
- [ ] T14. Edit/Settle modal → overrides + settlements; balance chip editing.
- [ ] T15. History page + Reminders sidebar.
- [ ] T16. Dashboard cards + Peaks and Drops grid.
- [ ] T17. Settings page: preferences (currency, balance ranges), profile, delete account.

**Phase 4 — Polish & ship**
- [ ] T18. Responsive pass (usable on a phone browser).
- [ ] T19. Loading, empty, and error states everywhere; form validation.
- [ ] T20. Privacy Policy + Terms pages (static; content provided by user).
- [ ] T21. Deploy to Vercel; production Supabase env vars; smoke test.

**Out of scope for v1** (do not build yet): payments/subscriptions, Expo mobile app, bank sync, multi-user families, notifications/emails beyond auth.
