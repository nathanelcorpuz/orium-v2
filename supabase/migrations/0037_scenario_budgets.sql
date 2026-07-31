-- 0037: budgets in scenarios (SPEC.md T182)
--
-- User request: extend Scenarios (T174) to cover budgets - T174 deliberately
-- excluded them in v1 ("every budget column has its own replenish logic
-- that would have meaningfully widened this"), now reversed by direct ask.
--
-- Deliberately NOT full parity with the real Budgets page - no allocation,
-- no own replenish schedule, no linked-income auto-replenish. A scenario
-- budget is a named hypothetical "pot" the user logs planned future
-- incoming/outgoing entries against (`scenario_budget_entries`, mirroring
-- `budget_entries`), merged into the forecast as `budget_entry`-sourced rows
-- exactly like a real manual budget's future entries already work
-- (`futureBudgetLedgerEntries`). Reproducing the full replenish-schedule/
-- income-link machinery for a hypothetical, throwaway scenario is exactly
-- the scope-widening T174's own note warned about; this keeps the same
-- "one creation modal per item type" shape T174 already established for
-- scenario bills/income/debt/savings (ScenarioItemModal) and misc
-- (ScenarioOneOffModal), rather than cloning the real Budgets page's
-- richer multi-modal UI (Entries/Log spend/Add funds/Take funds).
--
-- Separate tables, not a tag column on the real budgets/budget_entries -
-- same reason T174's own architecture note gives: a leak into real data
-- must be structurally impossible, not just filtered correctly everywhere.

create table if not exists public.scenario_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.scenario_budgets enable row level security;

create policy "scenario_budgets_select_own" on public.scenario_budgets for select using (auth.uid() = user_id);
create policy "scenario_budgets_insert_own" on public.scenario_budgets for insert with check (auth.uid() = user_id);
create policy "scenario_budgets_update_own" on public.scenario_budgets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scenario_budgets_delete_own" on public.scenario_budgets for delete using (auth.uid() = user_id);

create table if not exists public.scenario_budget_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  scenario_budget_id uuid not null references public.scenario_budgets(id) on delete cascade,
  entry_date date not null,
  amount bigint not null check (amount > 0),
  note text,
  direction text not null check (direction in ('incoming', 'outgoing')),
  created_at timestamptz not null default now()
);

alter table public.scenario_budget_entries enable row level security;

create policy "scenario_budget_entries_select_own" on public.scenario_budget_entries for select using (auth.uid() = user_id);
create policy "scenario_budget_entries_insert_own" on public.scenario_budget_entries for insert with check (auth.uid() = user_id);
create policy "scenario_budget_entries_update_own" on public.scenario_budget_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scenario_budget_entries_delete_own" on public.scenario_budget_entries for delete using (auth.uid() = user_id);
