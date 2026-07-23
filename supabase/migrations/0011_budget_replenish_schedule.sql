-- T58 (SPEC.md Phase 11): re-adds a budget's own recurrence schedule,
-- dropped by migration 0010 when Phase 10 cut budgets over to a plain
-- running ledger. Phase 11 extends that ledger with a third replenish mode
-- ("replenish every") alongside "connected to an income" and "manual" -
-- these columns are exactly the shape 0010 dropped (reusing the
-- recurrence_unit/recurrence_ends_type enum types, which 0010 left alone
-- since recurring_items still uses them), plus a check keeping
-- linked_income_id and start_date mutually exclusive (a budget can't be
-- both income-linked and on its own schedule) and a new
-- budget_replenish_overrides table marking a projected replenish
-- occurrence as settled/skipped, mirroring occurrence_overrides for
-- recurring items but without move/edit fields (T59 scope: settle or leave
-- projected, no mid-air date/amount edits before settling).
--
-- Non-destructive: every new column is nullable, the new table is empty.
-- Existing budgets (all currently either income-linked or manual) are
-- unaffected - they simply have all these columns null, same as before
-- 0010 ran.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.budgets
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

-- A budget can't be both income-linked and on its own schedule.
do $$ begin
  alter table public.budgets add constraint budgets_income_xor_own_schedule
    check (linked_income_id is null or start_date is null);
exception
  when duplicate_object then null;
end $$;

create table if not exists public.budget_replenish_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  original_date date not null,
  skipped boolean not null default true,
  constraint budget_replenish_overrides_unique_occurrence unique (budget_id, original_date)
);

alter table public.budget_replenish_overrides enable row level security;

create policy "budget_replenish_overrides_select_own" on public.budget_replenish_overrides for select using (auth.uid() = user_id);
create policy "budget_replenish_overrides_insert_own" on public.budget_replenish_overrides for insert with check (auth.uid() = user_id);
create policy "budget_replenish_overrides_update_own" on public.budget_replenish_overrides for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budget_replenish_overrides_delete_own" on public.budget_replenish_overrides for delete using (auth.uid() = user_id);
