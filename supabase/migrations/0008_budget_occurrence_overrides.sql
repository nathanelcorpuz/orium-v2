-- T42 (SPEC.md), part B: per-occurrence overrides for a budget's own
-- forecast rows, mirroring occurrence_overrides (migration 0002) so a
-- future "allocation" row (e.g. the next payday reset) can be moved to a
-- different date, have its amount changed, or be skipped - the same way a
-- bill/income occurrence already can be. Only *future* boundary rows are
-- ever keyed here; the "remaining this cycle" row (always dated today, a
-- live status snapshot, not a discrete future transaction) has no override
-- concept and is never looked up against this table - see budgetCycles.ts.
--
-- Non-destructive and safe to run now: a brand-new, empty, additive table.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

create table if not exists public.budget_occurrence_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  original_date date not null,
  new_date date,
  new_amount bigint,
  skipped boolean not null default false,
  constraint budget_occurrence_overrides_unique_occurrence unique (budget_id, original_date)
);

alter table public.budget_occurrence_overrides enable row level security;

create policy "budget_occurrence_overrides_select_own" on public.budget_occurrence_overrides for select using (auth.uid() = user_id);
create policy "budget_occurrence_overrides_insert_own" on public.budget_occurrence_overrides for insert with check (auth.uid() = user_id);
create policy "budget_occurrence_overrides_update_own" on public.budget_occurrence_overrides for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budget_occurrence_overrides_delete_own" on public.budget_occurrence_overrides for delete using (auth.uid() = user_id);
