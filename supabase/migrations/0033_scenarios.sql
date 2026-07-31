-- 0033: "run possible scenario" foundation (SPEC.md T174)
--
-- User request: click a button, anything added afterward is a simulation
-- that doesn't touch real data; the Forecast and Dashboard can assume that
-- scenario while it's toggled on; multiple scenarios can be saved and
-- switched between; a scenario can later be "activated" - its synthetic
-- entries become real, permanent rows.
--
-- Architecture decision, made directly per standing authority, and the
-- opposite of what the task's own scoping note assumed: genuinely SEPARATE
-- tables for scenario data (`scenario_recurring_items`,
-- `scenario_one_off_items`), not a `scenario_id` tag column added to the
-- real `recurring_items`/`one_off_items` tables.
--
-- The tag-column approach was the first design considered and rejected. It
-- would have required adding a matching filter to every one of the ~18
-- existing files that already query those two tables (every CRUD page,
-- every create/delete action, connectedItemsData.ts, wipeFinancialData.ts,
-- toggleActive.ts...), each one a place a scenario row could leak into a
-- real list if the filter were ever missing or wrong. Against real,
-- production financial data, that is an unacceptable amount of surface
-- area for a single mistake to show a family the wrong numbers. Separate
-- tables make that leak structurally impossible: none of those ~18
-- existing files change at all, and none of them can ever return a
-- scenario row, because scenario rows do not live in the tables those
-- files query. The one integration point is `loadForecast()`
-- (forecastData.ts), which now optionally merges a scenario's rows into
-- the arrays it already builds - additive, not a filter change.
--
-- Both new tables mirror only the columns the forecast engine actually
-- needs from recurring_items/one_off_items - not `active` (T175; a
-- scenario item that shouldn't count is simply deleted, not toggled), not
-- budgets/budget_entries (out of scope for v1 - the user's own examples
-- were plain financial additions like "what if we buy the car," not
-- budget-ledger mechanics, and every budget column has its own replenish
-- logic that would meaningfully widen this task).

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.scenarios enable row level security;

create policy "scenarios_select_own" on public.scenarios for select using (auth.uid() = user_id);
create policy "scenarios_insert_own" on public.scenarios for insert with check (auth.uid() = user_id);
create policy "scenarios_update_own" on public.scenarios for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scenarios_delete_own" on public.scenarios for delete using (auth.uid() = user_id);

-- Mirrors recurring_items' recurrence-rule shape (migration 0004) exactly,
-- so the same RecurrencePicker/recurrenceForm.ts code that already builds
-- and validates a rule for a real bill/income/debt/savings item can be
-- reused unchanged for a scenario item.
-- Constraints mirror recurring_items' own (migration 0004) exactly,
-- including its array-containment style (`<@`) rather than a subquery -
-- Postgres forbids subqueries in CHECK constraints, which that migration's
-- own comment notes explicitly.
create table if not exists public.scenario_recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  name text not null,
  type recurring_item_type not null,
  amount bigint not null,
  comments text,
  balance_id uuid references public.balances(id) on delete set null,
  start_date date not null,
  "interval" int not null check ("interval" >= 1),
  unit recurrence_unit not null,
  weekdays int[] check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]),
  days_of_month int[] check (days_of_month <@ array[
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31
  ]),
  ordinal int check (ordinal is null or ordinal in (1, 2, 3, 4, -1)),
  ordinal_weekday int check (ordinal_weekday is null or ordinal_weekday between 0 and 6),
  ends_type recurrence_ends_type not null,
  end_date date,
  occurrence_count int check (occurrence_count is null or occurrence_count > 0),
  constraint scenario_recurring_items_ordinal_pair check ((ordinal is null) = (ordinal_weekday is null)),
  constraint scenario_recurring_items_week_requires_weekdays
    check (unit <> 'week' or (weekdays is not null and array_length(weekdays, 1) > 0)),
  constraint scenario_recurring_items_month_days_xor_ordinal
    check (unit <> 'month' or ((days_of_month is not null) <> (ordinal is not null))),
  constraint scenario_recurring_items_ends_type_consistency check (
    (ends_type = 'never' and end_date is null and occurrence_count is null)
    or (ends_type = 'on_date' and end_date is not null and occurrence_count is null)
    or (ends_type = 'after_count' and occurrence_count is not null and end_date is null)
  )
);

alter table public.scenario_recurring_items enable row level security;

create policy "scenario_recurring_items_select_own" on public.scenario_recurring_items for select using (auth.uid() = user_id);
create policy "scenario_recurring_items_insert_own" on public.scenario_recurring_items for insert with check (auth.uid() = user_id);
create policy "scenario_recurring_items_update_own" on public.scenario_recurring_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scenario_recurring_items_delete_own" on public.scenario_recurring_items for delete using (auth.uid() = user_id);

create table if not exists public.scenario_one_off_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  name text not null,
  amount bigint not null,
  due_date date not null,
  comments text,
  balance_id uuid references public.balances(id) on delete set null
);

alter table public.scenario_one_off_items enable row level security;

create policy "scenario_one_off_items_select_own" on public.scenario_one_off_items for select using (auth.uid() = user_id);
create policy "scenario_one_off_items_insert_own" on public.scenario_one_off_items for insert with check (auth.uid() = user_id);
create policy "scenario_one_off_items_update_own" on public.scenario_one_off_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scenario_one_off_items_delete_own" on public.scenario_one_off_items for delete using (auth.uid() = user_id);

-- Which scenario (if any) the Forecast/Dashboard currently merge in. Null
-- on delete rather than cascade, so deleting the active scenario simply
-- turns scenario mode off instead of leaving a dangling reference.
alter table public.preferences
  add column if not exists active_scenario_id uuid references public.scenarios(id) on delete set null;

comment on column public.preferences.active_scenario_id is
  'T174: the scenario currently merged into the Forecast/Dashboard, if any. Null = scenario mode off.';
