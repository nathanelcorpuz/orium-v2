-- T72 (SPEC.md Phase 12): debt and savings items must always have a finite
-- end (ends_type on_date or after_count), so their total occurrence count
-- is always computable for the settled/total progress bar
-- (src/lib/engine/goalProgress.ts). Verified via execute_sql before writing
-- this migration - every existing debt/savings row already uses
-- ends_type='on_date', so this is a non-destructive, immediately-valid
-- constraint, not a backfill.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.recurring_items
  add constraint recurring_items_debt_savings_require_end
  check (type not in ('debt', 'savings') or ends_type <> 'never');
