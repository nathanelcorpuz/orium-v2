-- 0040: budget accounts (SPEC.md T204) - user request 2026-08-01
--
-- "I want to create accounts specified for budgets as well. The main
-- accounts used in the cash flow will be separate, and I need another set
-- of accounts that will be used as storage for the budgets." Confirmed
-- shape: optional link (a budget may or may not have one, same as bills/
-- income optionally link to a main account, T71), never counted toward
-- Total Balance or the forecast, managed from a sub-section on the Budgets
-- page rather than a new top-level nav item.
--
-- A separate table rather than reusing `balances` - a budget account is
-- deliberately never part of the cash-flow engine at all (no
-- transaction_fee_centavos, never read by generateForecast/loadForecast's
-- balances array), so giving it the same table would mean every future
-- query against `balances` needs a filter to keep it out of the forecast
-- it was never supposed to touch.
create table if not exists public.budget_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount bigint not null default 0,
  comments text,
  created_at timestamptz not null default now()
);

alter table public.budget_accounts enable row level security;

create policy "budget_accounts_select_own" on public.budget_accounts
  for select using (auth.uid() = user_id);
create policy "budget_accounts_insert_own" on public.budget_accounts
  for insert with check (auth.uid() = user_id);
create policy "budget_accounts_update_own" on public.budget_accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budget_accounts_delete_own" on public.budget_accounts
  for delete using (auth.uid() = user_id);

-- Optional link, same convention as recurring_items.balance_id/
-- one_off_items.balance_id (migration 0012) - `on delete set null` so
-- deleting a budget account never takes the budget itself down with it.
alter table public.budgets
  add column if not exists budget_account_id uuid references public.budget_accounts(id) on delete set null;

create index if not exists budgets_budget_account_id_idx on public.budgets (budget_account_id);
