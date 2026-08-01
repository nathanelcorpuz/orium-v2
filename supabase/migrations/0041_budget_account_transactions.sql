-- 0041: Add/Take/Move funds ledger for budget accounts (SPEC.md T209)
--
-- User follow-up to T204: "budget accounts should have almost identical
-- functionality with main accounts, but they don't have to have projected
-- total balance" - mirrors balance_transactions (migration 0036) exactly,
-- for the same reason: budget_accounts.amount stays the authoritative
-- cached current value, this table exists for the log/audit trail and an
-- optional comment, not to replace it. Deliberately not part of the
-- forecast engine at all, same as budget_accounts itself - "no projected
-- total balance" was the user's own explicit carve-out.

create table if not exists public.budget_account_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_account_id uuid not null references public.budget_accounts(id) on delete cascade,
  entry_date date not null,
  amount bigint not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  note text,
  created_at timestamptz not null default now(),
  constraint budget_account_transactions_amount_positive check (amount > 0)
);

alter table public.budget_account_transactions enable row level security;

create policy "budget_account_transactions_select_own" on public.budget_account_transactions
  for select using (auth.uid() = user_id);
create policy "budget_account_transactions_insert_own" on public.budget_account_transactions
  for insert with check (auth.uid() = user_id);
create policy "budget_account_transactions_update_own" on public.budget_account_transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budget_account_transactions_delete_own" on public.budget_account_transactions
  for delete using (auth.uid() = user_id);

create index if not exists budget_account_transactions_budget_account_id_idx
  on public.budget_account_transactions (budget_account_id);
