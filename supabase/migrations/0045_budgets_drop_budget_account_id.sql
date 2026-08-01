-- 0045: drop budgets.budget_account_id (SPEC.md T218)
--
-- Superseded by budget_budget_accounts (migration 0043) - every real link
-- was backfilled there, verified by an exact-match query against production
-- immediately before this ran (0 mismatches), and every app code path was
-- cut over to the join table in the same session (writeLedgerEntry,
-- settleBudgetReplenish, the income-linked replenish loop, moveBudgetFunds,
-- createBudget/updateBudget, BudgetCard.tsx). Nothing reads this column
-- anymore - confirmed by a full grep of src/ before this migration was
-- written.

alter table public.budgets drop column if exists budget_account_id;
