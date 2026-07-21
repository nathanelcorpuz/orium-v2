-- T32 (SPEC.md Phase 6A), step 2 of 2: drop the legacy frequency columns.
--
-- READY TO RUN. T33-T35 shipped and are deployed to production (2026-07-21)
-- — the live app now reads and writes only the new recurrence columns
-- (interval/unit/weekdays/days_of_month/ends_type...), so frequency/
-- day_of_month/weekday are no longer read anywhere.
--
-- HOW TO RUN:
--   1. This one IS destructive and not reversible in place. Back up first
--      with pg_dump only if the database holds real data you can't quickly
--      recreate (method in CLAUDE.md "Hard rules"); restoring that backup
--      is the only undo.
--   2. Paste this whole file into the Supabase SQL editor and run it.
--
-- Prerequisite: 0004_recurrence_rules.sql (step 1: add + backfill) has
-- been applied.

-- Re-backfill rows created while the pre-T35 app was still writing only
-- the old columns (their new columns are null). Rows written by the
-- post-T35 app have unit set and are untouched. Same mapping as 0004:
-- weekly/biweekly weekday comes from start_date, not the unused legacy
-- weekday column.
update public.recurring_items
  set "interval" = 1, unit = 'month',
      days_of_month = array[coalesce(day_of_month, extract(day from start_date)::int)],
      ends_type = 'on_date'
  where frequency = 'monthly' and unit is null;

update public.recurring_items
  set "interval" = 1, unit = 'week',
      weekdays = array[extract(dow from start_date)::int],
      ends_type = 'on_date'
  where frequency = 'weekly' and unit is null;

update public.recurring_items
  set "interval" = 2, unit = 'week',
      weekdays = array[extract(dow from start_date)::int],
      ends_type = 'on_date'
  where frequency = 'biweekly' and unit is null;

update public.recurring_items
  set "interval" = 1, unit = 'month', days_of_month = array[15, 30],
      ends_type = 'on_date'
  where frequency = 'semi_monthly_15_30' and unit is null;

-- Every row must now have a complete rule. This fails loudly if any row
-- somehow has neither old nor new columns set — investigate before
-- proceeding rather than forcing it.
alter table public.recurring_items
  alter column "interval" set not null,
  alter column unit set not null,
  alter column ends_type set not null;

alter table public.recurring_items
  drop column frequency,
  drop column day_of_month,
  drop column weekday;

drop type if exists recurring_frequency;
