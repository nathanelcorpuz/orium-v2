-- 0048: fix activity_log.entity_type CHECK constraint - missing
-- 'budget_account' (bug report 2026-08-02: "the updates doesnt update when
-- i update budget accounts in any way")
--
-- Root cause, confirmed against production data: T204 (2026-08-01) added
-- `'budget_account'` to the app-level `ActivityEntityType` union
-- (src/lib/activityLog.ts) and wired `logActivity(..., entityType:
-- "budget_account", ...)` into createBudgetAccount/updateBudgetAccount/
-- deleteBudgetAccount/addBudgetAccountFunds/takeBudgetAccountFunds/
-- moveBudgetAccountFunds (T204/T209) - but the DB-level CHECK constraint
-- from migration 0029 was never updated to match. `logActivity` deliberately
-- swallows its own errors (see its own doc comment - a logging failure must
-- never turn a successful create/edit/delete into a reported failure), so
-- every one of those inserts has been silently rejected by Postgres ever
-- since T204 shipped, with no visible error anywhere. Confirmed via
-- production: zero `entity_type = 'budget_account'` rows exist in
-- `activity_log` despite budget accounts (Maya Nanay, GCash Tatay, ...)
-- clearly having been created and used.

alter table public.activity_log drop constraint if exists activity_log_entity_type_check;

alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('account', 'bill', 'income', 'debt', 'savings', 'budget', 'budget_entry', 'budget_account', 'misc', 'reminder'));
