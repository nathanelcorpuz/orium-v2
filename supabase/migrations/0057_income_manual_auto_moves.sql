-- 0057: manual, one-off income auto-moves (SPEC.md T243) - user request
-- 2026-08-08
--
-- "allow me to add an auto move manually in any future income transaction,
-- even if it is not set in income page... a manual auto move to a different
-- account not connected to the original setup of the income, only for that
-- certain instance in the forecasted transaction of the income." Distinct
-- from income_auto_move_overrides (0049), which can only ever edit an
-- *existing* income_auto_moves rule's occurrence - this has no parent rule
-- to attach to at all, so it's its own table rather than a nullable-FK
-- variant of that one (its skipped/new_amount columns don't map cleanly onto
-- "this destination doesn't exist yet").
--
-- Deliberately no update policy: a manual entry is delete-and-re-add, not
-- editable in place - simpler than duplicating income_auto_move_overrides'
-- edit/skip/reset shape for something that only ever needs to exist or not.
create table if not exists public.income_manual_auto_moves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  income_id uuid not null references public.recurring_items(id) on delete cascade,
  original_date date not null,
  destination_balance_id uuid not null references public.balances(id) on delete cascade,
  amount bigint not null,
  created_at timestamptz not null default now(),
  constraint income_manual_auto_moves_amount_positive check (amount > 0),
  unique (income_id, original_date, destination_balance_id)
);

alter table public.income_manual_auto_moves enable row level security;

create policy "income_manual_auto_moves_select_own" on public.income_manual_auto_moves
  for select using (auth.uid() = user_id);
create policy "income_manual_auto_moves_insert_own" on public.income_manual_auto_moves
  for insert with check (auth.uid() = user_id);
create policy "income_manual_auto_moves_delete_own" on public.income_manual_auto_moves
  for delete using (auth.uid() = user_id);

create index if not exists income_manual_auto_moves_income_id_idx on public.income_manual_auto_moves (income_id);
create index if not exists income_manual_auto_moves_destination_balance_id_idx on public.income_manual_auto_moves (destination_balance_id);
