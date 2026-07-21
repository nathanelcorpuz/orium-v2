-- T36 (SPEC.md Phase 6B): budgets v2 columns - allocation (additive copy
-- of monthly_allocation), carryover, linked income, and the full
-- recurrence rule shape (reusing recurrence_unit/recurrence_ends_type,
-- created by migration 0004).
--
-- Non-destructive and safe to run now: `monthly_allocation` stays, so the
-- currently-deployed Budgets page (still reading/writing that column)
-- keeps working completely unchanged. A later migration (0007, written
-- but deliberately not run until T38 ships the new Budgets page and the
-- app no longer reads monthly_allocation) drops it - same two-file,
-- additive-then-drop pattern used for recurring_items in 0004/0005.
--
-- Every new column is nullable: a budget with no own-schedule (relying on
-- linked_income_id, or the final "monthly on the 1st" fallback per
-- SPEC.md) simply has all of them null. When a budget DOES have its own
-- schedule, interval/unit/start_date/ends_type move together (all set or
-- all null) - the same "complete rule or no rule" invariant recurring_items
-- enforces via NOT NULL, expressed here as a check since these columns
-- must stay nullable for budgets specifically.
--
-- App-level rule (not DB-enforced - no cross-table CHECK): linked_income_id
-- must point at a recurring_items row with type='income'. Enforce this in
-- the T38 form/action, not here.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor. Back up
-- first with pg_dump only if real data is at stake (see CLAUDE.md "Hard
-- rules" - free tier has no dashboard Backups).

alter table public.budgets
  add column if not exists allocation bigint,
  add column if not exists carryover_enabled boolean not null default true,
  add column if not exists linked_income_id uuid references public.recurring_items(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists "interval" int,
  add column if not exists unit recurrence_unit,
  add column if not exists weekdays int[],
  add column if not exists days_of_month int[],
  add column if not exists ordinal int,
  add column if not exists ordinal_weekday int,
  add column if not exists ends_type recurrence_ends_type,
  add column if not exists end_date date,
  add column if not exists occurrence_count int;

-- Backfill allocation from the existing column - a plain 1:1 copy, no
-- interpretation needed (unlike recurring_items' old frequency backfill).
update public.budgets set allocation = monthly_allocation where allocation is null;

alter table public.budgets alter column allocation set not null;

do $$ begin
  alter table public.budgets add constraint budgets_allocation_nonnegative check (allocation >= 0);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.budgets add constraint budgets_interval_positive
    check ("interval" is null or "interval" >= 1);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.budgets add constraint budgets_weekdays_range
    check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.budgets add constraint budgets_days_of_month_range
    check (days_of_month <@ array[
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
      17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
    ]);
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.budgets add constraint budgets_ordinal_range
    check (ordinal is null or ordinal in (1, 2, 3, 4, -1));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.budgets add constraint budgets_ordinal_weekday_range
    check (ordinal_weekday is null or ordinal_weekday between 0 and 6);
exception
  when duplicate_object then null;
end $$;

-- ordinal and ordinal_weekday are a pair: both set or both null.
do $$ begin
  alter table public.budgets add constraint budgets_ordinal_pair
    check ((ordinal is null) = (ordinal_weekday is null));
exception
  when duplicate_object then null;
end $$;

-- A budget's own schedule is complete-or-nothing: interval, unit,
-- start_date, and ends_type are all set together or all null.
do $$ begin
  alter table public.budgets add constraint budgets_own_schedule_complete
    check (
      ("interval" is null) = (unit is null)
      and (unit is null) = (start_date is null)
      and (start_date is null) = (ends_type is null)
    );
exception
  when duplicate_object then null;
end $$;

-- unit=week requires at least one selected weekday.
do $$ begin
  alter table public.budgets add constraint budgets_week_requires_weekdays
    check (unit <> 'week' or (weekdays is not null and array_length(weekdays, 1) > 0));
exception
  when duplicate_object then null;
end $$;

-- unit=month uses exactly one of days_of_month / the ordinal pair.
do $$ begin
  alter table public.budgets add constraint budgets_month_days_xor_ordinal
    check (unit <> 'month' or ((days_of_month is not null) <> (ordinal is not null)));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.budgets add constraint budgets_occurrence_count_positive
    check (occurrence_count is null or occurrence_count > 0);
exception
  when duplicate_object then null;
end $$;

-- ends_type dictates which of end_date / occurrence_count is set.
do $$ begin
  alter table public.budgets add constraint budgets_ends_type_consistency
    check (
      ends_type is null
      or (ends_type = 'never' and end_date is null and occurrence_count is null)
      or (ends_type = 'on_date' and end_date is not null and occurrence_count is null)
      or (ends_type = 'after_count' and occurrence_count is not null and end_date is null)
    );
exception
  when duplicate_object then null;
end $$;

-- Verification query (run manually, expect zero rows):
--   select id, monthly_allocation, allocation from public.budgets where allocation <> monthly_allocation;
