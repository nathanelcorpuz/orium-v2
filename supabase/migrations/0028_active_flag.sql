-- 0028: temporarily disable a financial record (SPEC.md T175)
--
-- User request 2026-07-31: "allow to temporarily switch off a financial
-- record (bill/misc/income/debt/savings/budgets) so I can quickly see how it
-- will impact the forecast." Deleting and re-adding an item to answer that
-- question loses its settlement history and its per-occurrence overrides, so
-- it was never a real option.
--
-- `active` rather than a nullable `disabled_at`: the forecast only ever needs
-- the boolean, and NOT NULL DEFAULT true means every existing row is already
-- correct without a backfill pass.
--
-- Purely additive - one nullable-free column with a default per table, no
-- data rewritten, no constraint changed. Safe against live production data.

alter table public.recurring_items
  add column if not exists active boolean not null default true;

alter table public.one_off_items
  add column if not exists active boolean not null default true;

alter table public.budgets
  add column if not exists active boolean not null default true;

comment on column public.recurring_items.active is
  'T175: false hides this item from the forecast without deleting it. Settlement history and occurrence overrides are preserved.';
comment on column public.one_off_items.active is
  'T175: see recurring_items.active.';
comment on column public.budgets.active is
  'T175: false excludes this budget''s projected replenishments and future ledger entries from the forecast. The budget''s own running total is unaffected.';
