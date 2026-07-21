-- Budgets: monthly allocations for variable spending, plus logged spends
-- against them. See SPEC.md (budgets baseline, T24-T25) for the design.

-- Logging a spend also writes a settlement row (SPEC.md spend-logging rule), so
-- the existing settlement enums need a 'budget' member ahead of that work.
alter type settlement_source_type add value if not exists 'budget';
alter type settlement_type add value if not exists 'budget';

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  monthly_allocation bigint not null,
  created_at timestamptz not null default now(),
  constraint budgets_monthly_allocation_nonnegative check (monthly_allocation >= 0)
);

alter table public.budgets enable row level security;

create policy "budgets_select_own" on public.budgets for select using (auth.uid() = user_id);
create policy "budgets_insert_own" on public.budgets for insert with check (auth.uid() = user_id);
create policy "budgets_update_own" on public.budgets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets_delete_own" on public.budgets for delete using (auth.uid() = user_id);

-- budget_entries

create table if not exists public.budget_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  entry_date date not null,
  amount bigint not null,
  note text,
  created_at timestamptz not null default now(),
  constraint budget_entries_amount_positive check (amount > 0)
);

alter table public.budget_entries enable row level security;

create policy "budget_entries_select_own" on public.budget_entries for select using (auth.uid() = user_id);
create policy "budget_entries_insert_own" on public.budget_entries for insert with check (auth.uid() = user_id);
create policy "budget_entries_update_own" on public.budget_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budget_entries_delete_own" on public.budget_entries for delete using (auth.uid() = user_id);
