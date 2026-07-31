-- 0027: per-instance edits for projected budget replenishments (SPEC.md T168)
--
-- `budget_replenish_overrides` (migration 0011) could only ever say "this
-- projected replenishment is handled" - it has `skipped boolean not null
-- default true` and nothing else. That was all T59 needed, because the only
-- writer was settleOccurrence marking an occurrence done.
--
-- T168 (user request 2026-07-31): a projected replenishment should be
-- adjustable per instance the same way a recurring bill's occurrence already
-- is - "I only want 8,000 into this budget this month instead of 10,000", or
-- "I need it a week earlier". That is exactly the shape `occurrence_overrides`
-- has had since v1 (new_date / new_amount / skipped), so this migration brings
-- the budget table in line rather than inventing a second mechanism.
--
-- Purely additive: two nullable columns, no data rewritten, no constraint
-- changed. Existing rows keep `skipped = true` and both new columns null,
-- which reads identically to how they behave today.
--
-- Note on `skipped`: it stays `not null default true`, so a *writer* creating
-- an edit override must pass `skipped = false` explicitly. Deliberately not
-- changed - flipping the default would silently alter what an existing
-- settle-path insert means if it ever stopped passing the column.

alter table public.budget_replenish_overrides
  add column if not exists new_date date,
  add column if not exists new_amount bigint;

-- Amount is a positive magnitude, matching `budgets.allocation` (the value it
-- overrides). The forecast negates it for display; storing a negative here
-- would double-negate.
alter table public.budget_replenish_overrides
  drop constraint if exists budget_replenish_overrides_new_amount_positive;

alter table public.budget_replenish_overrides
  add constraint budget_replenish_overrides_new_amount_positive
  check (new_amount is null or new_amount >= 0);

comment on column public.budget_replenish_overrides.new_date is
  'T168: moves this projected replenishment to a different date. Null = keep the scheduled date.';
comment on column public.budget_replenish_overrides.new_amount is
  'T168: replaces budgets.allocation for this one occurrence, positive centavos. Null = use the allocation.';
