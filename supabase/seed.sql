-- Orium sample data seed (T88, SPEC.md Phase 13 — full rewrite; supersedes
-- the T41 original, which had drifted out of sync with the schema: it
-- still wrote to `frequency`/`day_of_month`/`weekday`, dropped by migration
-- 0005, and never covered budgets' three replenish modes, connected
-- accounts, or the newer preference/reminder features).
--
-- Designed to be more than a feature checklist: it's one coherent family
-- story (income, bills, a car loan and a credit-card installment paying
-- down, two savings goals, three budgets run three different ways, a
-- typhoon-damage expense that visibly dents the balance for a couple of
-- months in late 2027 before recovering for good) so the whole app makes
-- sense at a glance. Every recurring-item recurrence shape appears on a
-- bill: simple monthly (Rent), semi-monthly/two-days-a-month (Health insurance), a
-- weekly bill (Parking fee), and an nth-weekday bill ("3rd Friday of the
-- month" — House helper). Budgets cover all three replenish modes:
-- income-linked (Groceries, replenishes when Freelance — Aya settles),
-- "replenish every" own-schedule (Dining out, weekly), and manual (Gas &
-- transport, Add/Take funds). Debt and Savings each have a few already-
-- settled occurrences so their progress bars show real partial progress,
-- not "0 of N". Two bills carry an `occurrence_overrides` row (one moved
-- date, one changed amount) so the edited-pencil indicator has something to
-- point at. Preferences get custom balance-color thresholds and
-- lowest-balance tier labels tuned to this family's own trajectory (not
-- the untouched defaults), and one of the three reminders is pre-completed
-- to show off that state too (T84) alongside the two still-active ones.
--
-- HOW TO RUN:
--   1. Run supabase/wipe_test_data.sql first (or start from an empty
--      account) — this seed's ids are fixed with `on conflict do nothing`,
--      so re-running it alone is safe, but running it ALONGSIDE old/drifted
--      data would leave both mixed together.
--   2. Make sure you've signed up / logged into the app at least once (an
--      auth user must exist). The seed targets whichever account signed in
--      most recently — the one you actually use. To force a specific
--      account instead, set v_email below.
--   3. Paste this whole file into the Supabase SQL editor and run it.
--
-- All amounts are integer centavos (e.g. ₱18,000.00 = 1800000).
-- "Today" when this dataset was designed and calibrated against the real
-- engine (a throwaway Vitest script run against this exact dataset, per
-- the T47 precedent — deleted before finishing, not committed): 2026-07-25.
-- The dates keep working after that; the forecast just starts from
-- whatever today is, and the Sept 2027 dip is far enough out to stay
-- demoable for a long while.

do $$
declare
  v_email text := null;
  v_user uuid;
  v_seeded_email text;
begin
  if v_email is not null then
    select id, email into v_user, v_seeded_email
    from auth.users where email = v_email;
    if v_user is null then
      raise exception 'No user with email % — existing users: %',
        v_email,
        (select string_agg(email, ', ' order by created_at) from auth.users);
    end if;
  else
    select id, email into v_user, v_seeded_email
    from auth.users
    order by last_sign_in_at desc nulls last, created_at desc
    limit 1;
    if v_user is null then
      raise exception 'auth.users is empty — sign up / log into the app once, then re-run this seed';
    end if;
  end if;

  raise notice 'Seeding account: %', v_seeded_email;

  -- ── Preferences ──────────────────────────────────────────────────────────
  -- Custom balance-color thresholds and lowest-balance tier labels, tuned to
  -- this family's own trajectory rather than the untouched defaults (their
  -- typical balance sits in the ₱15k-80k range early on, climbing past
  -- ₱300k by 2029+) — so Peaks and Drops and the Forecast's balance pills
  -- actually move through several tiers across the demo instead of sitting
  -- in one color the whole time.
  insert into public.preferences (user_id, currency, balance_ranges, balance_tier_labels)
  values (
    v_user, '₱',
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
    ('00000000-0000-4000-a000-000000000001', v_user, 'BPI Checking', 5200000, 'main payroll account'),
    ('00000000-0000-4000-a000-000000000002', v_user, 'GCash',         950000, null),
    ('00000000-0000-4000-a000-000000000003', v_user, 'Cash wallet',   300000, 'wallet + house cash')
  on conflict (id) do nothing;

  -- ── Recurring items ──────────────────────────────────────────────────────
  insert into public.recurring_items
    (id, user_id, name, type, amount, start_date, end_date, comments, balance_id,
     "interval", unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type)
  values
    -- Income
    ('00000000-0000-4000-a000-000000000011', v_user, 'Salary — Nathan', 'income', 3500000,
     '2026-01-15', '2030-12-31', 'net of taxes', '00000000-0000-4000-a000-000000000001',
     1, 'month', null, array[15, 30], null, null, 'on_date'),
    ('00000000-0000-4000-a000-000000000012', v_user, 'Freelance — Aya', 'income', 650000,
     '2026-01-02', '2028-12-31', 'design retainer, paid Fridays', '00000000-0000-4000-a000-000000000002',
     1, 'week', array[5], null, null, null, 'on_date'),
    -- Bills — one of each recurrence shape
    ('00000000-0000-4000-a000-000000000021', v_user, 'Rent', 'bill', -1800000,
     '2026-01-01', '2030-12-31', null, '00000000-0000-4000-a000-000000000001',
     1, 'month', null, array[1], null, null, 'on_date'),
    ('00000000-0000-4000-a000-000000000022', v_user, 'Health insurance premium', 'bill', -150000,
     '2026-01-01', '2029-12-31', 'twice a month', '00000000-0000-4000-a000-000000000001',
     1, 'month', null, array[1, 15], null, null, 'on_date'),
    ('00000000-0000-4000-a000-000000000023', v_user, 'House helper', 'bill', -800000,
     '2026-01-01', '2029-12-31', 'paid the 3rd Friday of every month', null,
     1, 'month', null, null, 3, 5, 'on_date'),
    ('00000000-0000-4000-a000-000000000024', v_user, 'Parking fee', 'bill', -30000,
     '2026-01-05', '2028-12-31', 'weekday parking, billed weekly', '00000000-0000-4000-a000-000000000003',
     1, 'week', array[1], null, null, null, 'on_date'),
    ('00000000-0000-4000-a000-000000000025', v_user, 'Meralco electricity', 'bill', -480000,
     '2026-01-21', '2030-12-31', 'varies with aircon season', '00000000-0000-4000-a000-000000000001',
     1, 'month', null, array[21], null, null, 'on_date'),
    ('00000000-0000-4000-a000-000000000026', v_user, 'PLDT Home Fiber', 'bill', -169900,
     '2026-01-05', '2030-12-31', null, '00000000-0000-4000-a000-000000000001',
     1, 'month', null, array[5], null, null, 'on_date'),
    ('00000000-0000-4000-a000-000000000027', v_user, 'Netflix', 'bill', -54900,
     '2026-01-12', '2030-12-31', null, null,
     1, 'month', null, array[12], null, null, 'on_date'),
    -- Debt (end_date = payoff date, drives the debt-free countdown + progress bar)
    ('00000000-0000-4000-a000-000000000031', v_user, 'Car loan — BPI Auto', 'debt', -950000,
     '2026-01-15', '2028-01-15', '24 monthly payments', '00000000-0000-4000-a000-000000000001',
     1, 'month', null, array[15], null, null, 'on_date'),
    ('00000000-0000-4000-a000-000000000032', v_user, 'Credit card installment', 'debt', -320000,
     '2026-02-28', '2026-11-28', 'appliance, 0% for 10 months', '00000000-0000-4000-a000-000000000001',
     1, 'month', null, array[28], null, null, 'on_date'),
    -- Savings
    ('00000000-0000-4000-a000-000000000041', v_user, 'Emergency fund', 'savings', -300000,
     '2026-01-06', '2027-12-06', 'building up 6 months of expenses', '00000000-0000-4000-a000-000000000002',
     1, 'month', null, array[6], null, null, 'on_date'),
    ('00000000-0000-4000-a000-000000000042', v_user, 'Kids'' college fund', 'savings', -400000,
     '2026-01-30', '2031-01-30', null, null,
     1, 'month', null, array[30], null, null, 'on_date')
  on conflict (id) do nothing;

  -- ── Extras (one-off items) — both directions ─────────────────────────────
  insert into public.one_off_items (id, user_id, name, amount, due_date, comments, balance_id) values
    ('00000000-0000-4000-a000-000000000051', v_user, 'Lolo''s birthday gift', -150000, '2026-08-02', null, null),
    ('00000000-0000-4000-a000-000000000052', v_user, 'School supplies',       -280000, '2026-08-10', 'enrollment season', null),
    ('00000000-0000-4000-a000-000000000053', v_user, '13th month pay',        3500000, '2026-12-15', null, '00000000-0000-4000-a000-000000000001'),
    ('00000000-0000-4000-a000-000000000054', v_user, 'Christmas shopping',    -800000, '2026-12-18', null, null),
    -- Calibrated against the real engine (see header): the running balance
    -- goes negative Sept 1 2027 (lowest point ~-₱29,973 on Sept 13),
    -- oscillates with each bill/payday cycle through mid-November as the
    -- family absorbs the hit, then clears for good — zero negative rows
    -- for the remaining ~3.7 years of the horizon. Gives the Lowest
    -- Balance Ahead card and Peaks and Drops a real, bounded multi-month
    -- warning-then-recovery story to demo, not a permanent trench.
    ('00000000-0000-4000-a000-000000000055', v_user, 'Roof repair — typhoon damage', -26000000, '2027-09-01', 'storm damage to the roof and ceiling, not covered by insurance', null)
  on conflict (id) do nothing;

  -- ── Budgets — one of each replenish mode ──────────────────────────────────
  -- monthly_allocation mirrors allocation (still NOT NULL until a deferred
  -- migration drops it — see SPEC.md T73's note).
  insert into public.budgets
    (id, user_id, name, allocation, monthly_allocation, linked_income_id,
     start_date, "interval", unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count)
  values
    -- Income-linked: replenishes when Freelance — Aya settles (T56).
    ('00000000-0000-4000-a000-000000000061', v_user, 'Groceries', 600000, 600000,
     '00000000-0000-4000-a000-000000000012',
     null, null, null, null, null, null, null, null, null, null),
    -- Replenish every: its own weekly schedule (Phase 11), runs indefinitely.
    ('00000000-0000-4000-a000-000000000062', v_user, 'Dining out', 150000, 150000, null,
     '2026-01-02', 1, 'week', array[5], null, null, null, 'never', null, null),
    -- Manual: Add funds / Take funds only, no schedule.
    ('00000000-0000-4000-a000-000000000063', v_user, 'Gas & transport', 400000, 400000, null,
     null, null, null, null, null, null, null, null, null, null)
  on conflict (id) do nothing;

  -- ── Budget ledger entries ──────────────────────────────────────────────
  -- Groceries (income-linked): replenished twice this past June alongside
  -- Freelance — Aya settling, with grocery runs logged against it.
  -- Dining out (replenish-every): three weekly replenishes plus two spends.
  -- Gas & transport (manual): a "Starting balance" bootstrap, two manual
  -- top-ups (one still in the future, dated after "today" — demonstrates a
  -- future-dated ledger entry rendering as its own Forecast row), and three
  -- spends.
  insert into public.budget_entries (id, user_id, budget_id, entry_date, amount, note, direction) values
    ('00000000-0000-4000-a000-000000000071', v_user, '00000000-0000-4000-a000-000000000061', '2026-06-05', 600000, 'Replenished from Freelance — Aya', 'incoming'),
    ('00000000-0000-4000-a000-000000000072', v_user, '00000000-0000-4000-a000-000000000061', '2026-06-08', 285000, 'SM Hypermarket run', 'outgoing'),
    ('00000000-0000-4000-a000-000000000073', v_user, '00000000-0000-4000-a000-000000000061', '2026-06-19', 600000, 'Replenished from Freelance — Aya', 'incoming'),
    ('00000000-0000-4000-a000-000000000074', v_user, '00000000-0000-4000-a000-000000000061', '2026-06-22', 312000, 'weekly groceries', 'outgoing'),
    ('00000000-0000-4000-a000-000000000075', v_user, '00000000-0000-4000-a000-000000000061', '2026-07-06', 264000, 'weekly groceries', 'outgoing'),
    ('00000000-0000-4000-a000-000000000076', v_user, '00000000-0000-4000-a000-000000000062', '2026-06-05', 150000, 'Weekly dining budget', 'incoming'),
    ('00000000-0000-4000-a000-000000000077', v_user, '00000000-0000-4000-a000-000000000062', '2026-06-12', 150000, 'Weekly dining budget', 'incoming'),
    ('00000000-0000-4000-a000-000000000078', v_user, '00000000-0000-4000-a000-000000000062', '2026-06-13',  95000, 'family lunch', 'outgoing'),
    ('00000000-0000-4000-a000-000000000079', v_user, '00000000-0000-4000-a000-000000000062', '2026-06-19', 150000, 'Weekly dining budget', 'incoming'),
    ('00000000-0000-4000-a000-000000000080', v_user, '00000000-0000-4000-a000-000000000062', '2026-06-20', 120000, 'date night', 'outgoing'),
    ('00000000-0000-4000-a000-000000000081', v_user, '00000000-0000-4000-a000-000000000063', '2026-01-01', 400000, 'Starting balance', 'incoming'),
    ('00000000-0000-4000-a000-000000000082', v_user, '00000000-0000-4000-a000-000000000063', '2026-06-08', 150000, 'full tank', 'outgoing'),
    ('00000000-0000-4000-a000-000000000083', v_user, '00000000-0000-4000-a000-000000000063', '2026-06-16', 140000, 'full tank', 'outgoing'),
    ('00000000-0000-4000-a000-000000000084', v_user, '00000000-0000-4000-a000-000000000063', '2026-07-01', 400000, 'Monthly top-up', 'incoming'),
    ('00000000-0000-4000-a000-000000000085', v_user, '00000000-0000-4000-a000-000000000063', '2026-07-10', 130000, 'full tank', 'outgoing'),
    ('00000000-0000-4000-a000-000000000086', v_user, '00000000-0000-4000-a000-000000000063', '2026-08-15', 200000, 'Bonus contribution planned', 'incoming')
  on conflict (id) do nothing;

  -- ── Occurrence overrides ─────────────────────────────────────────────────
  -- Two edited future occurrences, so the edited-pencil indicator (Phase 7)
  -- has something to point at on both the Forecast and the Bills page.
  insert into public.occurrence_overrides
    (id, user_id, recurring_item_id, original_date, new_date, new_amount, new_name, skipped)
  values
    -- Meralco's August bill paid a few days late.
    ('00000000-0000-4000-a000-000000000091', v_user, '00000000-0000-4000-a000-000000000025',
     '2026-08-21', '2026-08-25', null, null, false),
    -- PLDT's August bill discounted for a promo.
    ('00000000-0000-4000-a000-000000000092', v_user, '00000000-0000-4000-a000-000000000026',
     '2026-08-05', null, -100000, null, false)
  on conflict (recurring_item_id, original_date) do nothing;

  -- ── Reminders — two active, one already completed (T84) ──────────────────
  insert into public.reminders (id, user_id, text, completed, completed_at) values
    ('00000000-0000-4000-a000-0000000000a1', v_user, 'Renew car insurance before Sept 30', false, null),
    ('00000000-0000-4000-a000-0000000000a2', v_user, 'Ask HR about SSS loan balance', false, null),
    ('00000000-0000-4000-a000-0000000000a3', v_user, 'Review Q2 budget with Aya', true, '2026-06-15 10:00:00+08')
  on conflict (id) do nothing;

  -- ── Settlement history (History page) ─────────────────────────────────────
  -- A handful of settled bills/income (Rent on time, Netflix a day late,
  -- Salary and two Freelance payments on time), a few of debt/savings'
  -- earliest occurrences (so their progress bars show real partial
  -- progress instead of "0 of N"), and every budget-ledger entry above that
  -- isn't a bootstrap ("Starting balance" has no settlement, matching how a
  -- fresh manual budget's initial balance isn't itself a transaction).
  insert into public.settlements
    (id, user_id, source_type, source_id, name, type,
     forecasted_amount, actual_amount, forecasted_date, actual_date, forecasted_balance)
  values
    -- General bills/income
    ('00000000-0000-4000-a000-0000000000b1', v_user, 'recurring', '00000000-0000-4000-a000-000000000021',
     'Rent', 'bill', -1800000, -1800000, '2026-06-01', '2026-06-01', 6100000),
    ('00000000-0000-4000-a000-0000000000b2', v_user, 'recurring', '00000000-0000-4000-a000-000000000027',
     'Netflix', 'bill', -54900, -54900, '2026-06-12', '2026-06-13', 6300000),
    ('00000000-0000-4000-a000-0000000000b3', v_user, 'recurring', '00000000-0000-4000-a000-000000000011',
     'Salary — Nathan', 'income', 3500000, 3500000, '2026-06-15', '2026-06-15', 6800000),
    ('00000000-0000-4000-a000-0000000000b4', v_user, 'recurring', '00000000-0000-4000-a000-000000000012',
     'Freelance — Aya', 'income', 650000, 650000, '2026-06-05', '2026-06-05', 6200000),
    ('00000000-0000-4000-a000-0000000000b5', v_user, 'recurring', '00000000-0000-4000-a000-000000000012',
     'Freelance — Aya', 'income', 650000, 650000, '2026-06-19', '2026-06-19', 6500000),
    -- Debt (Car loan: first 3 of 24; Credit card: first 2 of 10)
    ('00000000-0000-4000-a000-0000000000b6', v_user, 'recurring', '00000000-0000-4000-a000-000000000031',
     'Car loan — BPI Auto', 'debt', -950000, -950000, '2026-01-15', '2026-01-15', 5800000),
    ('00000000-0000-4000-a000-0000000000b7', v_user, 'recurring', '00000000-0000-4000-a000-000000000031',
     'Car loan — BPI Auto', 'debt', -950000, -950000, '2026-02-15', '2026-02-15', 5900000),
    ('00000000-0000-4000-a000-0000000000b8', v_user, 'recurring', '00000000-0000-4000-a000-000000000031',
     'Car loan — BPI Auto', 'debt', -950000, -950000, '2026-03-15', '2026-03-15', 6000000),
    ('00000000-0000-4000-a000-0000000000b9', v_user, 'recurring', '00000000-0000-4000-a000-000000000032',
     'Credit card installment', 'debt', -320000, -320000, '2026-02-28', '2026-02-28', 5950000),
    ('00000000-0000-4000-a000-0000000000ba', v_user, 'recurring', '00000000-0000-4000-a000-000000000032',
     'Credit card installment', 'debt', -320000, -320000, '2026-03-28', '2026-03-28', 6050000),
    -- Savings (Emergency fund: first 3 of 24; Kids' college fund: first 2 of 61)
    ('00000000-0000-4000-a000-0000000000bb', v_user, 'recurring', '00000000-0000-4000-a000-000000000041',
     'Emergency fund', 'savings', -300000, -300000, '2026-01-06', '2026-01-06', 5700000),
    ('00000000-0000-4000-a000-0000000000bc', v_user, 'recurring', '00000000-0000-4000-a000-000000000041',
     'Emergency fund', 'savings', -300000, -300000, '2026-02-06', '2026-02-06', 5750000),
    ('00000000-0000-4000-a000-0000000000bd', v_user, 'recurring', '00000000-0000-4000-a000-000000000041',
     'Emergency fund', 'savings', -300000, -300000, '2026-03-06', '2026-03-06', 5850000),
    ('00000000-0000-4000-a000-0000000000be', v_user, 'recurring', '00000000-0000-4000-a000-000000000042',
     'Kids'' college fund', 'savings', -400000, -400000, '2026-01-30', '2026-01-30', 5650000),
    ('00000000-0000-4000-a000-0000000000bf', v_user, 'recurring', '00000000-0000-4000-a000-000000000042',
     'Kids'' college fund', 'savings', -400000, -400000, '2026-02-28', '2026-02-28', 5700000),
    -- Groceries (income-linked replenishes carry the real forecasted deduction; spends forecast 0)
    ('00000000-0000-4000-a000-0000000000c0', v_user, 'budget', '00000000-0000-4000-a000-000000000061',
     'Groceries - Replenished from Freelance — Aya', 'budget', -600000, -600000, '2026-06-05', '2026-06-05', 0),
    ('00000000-0000-4000-a000-0000000000c1', v_user, 'budget', '00000000-0000-4000-a000-000000000061',
     'Groceries - SM Hypermarket run', 'budget', 0, -285000, '2026-06-08', '2026-06-08', 0),
    ('00000000-0000-4000-a000-0000000000c2', v_user, 'budget', '00000000-0000-4000-a000-000000000061',
     'Groceries - Replenished from Freelance — Aya', 'budget', -600000, -600000, '2026-06-19', '2026-06-19', 0),
    ('00000000-0000-4000-a000-0000000000c3', v_user, 'budget', '00000000-0000-4000-a000-000000000061',
     'Groceries - weekly groceries', 'budget', 0, -312000, '2026-06-22', '2026-06-22', 0),
    ('00000000-0000-4000-a000-0000000000c4', v_user, 'budget', '00000000-0000-4000-a000-000000000061',
     'Groceries - weekly groceries', 'budget', 0, -264000, '2026-07-06', '2026-07-06', 0),
    -- Dining out (replenish-every settles carry the real forecasted deduction too)
    ('00000000-0000-4000-a000-0000000000c5', v_user, 'budget', '00000000-0000-4000-a000-000000000062',
     'Dining out - Weekly dining budget', 'budget', -150000, -150000, '2026-06-05', '2026-06-05', 0),
    ('00000000-0000-4000-a000-0000000000c6', v_user, 'budget', '00000000-0000-4000-a000-000000000062',
     'Dining out - Weekly dining budget', 'budget', -150000, -150000, '2026-06-12', '2026-06-12', 0),
    ('00000000-0000-4000-a000-0000000000c7', v_user, 'budget', '00000000-0000-4000-a000-000000000062',
     'Dining out - family lunch', 'budget', 0, -95000, '2026-06-13', '2026-06-13', 0),
    ('00000000-0000-4000-a000-0000000000c8', v_user, 'budget', '00000000-0000-4000-a000-000000000062',
     'Dining out - Weekly dining budget', 'budget', -150000, -150000, '2026-06-19', '2026-06-19', 0),
    ('00000000-0000-4000-a000-0000000000c9', v_user, 'budget', '00000000-0000-4000-a000-000000000062',
     'Dining out - date night', 'budget', 0, -120000, '2026-06-20', '2026-06-20', 0),
    -- Gas & transport (manual - every entry forecasts 0, incl. Add funds; Starting balance has no settlement)
    ('00000000-0000-4000-a000-0000000000ca', v_user, 'budget', '00000000-0000-4000-a000-000000000063',
     'Gas & transport - full tank', 'budget', 0, -150000, '2026-06-08', '2026-06-08', 0),
    ('00000000-0000-4000-a000-0000000000cb', v_user, 'budget', '00000000-0000-4000-a000-000000000063',
     'Gas & transport - full tank', 'budget', 0, -140000, '2026-06-16', '2026-06-16', 0),
    ('00000000-0000-4000-a000-0000000000cc', v_user, 'budget', '00000000-0000-4000-a000-000000000063',
     'Gas & transport - Monthly top-up', 'budget', 0, 400000, '2026-07-01', '2026-07-01', 0),
    ('00000000-0000-4000-a000-0000000000cd', v_user, 'budget', '00000000-0000-4000-a000-000000000063',
     'Gas & transport - full tank', 'budget', 0, -130000, '2026-07-10', '2026-07-10', 0),
    ('00000000-0000-4000-a000-0000000000ce', v_user, 'budget', '00000000-0000-4000-a000-000000000063',
     'Gas & transport - Bonus contribution planned', 'budget', 0, 200000, '2026-08-15', '2026-08-15', 0)
  on conflict (id) do nothing;
end $$;

-- Confirmation (shown as the result grid): which account now holds the
-- sample data, and how much of it. Log into the app with THIS account.
select u.email as seeded_account,
       (select count(*) from public.balances b where b.user_id = u.id) as balances,
       (select count(*) from public.recurring_items r where r.user_id = u.id) as recurring_items,
       (select count(*) from public.one_off_items o where o.user_id = u.id) as extras,
       (select count(*) from public.budgets g where g.user_id = u.id) as budgets,
       (select count(*) from public.budget_entries e where e.user_id = u.id) as budget_entries,
       (select count(*) from public.occurrence_overrides ov where ov.user_id = u.id) as overrides,
       (select count(*) from public.settlements s where s.user_id = u.id) as settlements,
       (select count(*) from public.reminders rm where rm.user_id = u.id) as reminders
from auth.users u
where exists (
  select 1 from public.balances b
  where b.user_id = u.id and b.id::text like '00000000-0000-4000-a000-%'
);
