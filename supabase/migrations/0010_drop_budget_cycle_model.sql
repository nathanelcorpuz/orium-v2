-- SPEC.md Phase 10 (T57): the cycle/allocation/carryover budget model
-- (Phase 6B) is fully replaced by the running ledger (budgetLedger.ts) -
-- nothing in the app reads these anymore as of this migration.
--
-- budget_occurrence_overrides existed solely to edit/skip a budget's
-- projected cycle-boundary rows in the Forecast table - those rows don't
-- exist anymore (T57 simplified forecast.ts to just future ledger entries),
-- so the table has no remaining purpose. Test data only (see CLAUDE.md) -
-- the one live row was leftover test-session noise, not a real record.
--
-- The schedule/carryover columns on budgets ("replenish on its own
-- schedule", carryover on/off) governed the old cycle math only -
-- replenishment is now either income-linked (T56, triggered by settling
-- that income) or manual (T55, Add funds/Take funds), and carryover is
-- implicit in a running ledger (nothing to opt in or out of).
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

drop table if exists public.budget_occurrence_overrides;

alter table public.budgets
  drop column if exists carryover_enabled,
  drop column if exists start_date,
  drop column if exists interval,
  drop column if exists unit,
  drop column if exists weekdays,
  drop column if exists days_of_month,
  drop column if exists ordinal,
  drop column if exists ordinal_weekday,
  drop column if exists ends_type,
  drop column if exists end_date,
  drop column if exists occurrence_count;
