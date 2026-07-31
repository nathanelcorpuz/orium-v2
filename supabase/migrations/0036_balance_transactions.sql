-- 0036: Add/Take/Move funds ledger for accounts (SPEC.md T186)
--
-- User request: "I should be able to add, take, and move funds in accounts,
-- not just blindly update balances, so they are logged... those account
-- balance change transactions should also have a comment taggable to it."
--
-- Mirrors budget_entries' own shape (migration 0003/0009) - the Budget
-- ledger already answered the same "source of truth" question once (T57):
-- balances.amount stays the authoritative CACHED current value, updated
-- transactionally alongside each ledger insert (same read-then-write style
-- applyToBalance already uses for settlements), rather than recomputed from
-- this table on every read. This table exists for the log/audit trail and
-- the comment the user asked for, not to replace balances.amount.
--
-- A "move" between two accounts writes two rows here (one outgoing on the
-- source, one incoming on the destination) rather than inventing a third
-- direction - each leg is a complete, independently-meaningful ledger entry
-- on its own account, the same way a transfer between two real bank
-- accounts shows up as two separate lines on two separate statements.
--
-- Full CRUD RLS (all four policies), matching budget_entries exactly - a
-- logged amount/date/note is just as correctable as a budget entry already
-- is, not a append-only audit table like T162's activity_log.

create table if not exists public.balance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  balance_id uuid not null references public.balances(id) on delete cascade,
  entry_date date not null,
  amount bigint not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  note text,
  created_at timestamptz not null default now(),
  constraint balance_transactions_amount_positive check (amount > 0)
);

alter table public.balance_transactions enable row level security;

create policy "balance_transactions_select_own" on public.balance_transactions
  for select using (auth.uid() = user_id);
create policy "balance_transactions_insert_own" on public.balance_transactions
  for insert with check (auth.uid() = user_id);
create policy "balance_transactions_update_own" on public.balance_transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "balance_transactions_delete_own" on public.balance_transactions
  for delete using (auth.uid() = user_id);

create index if not exists balance_transactions_balance_id_idx on public.balance_transactions (balance_id);
