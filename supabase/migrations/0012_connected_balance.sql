-- T71 (SPEC.md Phase 12): optional connected account per finance item.
-- Bills/income/debt/savings (recurring_items) and extras (one_off_items)
-- can each optionally link to a balances row - when set, settling that
-- item's Forecast occurrence pre-selects the account and applies the
-- actual (signed) amount to it automatically. `on delete set null` so
-- deleting an account just unlinks whatever pointed at it rather than
-- blocking the delete or cascading into unrelated data.
--
-- Non-destructive: both columns are nullable, no existing rows change.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.recurring_items
  add column if not exists balance_id uuid references public.balances(id) on delete set null;

alter table public.one_off_items
  add column if not exists balance_id uuid references public.balances(id) on delete set null;
