-- 0047: scenario budgets can reference real incomes and real budget
-- accounts, not just their own scenario-only equivalents (SPEC.md T223)
--
-- User request 2026-08-02: "adding budgets in scenarios should inherit all
-- actual data i.e. all active income should be available as options in the
-- scenario budget. that goes with accounts as well. both main and budget
-- accounts. [...] if a real data is removed from the actual financial
-- data [...] it will be removed from there as well." Bills/income/debt/
-- savings/misc items already do this for main accounts (`balance_id`,
-- migration 0033, `on delete set null`) - this extends the same pattern to
-- scenario budgets, which T221 (migration 0046) had only linked to the
-- scenario's own hypothetical incomes.
--
-- `linked_income_id` points at a REAL income (recurring_items) - safe to
-- reference directly (no new "leak" risk) because linking to it only
-- affects the Forecast's existing projection (forecast.ts already treats
-- any budget with a resolvable `linkedIncomeId` the same regardless of
-- whether it's real or scenario-sourced, since real incomes' occurrence
-- dates are already computed either way). It deliberately does NOT make
-- settling that real income write into scenario_budget_entries - a
-- scenario stays inert with respect to real data in that direction, same
-- as it always has; only the projection is shared.
--
-- `budget_account_id` points at a REAL budget account - single link
-- (mirroring T204's original pre-T218 shape, not T218's full
-- many-to-many), since a hypothetical "what if I connected this scenario
-- budget to more than one account" is more complexity than this ask needs.
-- Purely a reference for "where would this live" - logging a scenario
-- budget entry never calls applyToBudgetAccount, so a scenario can never
-- move real money through this link either; only "Activate permanently"
-- (scenarios/actions.ts) turns it into a real budget_budget_accounts row.

alter table public.scenario_budgets
  add column if not exists linked_income_id uuid references public.recurring_items(id) on delete set null,
  add column if not exists budget_account_id uuid references public.budget_accounts(id) on delete set null;

-- Replaces migration 0046's two-way exclusion with a three-way one: at
-- most one of {real income link, scenario income link, own schedule} may
-- be set at a time - the same "pick exactly one replenish source" rule the
-- form itself enforces (readScenarioBudgetForm, scenarios/actions.ts).
alter table public.scenario_budgets drop constraint if exists scenario_budgets_income_xor_own_schedule;

do $$ begin
  alter table public.scenario_budgets add constraint scenario_budgets_replenish_source_exclusive
    check (
      (case when linked_income_id is not null then 1 else 0 end)
      + (case when linked_scenario_income_id is not null then 1 else 0 end)
      + (case when start_date is not null then 1 else 0 end) <= 1
    );
exception when duplicate_object then null;
end $$;

create index if not exists scenario_budgets_linked_income_id_idx on public.scenario_budgets (linked_income_id);
create index if not exists scenario_budgets_budget_account_id_idx on public.scenario_budgets (budget_account_id);
