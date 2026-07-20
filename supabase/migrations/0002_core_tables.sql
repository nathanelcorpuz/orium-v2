-- Core tables for balances, recurring rules, overrides, one-off items,
-- settlements, and reminders. See SPEC.md "Data model" for the full design.

do $$ begin
  create type recurring_item_type as enum ('bill', 'income', 'debt', 'savings');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type recurring_frequency as enum ('monthly', 'weekly', 'biweekly', 'semi_monthly_15_30');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type settlement_source_type as enum ('recurring', 'one_off');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type settlement_type as enum ('bill', 'income', 'debt', 'savings', 'extra');
exception
  when duplicate_object then null;
end $$;

-- balances

create table if not exists public.balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount bigint not null,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.balances enable row level security;

create policy "balances_select_own" on public.balances for select using (auth.uid() = user_id);
create policy "balances_insert_own" on public.balances for insert with check (auth.uid() = user_id);
create policy "balances_update_own" on public.balances for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "balances_delete_own" on public.balances for delete using (auth.uid() = user_id);

-- recurring_items

create table if not exists public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type recurring_item_type not null,
  amount bigint not null,
  frequency recurring_frequency not null,
  day_of_month int,
  weekday int,
  start_date date not null,
  end_date date not null,
  comments text,
  constraint recurring_items_day_of_month_range check (day_of_month is null or day_of_month between 1 and 31),
  constraint recurring_items_weekday_range check (weekday is null or weekday between 0 and 6),
  constraint recurring_items_amount_sign check (
    (type = 'income' and amount > 0) or (type <> 'income' and amount < 0)
  )
);

alter table public.recurring_items enable row level security;

create policy "recurring_items_select_own" on public.recurring_items for select using (auth.uid() = user_id);
create policy "recurring_items_insert_own" on public.recurring_items for insert with check (auth.uid() = user_id);
create policy "recurring_items_update_own" on public.recurring_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_items_delete_own" on public.recurring_items for delete using (auth.uid() = user_id);

-- occurrence_overrides

create table if not exists public.occurrence_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_item_id uuid not null references public.recurring_items(id) on delete cascade,
  original_date date not null,
  new_date date,
  new_amount bigint,
  new_name text,
  skipped boolean not null default false,
  constraint occurrence_overrides_unique_occurrence unique (recurring_item_id, original_date)
);

alter table public.occurrence_overrides enable row level security;

create policy "occurrence_overrides_select_own" on public.occurrence_overrides for select using (auth.uid() = user_id);
create policy "occurrence_overrides_insert_own" on public.occurrence_overrides for insert with check (auth.uid() = user_id);
create policy "occurrence_overrides_update_own" on public.occurrence_overrides for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "occurrence_overrides_delete_own" on public.occurrence_overrides for delete using (auth.uid() = user_id);

-- one_off_items

create table if not exists public.one_off_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount bigint not null,
  due_date date not null,
  comments text
);

alter table public.one_off_items enable row level security;

create policy "one_off_items_select_own" on public.one_off_items for select using (auth.uid() = user_id);
create policy "one_off_items_insert_own" on public.one_off_items for insert with check (auth.uid() = user_id);
create policy "one_off_items_update_own" on public.one_off_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "one_off_items_delete_own" on public.one_off_items for delete using (auth.uid() = user_id);

-- settlements

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type settlement_source_type not null,
  source_id uuid,
  name text not null,
  type settlement_type not null,
  forecasted_amount bigint not null,
  actual_amount bigint not null,
  forecasted_date date not null,
  actual_date date not null,
  forecasted_balance bigint not null
);

alter table public.settlements enable row level security;

create policy "settlements_select_own" on public.settlements for select using (auth.uid() = user_id);
create policy "settlements_insert_own" on public.settlements for insert with check (auth.uid() = user_id);
create policy "settlements_update_own" on public.settlements for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settlements_delete_own" on public.settlements for delete using (auth.uid() = user_id);

-- reminders

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.reminders enable row level security;

create policy "reminders_select_own" on public.reminders for select using (auth.uid() = user_id);
create policy "reminders_insert_own" on public.reminders for insert with check (auth.uid() = user_id);
create policy "reminders_update_own" on public.reminders for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reminders_delete_own" on public.reminders for delete using (auth.uid() = user_id);
