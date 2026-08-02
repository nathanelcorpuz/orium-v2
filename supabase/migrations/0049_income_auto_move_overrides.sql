-- 0049: per-instance edits for projected income auto-moves (SPEC.md T224)
--
-- T212 gave an income auto-move a single flat amount, applied to every
-- future occurrence of the linked income with no exceptions. User request
-- 2026-08-02: "moving half of an income to another account for the rest of
-- time is not a good practice as it decreases flexibility" - a single
-- payday's move should be reducible, skippable, or movable to a different
-- date without touching the recurring rule itself.
--
-- Same shape budget_replenish_overrides settled on (migration 0011, extended
-- by 0027 for T168): skipped / new_date / new_amount, keyed by the parent
-- rule's id plus the occurrence's original date. One difference from that
-- table: `skipped` defaults to false here rather than true. A budget
-- replenishment's `skipped` doubles as "already handled by settleOccurrence",
-- because that row is independently settleable and needed a way to mark
-- itself done; an auto-move has no such independent settle path - it only
-- ever moves money alongside its income's own settle (forecast/actions.ts) -
-- so this table exists purely for a user's own edit, and an edit row should
-- read as "skip" only when the user actually asked for that.
create table if not exists public.income_auto_move_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  income_auto_move_id uuid not null references public.income_auto_moves(id) on delete cascade,
  original_date date not null,
  skipped boolean not null default false,
  new_date date,
  new_amount bigint,
  created_at timestamptz not null default now(),
  -- Positive magnitude, matching income_auto_moves.amount - the forecast
  -- negates/carries it per leg for display, so storing a negative here would
  -- double-negate.
  constraint income_auto_move_overrides_new_amount_positive check (new_amount is null or new_amount >= 0),
  unique (income_auto_move_id, original_date)
);

alter table public.income_auto_move_overrides enable row level security;

create policy "income_auto_move_overrides_select_own" on public.income_auto_move_overrides
  for select using (auth.uid() = user_id);
create policy "income_auto_move_overrides_insert_own" on public.income_auto_move_overrides
  for insert with check (auth.uid() = user_id);
create policy "income_auto_move_overrides_update_own" on public.income_auto_move_overrides
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "income_auto_move_overrides_delete_own" on public.income_auto_move_overrides
  for delete using (auth.uid() = user_id);

create index if not exists income_auto_move_overrides_auto_move_id_idx
  on public.income_auto_move_overrides (income_auto_move_id);
