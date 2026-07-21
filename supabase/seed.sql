-- Orium sample data seed (T41). Fills every feature with a realistic
-- Filipino family's finances so the whole app is demoable at a glance:
-- balances, income, bills, debt, savings, extras, budgets with logged
-- spends, settlement history, and reminders.
--
-- HOW TO RUN:
--   1. Run migrations 0001-0003 and 0004 PART 1 first (the seed fills the
--      new recurrence columns too, and fails fast with a clear message if
--      0004 Part 1 hasn't been applied).
--   2. Make sure you've logged into the app at least once with the account
--      email set below (the row lookup needs the auth user to exist).
--   3. Paste this whole file into the Supabase SQL editor and run it.
--
-- Re-runnable: every row has a fixed id and inserts use
-- `on conflict do nothing`, so running it twice adds nothing twice.
-- To wipe the sample data later, delete rows whose id starts with
-- '00000000-0000-4000-a000-' (all seed rows share that prefix; real app
-- rows use random UUIDs so they never collide with it).
--
-- All amounts are integer centavos (e.g. ₱18,000.00 = 1800000).
-- "Today" when this dataset was designed: 2026-07-20. The dates keep
-- working after that; the forecast just starts from whatever today is.

do $$
declare
  v_user uuid;
begin
  -- Change this email if seeding a different account.
  select id into v_user from auth.users where email = 'nathanelcorpuz@gmail.com';
  if v_user is null then
    raise exception 'No auth user with that email — log into the app once first, or edit the email at the top of seed.sql';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recurring_items' and column_name = 'unit'
  ) then
    raise exception 'Run migration 0004_recurrence_rules.sql PART 1 before seeding';
  end if;

  -- ── Balances ─────────────────────────────────────────────── ₱56,700 total
  insert into public.balances (id, user_id, name, amount, comments) values
    ('00000000-0000-4000-a000-000000000001', v_user, 'BPI checking',  4500000, 'main payroll account'),
    ('00000000-0000-4000-a000-000000000002', v_user, 'GCash',          850000, null),
    ('00000000-0000-4000-a000-000000000003', v_user, 'Cash envelope',  320000, 'wallet + house cash')
  on conflict (id) do nothing;

  -- ── Recurring items ──────────────────────────────────────────────────────
  -- Both the old columns (frequency/day_of_month/weekday, still read by the
  -- deployed app) and the new recurrence columns (read from T33 onward) are
  -- filled, so the data survives the whole 6A rollout.
  insert into public.recurring_items
    (id, user_id, name, type, amount, frequency, day_of_month, weekday,
     start_date, end_date, comments,
     "interval", unit, weekdays, days_of_month, ends_type)
  values
    -- Income
    ('00000000-0000-4000-a000-000000000011', v_user, 'Salary — Nathan', 'income', 3500000,
     'semi_monthly_15_30', null, null, '2026-01-15', '2028-12-31', 'net of taxes',
     1, 'month', null, array[15, 30], 'on_date'),
    ('00000000-0000-4000-a000-000000000012', v_user, 'Freelance — Aya', 'income', 650000,
     'weekly', null, 5, '2026-01-02', '2027-12-31', 'design retainer, paid Fridays',
     1, 'week', array[5], null, 'on_date'),
    -- Bills
    ('00000000-0000-4000-a000-000000000021', v_user, 'Rent', 'bill', -1800000,
     'monthly', 1, null, '2026-01-01', '2028-12-31', null,
     1, 'month', null, array[1], 'on_date'),
    ('00000000-0000-4000-a000-000000000022', v_user, 'Meralco electricity', 'bill', -480000,
     'monthly', 21, null, '2026-01-21', '2028-12-31', 'varies with aircon season',
     1, 'month', null, array[21], 'on_date'),
    ('00000000-0000-4000-a000-000000000023', v_user, 'PLDT Home Fibr', 'bill', -169900,
     'monthly', 5, null, '2026-01-05', '2028-12-31', null,
     1, 'month', null, array[5], 'on_date'),
    ('00000000-0000-4000-a000-000000000024', v_user, 'Maynilad water', 'bill', -65000,
     'monthly', 10, null, '2026-01-10', '2028-12-31', null,
     1, 'month', null, array[10], 'on_date'),
    ('00000000-0000-4000-a000-000000000025', v_user, 'Netflix', 'bill', -54900,
     'monthly', 12, null, '2026-01-12', '2028-12-31', null,
     1, 'month', null, array[12], 'on_date'),
    -- Debt (end_date = payoff date, drives the debt-free countdown)
    ('00000000-0000-4000-a000-000000000031', v_user, 'Car loan — BPI auto', 'debt', -950000,
     'monthly', 15, null, '2026-01-15', '2027-06-15', '18 payments left as of Jan 2026',
     1, 'month', null, array[15], 'on_date'),
    ('00000000-0000-4000-a000-000000000032', v_user, 'Credit card installment', 'debt', -320000,
     'monthly', 28, null, '2026-02-28', '2026-11-28', 'appliance, 0% for 10 months',
     1, 'month', null, array[28], 'on_date'),
    -- Savings
    ('00000000-0000-4000-a000-000000000041', v_user, 'Emergency fund', 'savings', -200000,
     'biweekly', null, 6, '2026-01-03', '2027-12-31', 'every other Saturday',
     2, 'week', array[6], null, 'on_date'),
    ('00000000-0000-4000-a000-000000000042', v_user, 'Kids'' college fund', 'savings', -300000,
     'monthly', 30, null, '2026-01-30', '2028-12-31', null,
     1, 'month', null, array[30], 'on_date')
  on conflict (id) do nothing;

  -- ── Extras (one-off items) ───────────────────────────────────────────────
  insert into public.one_off_items (id, user_id, name, amount, due_date, comments) values
    ('00000000-0000-4000-a000-000000000051', v_user, 'Lolo''s birthday gift',  -150000, '2026-08-02', null),
    ('00000000-0000-4000-a000-000000000052', v_user, 'School supplies',        -280000, '2026-08-10', 'enrollment season'),
    ('00000000-0000-4000-a000-000000000053', v_user, '13th month pay',         3500000, '2026-12-15', null),
    ('00000000-0000-4000-a000-000000000054', v_user, 'Christmas shopping',     -800000, '2026-12-18', null)
  on conflict (id) do nothing;

  -- ── Budgets + this month's logged spends ─────────────────────────────────
  insert into public.budgets (id, user_id, name, monthly_allocation) values
    ('00000000-0000-4000-a000-000000000061', v_user, 'Groceries',       1200000),
    ('00000000-0000-4000-a000-000000000062', v_user, 'Gas & transport',  400000),
    ('00000000-0000-4000-a000-000000000063', v_user, 'Dining out',       350000)
  on conflict (id) do nothing;

  insert into public.budget_entries (id, user_id, budget_id, entry_date, amount, note) values
    ('00000000-0000-4000-a000-000000000071', v_user, '00000000-0000-4000-a000-000000000061', '2026-07-04', 285000, 'SM Hypermarket run'),
    ('00000000-0000-4000-a000-000000000072', v_user, '00000000-0000-4000-a000-000000000061', '2026-07-11', 312000, 'weekly groceries'),
    ('00000000-0000-4000-a000-000000000073', v_user, '00000000-0000-4000-a000-000000000061', '2026-07-18', 264000, 'weekly groceries'),
    ('00000000-0000-4000-a000-000000000074', v_user, '00000000-0000-4000-a000-000000000062', '2026-07-08', 150000, 'full tank'),
    ('00000000-0000-4000-a000-000000000075', v_user, '00000000-0000-4000-a000-000000000062', '2026-07-16', 140000, 'full tank'),
    ('00000000-0000-4000-a000-000000000076', v_user, '00000000-0000-4000-a000-000000000063', '2026-07-12',  95000, 'family lunch'),
    ('00000000-0000-4000-a000-000000000077', v_user, '00000000-0000-4000-a000-000000000063', '2026-07-19', 120000, 'date night')
  on conflict (id) do nothing;

  -- ── Settlement history ───────────────────────────────────────────────────
  -- A few settled occurrences (History page): rent paid on time, internet a
  -- day late, electricity over forecast, salary received. Plus mirrors of
  -- the budget spends above, matching what in-app spend logging writes
  -- (forecasted fields 0 — budget spends settle no forecast row). No
  -- skipped-occurrence overrides are needed: these dates are already in the
  -- past, so the engine excludes them from the forecast anyway.
  insert into public.settlements
    (id, user_id, source_type, source_id, name, type,
     forecasted_amount, actual_amount, forecasted_date, actual_date, forecasted_balance)
  values
    ('00000000-0000-4000-a000-000000000081', v_user, 'recurring', '00000000-0000-4000-a000-000000000021',
     'Rent', 'bill', -1800000, -1800000, '2026-07-01', '2026-07-01', 4210000),
    ('00000000-0000-4000-a000-000000000082', v_user, 'recurring', '00000000-0000-4000-a000-000000000023',
     'PLDT Home Fibr', 'bill', -169900, -169900, '2026-07-05', '2026-07-06', 4040100),
    ('00000000-0000-4000-a000-000000000083', v_user, 'recurring', '00000000-0000-4000-a000-000000000022',
     'Meralco electricity', 'bill', -480000, -512000, '2026-06-21', '2026-06-23', 3890000),
    ('00000000-0000-4000-a000-000000000084', v_user, 'recurring', '00000000-0000-4000-a000-000000000011',
     'Salary — Nathan', 'income', 3500000, 3500000, '2026-07-15', '2026-07-15', 7390000),
    ('00000000-0000-4000-a000-000000000085', v_user, 'budget', '00000000-0000-4000-a000-000000000061',
     'Groceries — SM Hypermarket run', 'budget', 0, -285000, '2026-07-04', '2026-07-04', 0),
    ('00000000-0000-4000-a000-000000000086', v_user, 'budget', '00000000-0000-4000-a000-000000000061',
     'Groceries — weekly groceries', 'budget', 0, -312000, '2026-07-11', '2026-07-11', 0),
    ('00000000-0000-4000-a000-000000000087', v_user, 'budget', '00000000-0000-4000-a000-000000000061',
     'Groceries — weekly groceries', 'budget', 0, -264000, '2026-07-18', '2026-07-18', 0),
    ('00000000-0000-4000-a000-000000000088', v_user, 'budget', '00000000-0000-4000-a000-000000000062',
     'Gas & transport — full tank', 'budget', 0, -150000, '2026-07-08', '2026-07-08', 0),
    ('00000000-0000-4000-a000-000000000089', v_user, 'budget', '00000000-0000-4000-a000-000000000062',
     'Gas & transport — full tank', 'budget', 0, -140000, '2026-07-16', '2026-07-16', 0),
    ('00000000-0000-4000-a000-00000000008a', v_user, 'budget', '00000000-0000-4000-a000-000000000063',
     'Dining out — family lunch', 'budget', 0, -95000, '2026-07-12', '2026-07-12', 0),
    ('00000000-0000-4000-a000-00000000008b', v_user, 'budget', '00000000-0000-4000-a000-000000000063',
     'Dining out — date night', 'budget', 0, -120000, '2026-07-19', '2026-07-19', 0)
  on conflict (id) do nothing;

  -- ── Reminders ────────────────────────────────────────────────────────────
  insert into public.reminders (id, user_id, text) values
    ('00000000-0000-4000-a000-000000000091', v_user, 'Renew car insurance before Sept 30'),
    ('00000000-0000-4000-a000-000000000092', v_user, 'Ask HR about SSS loan balance')
  on conflict (id) do nothing;
end $$;
