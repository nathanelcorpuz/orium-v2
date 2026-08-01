-- 0042: income auto-move (SPEC.md T212) - user request 2026-08-01
--
-- "when an income arrives to a certain account connected to it, it needs to
-- auto move a portion of the income amount received to another main
-- account, and this auto move should also reflect in the projected total
-- balance." Decision made the same day: the rule lives on the income (not
-- the destination account), so one income can define several "on settle,
-- move ₱X to account Y" rules (e.g. splitting one paycheck across several
-- accounts) - the same "optional link" shape T71/T204 already established,
-- just one-to-many instead of one-to-one.
--
-- Only takes effect once the income itself has a connected account
-- (recurring_items.balance_id, T71) - that's the account the move actually
-- comes from; settleOccurrence (forecast/actions.ts) skips a rule
-- otherwise, same as it already does for budget replenishment. The settle-
-- time legs are written to balance_transactions, the same two-leg shape
-- moveAccountFunds (T186) already established.

create table if not exists public.income_auto_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  income_id uuid not null references public.recurring_items(id) on delete cascade,
  destination_balance_id uuid not null references public.balances(id) on delete cascade,
  amount bigint not null,
  created_at timestamptz not null default now(),
  constraint income_auto_moves_amount_positive check (amount > 0)
);

alter table public.income_auto_moves enable row level security;

create policy "income_auto_moves_select_own" on public.income_auto_moves
  for select using (auth.uid() = user_id);
create policy "income_auto_moves_insert_own" on public.income_auto_moves
  for insert with check (auth.uid() = user_id);
create policy "income_auto_moves_update_own" on public.income_auto_moves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "income_auto_moves_delete_own" on public.income_auto_moves
  for delete using (auth.uid() = user_id);

create index if not exists income_auto_moves_income_id_idx on public.income_auto_moves (income_id);
create index if not exists income_auto_moves_destination_balance_id_idx on public.income_auto_moves (destination_balance_id);
