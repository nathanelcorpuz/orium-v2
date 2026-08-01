-- 0044: budget_entries knows which budget account it moved (SPEC.md T218
-- follow-up to migration 0043)
--
-- With budgets.budget_account_id going away (a budget can now connect to
-- several accounts via budget_budget_accounts, migration 0043), a single
-- ledger entry needs its own record of which one account it actually
-- touched - previously implicit ("the budget's one linked account, if any"),
-- now genuinely ambiguous without it once a budget has more than one.
-- updateBudgetEntry/deleteBudgetEntry (budgets/actions.ts) read this
-- directly instead of joining through budgets, and it mirrors 1:1 onto the
-- entry's matching settlements.budget_account_id (migration 0043).

alter table public.budget_entries
  add column if not exists budget_account_id uuid references public.budget_accounts(id) on delete set null;

create index if not exists budget_entries_budget_account_id_idx on public.budget_entries (budget_account_id);

-- Backfill: an existing entry belonging to a budget that had exactly one
-- linked account (the only shape that existed before T218) gets that
-- account attributed retroactively - real past ledger rows shouldn't read as
-- "no account" just because the column didn't exist yet when they were
-- written.
update public.budget_entries be
set budget_account_id = bba.budget_account_id
from public.budget_budget_accounts bba
where bba.budget_id = be.budget_id
  and be.budget_account_id is null
  and (select count(*) from public.budget_budget_accounts x where x.budget_id = be.budget_id) = 1;
