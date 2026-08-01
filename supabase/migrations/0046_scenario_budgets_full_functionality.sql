-- 0046: scenario budgets get the same functionality as a real budget
-- (REMINDER, 2026-08-02 - "Adding a budget in a Scenario should allow me to
-- get all functionalities of adding a new budget in the real thing, not
-- just add a budget name")
--
-- Reverses part of migration 0037/T182's deliberate scope cut ("no
-- allocation, no own replenish schedule, no linked-income auto-replenish").
-- Mirrors `budgets`' own shape (allocation + the three-way replenish source)
-- with one structural difference: `linked_scenario_income_id` points at
-- `scenario_recurring_items`, never at a real income - a hypothetical
-- budget replenishing from *real* settled income would blur exactly the
-- "leak into real data must be structurally impossible" line 0037's own
-- comment already drew. Budget-account linking (T204/T218) is deliberately
-- excluded - a budget account is real storage for real money, and a
-- scenario never touches real money until "Activate permanently" copies its
-- items into real tables (at which point it becomes a real budget and can
-- be linked like any other).
--
-- Only the mutual-exclusion invariant is DB-enforced here (the one most
-- likely to produce genuinely bad state); the fuller battery of range/
-- shape checks `budgets` has (migration 0011) is left to the shared
-- RecurrencePicker/readRecurrenceRuleForm validation already used for every
-- other recurring-shaped form in this app, including this one.

alter table public.scenario_budgets
  add column if not exists allocation bigint not null default 0,
  add column if not exists linked_scenario_income_id uuid references public.scenario_recurring_items(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists interval int,
  add column if not exists unit text,
  add column if not exists weekdays int[],
  add column if not exists days_of_month int[],
  add column if not exists ordinal int,
  add column if not exists ordinal_weekday int,
  add column if not exists ends_type text,
  add column if not exists end_date date,
  add column if not exists occurrence_count int;

do $$ begin
  alter table public.scenario_budgets add constraint scenario_budgets_income_xor_own_schedule
    check (linked_scenario_income_id is null or start_date is null);
exception when duplicate_object then null;
end $$;

create index if not exists scenario_budgets_linked_scenario_income_id_idx
  on public.scenario_budgets (linked_scenario_income_id);
