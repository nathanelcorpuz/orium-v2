-- User request 2026-07-26: the sample dataset used real placeholder names
-- ("Nathan", "Aya") and long em dashes ("—") that don't belong in a real
-- user-facing demo. Redefines `seed_sample_data()` (0016) with the exact
-- same shape/numbers/dates, just with the em dashes replaced by plain
-- hyphens and the names swapped for the actual family this account belongs
-- to (NJ, Sheena, their son Orius) - `supabase/seed.sql` (the SQL-editor
-- workflow's own copy of the same story) got the identical treatment in the
-- same session, so both stay in sync.
create or replace function public.seed_sample_data(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance_checking uuid := gen_random_uuid();
  v_balance_gcash uuid := gen_random_uuid();
  v_balance_cash uuid := gen_random_uuid();

  v_income_salary uuid := gen_random_uuid();
  v_income_freelance uuid := gen_random_uuid();

  v_bill_rent uuid := gen_random_uuid();
  v_bill_health uuid := gen_random_uuid();
  v_bill_helper uuid := gen_random_uuid();
  v_bill_parking uuid := gen_random_uuid();
  v_bill_meralco uuid := gen_random_uuid();
  v_bill_pldt uuid := gen_random_uuid();
  v_bill_netflix uuid := gen_random_uuid();

  v_debt_car uuid := gen_random_uuid();
  v_debt_cc uuid := gen_random_uuid();

  v_savings_emergency uuid := gen_random_uuid();
  v_savings_college uuid := gen_random_uuid();

  v_budget_groceries uuid := gen_random_uuid();
  v_budget_dining uuid := gen_random_uuid();
  v_budget_gas uuid := gen_random_uuid();
begin
  -- Only the target user themselves (a normal authenticated app call) or an
  -- admin/service-role caller with no auth.uid() session (the SQL-editor
  -- workflow) may seed an account - never a different logged-in user.
  if auth.uid() is not null and auth.uid() <> target_user then
    raise exception 'Not authorized to seed data for another user';
  end if;

  -- ── Preferences ──────────────────────────────────────────────────────────
  insert into public.preferences (user_id, currency, balance_ranges, balance_tier_labels)
  values (
    target_user, '₱',
    array[0, 1500000, 4000000, 8000000, 30000000]::bigint[],
    array[
      '⚠ Lowest point goes negative by',
      'Getting tight:',
      'Lowest point ahead:',
      'Comfortable cushion:',
      'Solid cushion:',
      'Excellent cushion:'
    ]::text[]
  )
  on conflict (user_id) do update set
    currency = excluded.currency,
    balance_ranges = excluded.balance_ranges,
    balance_tier_labels = excluded.balance_tier_labels;

  -- ── Accounts (balances) ──────────────────────────────────────────────── ₱64,500 total
  insert into public.balances (id, user_id, name, amount, comments) values
    (v_balance_checking, target_user, 'BPI Checking', 5200000, 'main payroll account'),
    (v_balance_gcash,    target_user, 'GCash',         950000, null),
    (v_balance_cash,     target_user, 'Cash wallet',   300000, 'wallet + house cash');

  -- ── Recurring items ──────────────────────────────────────────────────────
  insert into public.recurring_items
    (id, user_id, name, type, amount, start_date, end_date, comments, balance_id,
     "interval", unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type)
  values
    -- Income
    (v_income_salary, target_user, 'Salary - NJ', 'income', 3500000,
     '2026-01-15', '2030-12-31', 'net of taxes', v_balance_checking,
     1, 'month', null, array[15, 30], null, null, 'on_date'),
    (v_income_freelance, target_user, 'Freelance - Sheena', 'income', 650000,
     '2026-01-02', '2028-12-31', 'design retainer, paid Fridays', v_balance_gcash,
     1, 'week', array[5], null, null, null, 'on_date'),
    -- Bills — one of each recurrence shape
    (v_bill_rent, target_user, 'Rent', 'bill', -1800000,
     '2026-01-01', '2030-12-31', null, v_balance_checking,
     1, 'month', null, array[1], null, null, 'on_date'),
    (v_bill_health, target_user, 'Health insurance premium', 'bill', -150000,
     '2026-01-01', '2029-12-31', 'twice a month', v_balance_checking,
     1, 'month', null, array[1, 15], null, null, 'on_date'),
    (v_bill_helper, target_user, 'House helper', 'bill', -800000,
     '2026-01-01', '2029-12-31', 'paid the 3rd Friday of every month', null,
     1, 'month', null, null, 3, 5, 'on_date'),
    (v_bill_parking, target_user, 'Parking fee', 'bill', -30000,
     '2026-01-05', '2028-12-31', 'weekday parking, billed weekly', v_balance_cash,
     1, 'week', array[1], null, null, null, 'on_date'),
    (v_bill_meralco, target_user, 'Meralco electricity', 'bill', -480000,
     '2026-01-21', '2030-12-31', 'varies with aircon season', v_balance_checking,
     1, 'month', null, array[21], null, null, 'on_date'),
    (v_bill_pldt, target_user, 'PLDT Home Fiber', 'bill', -169900,
     '2026-01-05', '2030-12-31', null, v_balance_checking,
     1, 'month', null, array[5], null, null, 'on_date'),
    (v_bill_netflix, target_user, 'Netflix', 'bill', -54900,
     '2026-01-12', '2030-12-31', null, null,
     1, 'month', null, array[12], null, null, 'on_date'),
    -- Debt (end_date = payoff date, drives the debt-free countdown + progress bar)
    (v_debt_car, target_user, 'Car loan - BPI Auto', 'debt', -950000,
     '2026-01-15', '2028-01-15', '24 monthly payments', v_balance_checking,
     1, 'month', null, array[15], null, null, 'on_date'),
    (v_debt_cc, target_user, 'Credit card installment', 'debt', -320000,
     '2026-02-28', '2026-11-28', 'appliance, 0% for 10 months', v_balance_checking,
     1, 'month', null, array[28], null, null, 'on_date'),
    -- Savings
    (v_savings_emergency, target_user, 'Emergency fund', 'savings', -300000,
     '2026-01-06', '2027-12-06', 'building up 6 months of expenses', v_balance_gcash,
     1, 'month', null, array[6], null, null, 'on_date'),
    (v_savings_college, target_user, 'Orius''s college fund', 'savings', -400000,
     '2026-01-30', '2031-01-30', null, null,
     1, 'month', null, array[30], null, null, 'on_date');

  -- ── Extras (one-off items) — both directions ─────────────────────────────
  insert into public.one_off_items (id, user_id, name, amount, due_date, comments, balance_id) values
    (gen_random_uuid(), target_user, 'Lolo''s birthday gift', -150000, '2026-08-02', null, null),
    (gen_random_uuid(), target_user, 'School supplies',       -280000, '2026-08-10', 'enrollment season', null),
    (gen_random_uuid(), target_user, '13th month pay',        3500000, '2026-12-15', null, v_balance_checking),
    (gen_random_uuid(), target_user, 'Christmas shopping',    -800000, '2026-12-18', null, null),
    (gen_random_uuid(), target_user, 'Roof repair - typhoon damage', -26000000, '2027-09-01', 'storm damage to the roof and ceiling, not covered by insurance', null);

  -- ── Budgets — one of each replenish mode ──────────────────────────────────
  insert into public.budgets
    (id, user_id, name, allocation, monthly_allocation, linked_income_id,
     start_date, "interval", unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count)
  values
    -- Income-linked: replenishes when Freelance - Sheena settles (T56).
    (v_budget_groceries, target_user, 'Groceries', 600000, 600000,
     v_income_freelance,
     null, null, null, null, null, null, null, null, null, null),
    -- Replenish every: its own weekly schedule (Phase 11), runs indefinitely.
    (v_budget_dining, target_user, 'Dining out', 150000, 150000, null,
     '2026-01-02', 1, 'week', array[5], null, null, null, 'never', null, null),
    -- Manual: Add funds / Take funds only, no schedule.
    (v_budget_gas, target_user, 'Gas & transport', 400000, 400000, null,
     null, null, null, null, null, null, null, null, null, null);

  -- ── Budget ledger entries ──────────────────────────────────────────────
  insert into public.budget_entries (id, user_id, budget_id, entry_date, amount, note, direction) values
    (gen_random_uuid(), target_user, v_budget_groceries, '2026-06-05', 600000, 'Replenished from Freelance - Sheena', 'incoming'),
    (gen_random_uuid(), target_user, v_budget_groceries, '2026-06-08', 285000, 'SM Hypermarket run', 'outgoing'),
    (gen_random_uuid(), target_user, v_budget_groceries, '2026-06-19', 600000, 'Replenished from Freelance - Sheena', 'incoming'),
    (gen_random_uuid(), target_user, v_budget_groceries, '2026-06-22', 312000, 'weekly groceries', 'outgoing'),
    (gen_random_uuid(), target_user, v_budget_groceries, '2026-07-06', 264000, 'weekly groceries', 'outgoing'),
    (gen_random_uuid(), target_user, v_budget_dining, '2026-06-05', 150000, 'Weekly dining budget', 'incoming'),
    (gen_random_uuid(), target_user, v_budget_dining, '2026-06-12', 150000, 'Weekly dining budget', 'incoming'),
    (gen_random_uuid(), target_user, v_budget_dining, '2026-06-13',  95000, 'family lunch', 'outgoing'),
    (gen_random_uuid(), target_user, v_budget_dining, '2026-06-19', 150000, 'Weekly dining budget', 'incoming'),
    (gen_random_uuid(), target_user, v_budget_dining, '2026-06-20', 120000, 'date night', 'outgoing'),
    (gen_random_uuid(), target_user, v_budget_gas, '2026-01-01', 400000, 'Starting balance', 'incoming'),
    (gen_random_uuid(), target_user, v_budget_gas, '2026-06-08', 150000, 'full tank', 'outgoing'),
    (gen_random_uuid(), target_user, v_budget_gas, '2026-06-16', 140000, 'full tank', 'outgoing'),
    (gen_random_uuid(), target_user, v_budget_gas, '2026-07-01', 400000, 'Monthly top-up', 'incoming'),
    (gen_random_uuid(), target_user, v_budget_gas, '2026-07-10', 130000, 'full tank', 'outgoing'),
    (gen_random_uuid(), target_user, v_budget_gas, '2026-08-15', 200000, 'Bonus contribution planned', 'incoming');

  -- ── Occurrence overrides ─────────────────────────────────────────────────
  insert into public.occurrence_overrides
    (id, user_id, recurring_item_id, original_date, new_date, new_amount, new_name, skipped)
  values
    (gen_random_uuid(), target_user, v_bill_meralco, '2026-08-21', '2026-08-25', null, null, false),
    (gen_random_uuid(), target_user, v_bill_pldt, '2026-08-05', null, -100000, null, false);

  -- ── Reminders — two active, one already completed (T84) ──────────────────
  insert into public.reminders (id, user_id, text, completed, completed_at) values
    (gen_random_uuid(), target_user, 'Renew car insurance before Sept 30', false, null),
    (gen_random_uuid(), target_user, 'Ask HR about SSS loan balance', false, null),
    (gen_random_uuid(), target_user, 'Review Q2 budget with Sheena', true, '2026-06-15 10:00:00+08');

  -- ── Settlement history (History page) ─────────────────────────────────────
  insert into public.settlements
    (id, user_id, source_type, source_id, name, type,
     forecasted_amount, actual_amount, forecasted_date, actual_date, forecasted_balance)
  values
    -- General bills/income
    (gen_random_uuid(), target_user, 'recurring', v_bill_rent,
     'Rent', 'bill', -1800000, -1800000, '2026-06-01', '2026-06-01', 6100000),
    (gen_random_uuid(), target_user, 'recurring', v_bill_netflix,
     'Netflix', 'bill', -54900, -54900, '2026-06-12', '2026-06-13', 6300000),
    (gen_random_uuid(), target_user, 'recurring', v_income_salary,
     'Salary - NJ', 'income', 3500000, 3500000, '2026-06-15', '2026-06-15', 6800000),
    (gen_random_uuid(), target_user, 'recurring', v_income_freelance,
     'Freelance - Sheena', 'income', 650000, 650000, '2026-06-05', '2026-06-05', 6200000),
    (gen_random_uuid(), target_user, 'recurring', v_income_freelance,
     'Freelance - Sheena', 'income', 650000, 650000, '2026-06-19', '2026-06-19', 6500000),
    -- Debt (Car loan: first 3 of 24; Credit card: first 2 of 10)
    (gen_random_uuid(), target_user, 'recurring', v_debt_car,
     'Car loan - BPI Auto', 'debt', -950000, -950000, '2026-01-15', '2026-01-15', 5800000),
    (gen_random_uuid(), target_user, 'recurring', v_debt_car,
     'Car loan - BPI Auto', 'debt', -950000, -950000, '2026-02-15', '2026-02-15', 5900000),
    (gen_random_uuid(), target_user, 'recurring', v_debt_car,
     'Car loan - BPI Auto', 'debt', -950000, -950000, '2026-03-15', '2026-03-15', 6000000),
    (gen_random_uuid(), target_user, 'recurring', v_debt_cc,
     'Credit card installment', 'debt', -320000, -320000, '2026-02-28', '2026-02-28', 5950000),
    (gen_random_uuid(), target_user, 'recurring', v_debt_cc,
     'Credit card installment', 'debt', -320000, -320000, '2026-03-28', '2026-03-28', 6050000),
    -- Savings (Emergency fund: first 3 of 24; Orius's college fund: first 2 of 61)
    (gen_random_uuid(), target_user, 'recurring', v_savings_emergency,
     'Emergency fund', 'savings', -300000, -300000, '2026-01-06', '2026-01-06', 5700000),
    (gen_random_uuid(), target_user, 'recurring', v_savings_emergency,
     'Emergency fund', 'savings', -300000, -300000, '2026-02-06', '2026-02-06', 5750000),
    (gen_random_uuid(), target_user, 'recurring', v_savings_emergency,
     'Emergency fund', 'savings', -300000, -300000, '2026-03-06', '2026-03-06', 5850000),
    (gen_random_uuid(), target_user, 'recurring', v_savings_college,
     'Orius''s college fund', 'savings', -400000, -400000, '2026-01-30', '2026-01-30', 5650000),
    (gen_random_uuid(), target_user, 'recurring', v_savings_college,
     'Orius''s college fund', 'savings', -400000, -400000, '2026-02-28', '2026-02-28', 5700000),
    -- Groceries (income-linked replenishes carry the real forecasted deduction; spends forecast 0)
    (gen_random_uuid(), target_user, 'budget', v_budget_groceries,
     'Groceries - Replenished from Freelance - Sheena', 'budget', -600000, -600000, '2026-06-05', '2026-06-05', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_groceries,
     'Groceries - SM Hypermarket run', 'budget', 0, -285000, '2026-06-08', '2026-06-08', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_groceries,
     'Groceries - Replenished from Freelance - Sheena', 'budget', -600000, -600000, '2026-06-19', '2026-06-19', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_groceries,
     'Groceries - weekly groceries', 'budget', 0, -312000, '2026-06-22', '2026-06-22', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_groceries,
     'Groceries - weekly groceries', 'budget', 0, -264000, '2026-07-06', '2026-07-06', 0),
    -- Dining out (replenish-every settles carry the real forecasted deduction too)
    (gen_random_uuid(), target_user, 'budget', v_budget_dining,
     'Dining out - Weekly dining budget', 'budget', -150000, -150000, '2026-06-05', '2026-06-05', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_dining,
     'Dining out - Weekly dining budget', 'budget', -150000, -150000, '2026-06-12', '2026-06-12', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_dining,
     'Dining out - family lunch', 'budget', 0, -95000, '2026-06-13', '2026-06-13', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_dining,
     'Dining out - Weekly dining budget', 'budget', -150000, -150000, '2026-06-19', '2026-06-19', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_dining,
     'Dining out - date night', 'budget', 0, -120000, '2026-06-20', '2026-06-20', 0),
    -- Gas & transport (manual - every entry forecasts 0, incl. Add funds; Starting balance has no settlement)
    (gen_random_uuid(), target_user, 'budget', v_budget_gas,
     'Gas & transport - full tank', 'budget', 0, -150000, '2026-06-08', '2026-06-08', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_gas,
     'Gas & transport - full tank', 'budget', 0, -140000, '2026-06-16', '2026-06-16', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_gas,
     'Gas & transport - Monthly top-up', 'budget', 0, 400000, '2026-07-01', '2026-07-01', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_gas,
     'Gas & transport - full tank', 'budget', 0, -130000, '2026-07-10', '2026-07-10', 0),
    (gen_random_uuid(), target_user, 'budget', v_budget_gas,
     'Gas & transport - Bonus contribution planned', 'budget', 0, 200000, '2026-08-15', '2026-08-15', 0);
end;
$$;
