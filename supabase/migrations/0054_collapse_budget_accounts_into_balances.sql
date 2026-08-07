-- T284: collapse "budget accounts" into ordinary accounts (SPEC.md Phase 49).
-- One accounts category from here on - `budget_accounts` is retired, its 4
-- real rows become plain `balances` rows (same ids, so every existing FK
-- value already points at the right row - only the constraint target moves).
-- `used_for_budgets` is the new opt-in tag the "Cash Flow Only" toggle reads.

alter table balances
  add column used_for_budgets boolean not null default false;

-- Re-use the same ids: budget_budget_accounts/budget_entries/settlements
-- already store these exact uuids, so no data rewrite is needed, only the
-- FK constraints below move to point at `balances`.
insert into balances (id, user_id, name, amount, comments, created_at, updated_at, used_for_budgets)
select id, user_id, name, amount, comments, created_at, created_at, true
from budget_accounts;

-- budget_budget_accounts: which balance(s) a budget draws from, and its
-- configured replenish share of each.
alter table budget_budget_accounts rename column budget_account_id to balance_id;
alter table budget_budget_accounts drop constraint budget_budget_accounts_budget_account_id_fkey;
alter table budget_budget_accounts
  add constraint budget_budget_accounts_balance_id_fkey
  foreign key (balance_id) references balances(id) on delete cascade;

-- budget_entries: which account a logged ledger entry actually touched.
alter table budget_entries rename column budget_account_id to balance_id;
alter table budget_entries drop constraint budget_entries_budget_account_id_fkey;
alter table budget_entries
  add constraint budget_entries_balance_id_fkey
  foreign key (balance_id) references balances(id) on delete set null;

-- scenario_budgets: which balance a scenario budget would draw from if
-- activated for real. Same rename/repoint, nullable throughout.
alter table scenario_budgets rename column budget_account_id to balance_id;
alter table scenario_budgets drop constraint scenario_budgets_budget_account_id_fkey;
alter table scenario_budgets
  add constraint scenario_budgets_balance_id_fkey
  foreign key (balance_id) references balances(id) on delete set null;

-- settlements already has a `balance_id` column (bills/income/debt/savings/
-- extras settlements use it) - fold budget settlements onto the same column
-- instead of keeping a second, now-redundant one.
update settlements set balance_id = budget_account_id where budget_account_id is not null;
alter table settlements drop constraint settlements_budget_account_id_fkey;
alter table settlements drop column budget_account_id;

-- budget_account_transactions is the exact same shape as balance_transactions
-- (id/user_id/<account>_id/entry_date/amount/direction/note/created_at) -
-- fold its 8 rows in directly, ids preserved, then retire the table.
insert into balance_transactions (id, user_id, balance_id, entry_date, amount, direction, note, created_at)
select id, user_id, budget_account_id, entry_date, amount, direction, note, created_at
from budget_account_transactions;

drop table budget_account_transactions;
drop table budget_accounts;
