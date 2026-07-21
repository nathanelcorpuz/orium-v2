-- T32 (SPEC.md Phase 6A): flexible recurrence rules on recurring_items.
-- Replaces the fixed 4-frequency system (monthly/weekly/biweekly/
-- semi_monthly_15_30) with Google-Calendar-style rules: interval + unit
-- (day/week/month/year), weekdays / days_of_month / nth-weekday, and an
-- ends_type (never/on_date/after_count). See SPEC.md "Phase 6A".
--
-- HOW TO RUN (manual, per CLAUDE.md — never run destructive DB commands
-- automatically):
--   1. Back up first ONLY if the database holds real data you can't quickly
--      recreate (as of 2026-07-20 it doesn't — skip while that's true).
--      Method when it applies (free tier has no dashboard Backups — that
--      page is Pro-plan only): `npx supabase db dump --db-url
--      "<connection string>" -f orium-backup-YYYY-MM-DD.sql`. Connection
--      string: project dashboard (not Settings) > "Connect" button near the
--      top > "Direct connection" (not a pooler) > copy the URI, swap in the
--      database password (resettable under Project Settings > Database).
--   2. Run PART 1 in the Supabase SQL editor. It only adds columns and
--      backfills them; the old columns stay, and the new columns stay
--      nullable until Part 2, so the live app keeps working for reads AND
--      inserts throughout the T33-T35 rollout. Part 1 is safe to re-run,
--      including on a database where an earlier revision of this file
--      (which wrongly set the new columns NOT NULL) was applied.
--   3. Verify the backfill (queries at the end of Part 1).
--   4. Do NOT run PART 2 until T33-T35 have shipped and the deployed app
--      reads and writes only the new columns. Part 2 re-backfills any rows
--      created during the transition, enforces NOT NULL, then drops the old
--      columns. Running it early breaks the live app.
--
-- ROLLBACK NOTES:
--   - Part 1 is additive and reversible: drop the eight new columns,
--     restore `not null` on frequency and end_date, drop types
--     recurrence_unit and recurrence_ends_type — safe as long as nothing
--     has started writing the new columns.
--   - Part 2 is NOT reversible in place: it drops frequency/day_of_month/
--     weekday outright. If Part 2 must be undone, restore from a pg_dump
--     backup taken immediately before running it.

-- =========================================================================
-- PART 1 — RUN NOW: add columns, backfill, constrain. Non-destructive,
-- re-runnable.
-- =========================================================================

do $$ begin
  create type recurrence_unit as enum ('day', 'week', 'month', 'year');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type recurrence_ends_type as enum ('never', 'on_date', 'after_count');
exception
  when duplicate_object then null;
end $$;

alter table public.recurring_items
  add column if not exists "interval" int,
  add column if not exists unit recurrence_unit,
  add column if not exists weekdays int[],
  add column if not exists days_of_month int[],
  add column if not exists ordinal int,
  add column if not exists ordinal_weekday int,
  add column if not exists ends_type recurrence_ends_type,
  add column if not exists occurrence_count int;

-- Relax NOT NULLs for the transition window (all no-ops where already
-- nullable):
--   - end_date must accept null for ends_type = never / after_count.
--   - frequency must accept null once T35 ships and new rows stop setting
--     it (it's dropped entirely in Part 2).
--   - interval/unit/ends_type stay nullable until Part 2 because the
--     currently deployed forms don't write them yet; making them NOT NULL
--     now would break every insert. Also repairs databases where the
--     earlier revision of this file set them NOT NULL.
alter table public.recurring_items alter column end_date drop not null;
alter table public.recurring_items alter column frequency drop not null;
alter table public.recurring_items alter column "interval" drop not null;
alter table public.recurring_items alter column unit drop not null;
alter table public.recurring_items alter column ends_type drop not null;

-- Backfill. start_date and end_date are already correct anchors, so every
-- existing row keeps its exact current schedule under the new rule shape.
--
-- Weekly/biweekly derive their weekday from start_date, NOT from the legacy
-- `weekday` column: the v1 engine (src/lib/engine/interval.ts) never read
-- that column — it just stepped 7/14 days from start_date — so the column
-- can be null or even disagree with the real schedule. dow(start_date) is
-- the day occurrences actually landed on. extract(dow) is 0=Sun..6=Sat,
-- matching our convention.
--
-- Monthly uses day_of_month (the v1 engine really reads it; forms validate
-- 1-31), falling back to start_date's day for any null — the v1 engine
-- emitted nothing for such rows, so the fallback only revives a rule that
-- was silently dead.
--
-- Guards make re-runs no-ops, protect rows that later get real new-column
-- values, and repair rows a partial earlier run may have left with a null
-- array element.
update public.recurring_items
  set "interval" = 1, unit = 'month',
      days_of_month = array[coalesce(day_of_month, extract(day from start_date)::int)],
      ends_type = 'on_date'
  where frequency = 'monthly' and (unit is null or days_of_month[1] is null);

update public.recurring_items
  set "interval" = 1, unit = 'week',
      weekdays = array[extract(dow from start_date)::int],
      ends_type = 'on_date'
  where frequency = 'weekly' and (unit is null or weekdays[1] is null);

update public.recurring_items
  set "interval" = 2, unit = 'week',
      weekdays = array[extract(dow from start_date)::int],
      ends_type = 'on_date'
  where frequency = 'biweekly' and (unit is null or weekdays[1] is null);

update public.recurring_items
  set "interval" = 1, unit = 'month', days_of_month = array[15, 30],
      ends_type = 'on_date'
  where frequency = 'semi_monthly_15_30' and unit is null;

-- Check constraints. All are written to pass when the new columns are null
-- (rows inserted by the pre-T35 app), so they only bite on rows that
-- actually use the new rule shape. No subqueries — Postgres forbids them in
-- CHECK constraints; array bounds use containment (<@) instead.

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_interval_positive check ("interval" >= 1);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_weekdays_range
    check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_days_of_month_range
    check (days_of_month <@ array[
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
    ]);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_ordinal_range
    check (ordinal is null or ordinal in (1, 2, 3, 4, -1));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_ordinal_weekday_range
    check (ordinal_weekday is null or ordinal_weekday between 0 and 6);
exception
  when duplicate_object then null;
end $$;

-- ordinal and ordinal_weekday are a pair: both set or both null.
do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_ordinal_pair
    check ((ordinal is null) = (ordinal_weekday is null));
exception
  when duplicate_object then null;
end $$;

-- unit=week requires at least one selected weekday.
do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_week_requires_weekdays
    check (unit <> 'week' or (weekdays is not null and array_length(weekdays, 1) > 0));
exception
  when duplicate_object then null;
end $$;

-- unit=month uses exactly one of days_of_month / the ordinal pair.
do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_month_days_xor_ordinal
    check (unit <> 'month' or ((days_of_month is not null) <> (ordinal is not null)));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_occurrence_count_positive
    check (occurrence_count is null or occurrence_count > 0);
exception
  when duplicate_object then null;
end $$;

-- ends_type dictates which of end_date / occurrence_count is set.
do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_ends_type_consistency
    check (
      ends_type is null
      or (ends_type = 'never' and end_date is null and occurrence_count is null)
      or (ends_type = 'on_date' and end_date is not null and occurrence_count is null)
      or (ends_type = 'after_count' and occurrence_count is not null and end_date is null)
    );
exception
  when duplicate_object then null;
end $$;

-- Verification queries (run manually, expect zero rows from each):
--   select id, frequency from public.recurring_items where unit is null;
--   select id from public.recurring_items where frequency = 'monthly' and day_of_month is not null and days_of_month <> array[day_of_month];
--   select id from public.recurring_items where frequency in ('weekly','biweekly') and weekdays <> array[extract(dow from start_date)::int];
--   select id from public.recurring_items where frequency = 'semi_monthly_15_30' and days_of_month <> array[15,30];

-- =========================================================================
-- PART 2 — RUN LATER (only after T33-T35 are deployed and the app reads and
-- writes the new columns exclusively). Destructive: take a fresh pg_dump
-- backup immediately before running this part if there is real data.
-- Uncomment the block below to run it.
-- =========================================================================

-- -- Re-backfill rows created while the pre-T35 app was still writing only
-- -- the old columns (their new columns are null). Rows written by the
-- -- post-T35 app have unit set and are untouched. Same mapping as Part 1:
-- -- weekly/biweekly weekday comes from start_date, not the unused legacy
-- -- weekday column.
-- update public.recurring_items
--   set "interval" = 1, unit = 'month',
--       days_of_month = array[coalesce(day_of_month, extract(day from start_date)::int)],
--       ends_type = 'on_date'
--   where frequency = 'monthly' and unit is null;
-- update public.recurring_items
--   set "interval" = 1, unit = 'week',
--       weekdays = array[extract(dow from start_date)::int],
--       ends_type = 'on_date'
--   where frequency = 'weekly' and unit is null;
-- update public.recurring_items
--   set "interval" = 2, unit = 'week',
--       weekdays = array[extract(dow from start_date)::int],
--       ends_type = 'on_date'
--   where frequency = 'biweekly' and unit is null;
-- update public.recurring_items
--   set "interval" = 1, unit = 'month', days_of_month = array[15, 30],
--       ends_type = 'on_date'
--   where frequency = 'semi_monthly_15_30' and unit is null;
--
-- -- Every row must now have a complete rule. This fails loudly if any row
-- -- somehow has neither old nor new columns set — investigate before
-- -- proceeding rather than forcing it.
-- alter table public.recurring_items
--   alter column "interval" set not null,
--   alter column unit set not null,
--   alter column ends_type set not null;
--
-- alter table public.recurring_items
--   drop column frequency,
--   drop column day_of_month,
--   drop column weekday;
--
-- drop type if exists recurring_frequency;
