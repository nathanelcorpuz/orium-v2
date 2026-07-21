-- T32 (SPEC2 Phase 6A): flexible recurrence rules on recurring_items.
-- Replaces the fixed 4-frequency system (monthly/weekly/biweekly/
-- semi_monthly_15_30) with Google-Calendar-style rules: interval + unit
-- (day/week/month/year), weekdays / days_of_month / nth-weekday, and an
-- ends_type (never/on_date/after_count). See SPEC2.md Phase 6A.
--
-- HOW TO RUN (manual, per CLAUDE.md — never run destructive DB commands
-- automatically):
--   1. Back up first, but only if the database holds real data you can't
--      quickly recreate (as of 2026-07-20 it doesn't — skip this step while
--      that's true). When it applies: the Supabase dashboard's "Database >
--      Backups" page is Pro-plan only — the free tier has no managed backup
--      feature. Instead, run a manual pg_dump via the Supabase CLI (works on
--      any plan): `npx supabase db dump --db-url "<connection string>" -f
--      orium-backup-YYYY-MM-DD.sql`. Get the connection string from the
--      project dashboard (not Settings): click the "Connect" button near the
--      top of the page, choose "Direct connection" (not a pooler — pg_dump
--      needs a direct connection), and copy the URI. It looks like
--      postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres
--      — swap in the database password (set at project creation; resettable
--      from Project Settings > Database if forgotten). See CLAUDE.md "Hard
--      rules" for this project's standing backup convention.
--   2. Run PART 1 now in the Supabase SQL editor. It only adds columns and
--      backfills them from existing data — nothing old is removed, so the
--      live app keeps working unchanged (it doesn't read the new columns
--      yet).
--   3. Verify the backfill (queries at the end of Part 1's block below).
--   4. Do NOT run PART 2 yet. Only run it after T33-T35 ship and the engine
--      no longer reads `frequency` / `day_of_month` / `weekday` — those
--      tasks are what actually start using the new columns. Running Part 2
--      early will break the live Forecast page.
--
-- ROLLBACK NOTES:
--   - Part 1 is additive and safe to reverse: `alter table recurring_items
--     drop column interval, drop column unit, drop column weekdays,
--     drop column days_of_month, drop column ordinal, drop column
--     ordinal_weekday, drop column ends_type, drop column occurrence_count;
--     alter table recurring_items alter column end_date set not null;
--     drop type if exists recurrence_unit; drop type if exists
--     recurrence_ends_type;` — safe as long as no other code has started
--     writing to the new columns.
--   - Part 2 is NOT safely reversible in place: it drops `frequency`,
--     `day_of_month`, and `weekday`, which is a real data loss (the new
--     columns are a faithful re-encoding, not a value-for-value copy, so
--     there's no formula back to the old columns). If Part 2 needs to be
--     undone, restore the Step 1 pg_dump backup instead of trying to
--     reconstruct the dropped columns from the new ones.

-- =========================================================================
-- PART 1 — RUN NOW: add columns, backfill, constrain. Non-destructive.
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
  add column if not exists interval int,
  add column if not exists unit recurrence_unit,
  add column if not exists weekdays int[],
  add column if not exists days_of_month int[],
  add column if not exists ordinal int,
  add column if not exists ordinal_weekday int,
  add column if not exists ends_type recurrence_ends_type,
  add column if not exists occurrence_count int;

-- end_date was `not null`; on_date is still the only ends_type this
-- backfill produces, but the column must accept null for never/after_count
-- going forward.
alter table public.recurring_items alter column end_date drop not null;

-- Backfill per SPEC2.md's mapping table. start_date and end_date are
-- unchanged (already correct anchors). Every existing row keeps its exact
-- current schedule under the new rule shape.
update public.recurring_items
  set interval = 1, unit = 'month', days_of_month = array[day_of_month],
      ends_type = 'on_date'
  where frequency = 'monthly';

update public.recurring_items
  set interval = 1, unit = 'week', weekdays = array[weekday],
      ends_type = 'on_date'
  where frequency = 'weekly';

update public.recurring_items
  set interval = 2, unit = 'week', weekdays = array[weekday],
      ends_type = 'on_date'
  where frequency = 'biweekly';

update public.recurring_items
  set interval = 1, unit = 'month', days_of_month = array[15, 30],
      ends_type = 'on_date'
  where frequency = 'semi_monthly_15_30';

-- Every row should now have interval/unit/ends_type set. Enforce it.
alter table public.recurring_items
  alter column interval set not null,
  alter column unit set not null,
  alter column ends_type set not null;

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_interval_positive check (interval >= 1);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_weekdays_range check (
      not exists (select 1 from unnest(weekdays) as w where w not between 0 and 6)
    );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.recurring_items
    add constraint recurring_items_days_of_month_range check (
      not exists (select 1 from unnest(days_of_month) as d where d not between 1 and 31)
    );
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
      (ends_type = 'never' and end_date is null and occurrence_count is null)
      or (ends_type = 'on_date' and end_date is not null and occurrence_count is null)
      or (ends_type = 'after_count' and occurrence_count is not null and end_date is null)
    );
exception
  when duplicate_object then null;
end $$;

-- Verification queries (run manually, expect zero rows from each):
--   select id, frequency from public.recurring_items where unit is null;
--   select id from public.recurring_items where frequency = 'monthly' and days_of_month <> array[day_of_month];
--   select id from public.recurring_items where frequency in ('weekly','biweekly') and weekdays <> array[weekday];
--   select id from public.recurring_items where frequency = 'semi_monthly_15_30' and days_of_month <> array[15,30];

-- =========================================================================
-- PART 2 — RUN LATER (after T33-T35 ship): drop the old frequency columns.
-- Everything below is destructive. Do not run until the engine and every
-- CRUD form read/write the new columns exclusively. Take a fresh pg_dump
-- backup immediately before running this part, even though Step 1 already
-- took one.
-- =========================================================================

-- alter table public.recurring_items
--   drop column frequency,
--   drop column day_of_month,
--   drop column weekday;
--
-- drop type if exists recurring_frequency;
