-- 0043: settlements know which account moved (SPEC.md T217), and a budget
-- can connect to more than one budget account (SPEC.md T218)
--
-- T217: "need to see accounts used (main and budgets if there are) in the
-- history." settlements never recorded which balances/budget_accounts row a
-- given settle/spend/replenish/move actually touched, even though the app
-- code knew it at write time - just add the two nullable FKs.
--
-- T218: "budgets logging spend to have an option [for] what budget account
-- to log that spend with... this should allow multiple budget accounts
-- connected to a budget." budgets.budget_account_id (T204, migration 0040)
-- was a single optional link; replaced with a join table so a budget can
-- draw from several accounts. replenish_amount is each account's configured
-- share of the budget's own automatic replenishment (income-linked or
-- own-schedule) - meaningless for a manual budget, where every log
-- spend/add/take funds just picks one account per transaction instead.
-- budgets.budget_account_id itself is dropped in a later migration (0044),
-- once every caller has cut over and the backfill below is verified.

alter table public.settlements
  add column if not exists balance_id uuid references public.balances(id) on delete set null,
  add column if not exists budget_account_id uuid references public.budget_accounts(id) on delete set null;

create index if not exists settlements_balance_id_idx on public.settlements (balance_id);
create index if not exists settlements_budget_account_id_idx on public.settlements (budget_account_id);

create table if not exists public.budget_budget_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  budget_account_id uuid not null references public.budget_accounts(id) on delete cascade,
  replenish_amount bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint budget_budget_accounts_replenish_amount_nonnegative check (replenish_amount >= 0),
  unique (budget_id, budget_account_id)
);

alter table public.budget_budget_accounts enable row level security;

create policy "budget_budget_accounts_select_own" on public.budget_budget_accounts
  for select using (auth.uid() = user_id);
create policy "budget_budget_accounts_insert_own" on public.budget_budget_accounts
  for insert with check (auth.uid() = user_id);
create policy "budget_budget_accounts_update_own" on public.budget_budget_accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budget_budget_accounts_delete_own" on public.budget_budget_accounts
  for delete using (auth.uid() = user_id);

create index if not exists budget_budget_accounts_budget_id_idx on public.budget_budget_accounts (budget_id);
create index if not exists budget_budget_accounts_budget_account_id_idx on public.budget_budget_accounts (budget_account_id);

-- Backfill: every budget's existing single link becomes one row, its whole
-- allocation as that one account's share - the sum-of-shares-equals-
-- allocation invariant holds immediately for every already-linked budget.
insert into public.budget_budget_accounts (user_id, budget_id, budget_account_id, replenish_amount)
select user_id, id, budget_account_id, allocation
from public.budgets
where budget_account_id is not null
on conflict (budget_id, budget_account_id) do nothing;
