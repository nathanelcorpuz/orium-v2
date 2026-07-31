-- 0032: per-account transaction fee (SPEC.md T172)
--
-- User request: a fee set on an account (e.g. "BDO" charges 10 pesos) auto-
-- deducts from every forecasted transaction connected to that account.
--
-- Two scoping decisions made directly (standing authority), both flagged as
-- open in the task's own note:
--
-- 1. Applies to every transaction connected to the account, incoming or
--    outgoing - the user's own phrasing was "all forecasted transactions
--    connected to BDO," with no carve-out for income, and some real banks do
--    charge a fee on deposits too. A fee is inherently a cost regardless of
--    which direction the underlying transaction moves.
--
-- 2. Shown as its own line, not folded into the transaction's own amount -
--    a bill's displayed amount should always match its actual record; the
--    fee is a separate, visible deduction layered on top in the engine and
--    surfaced as its own field on the forecast row.
--
-- Nullable-with-default column, purely additive. `>= 0` because a fee is a
-- cost, never a rebate - a bank crediting a transaction is a different
-- feature (already representable as its own bill/income/misc entry), not
-- this one.

alter table public.balances
  add column if not exists transaction_fee_centavos bigint not null default 0;

alter table public.balances
  drop constraint if exists balances_transaction_fee_non_negative;

alter table public.balances
  add constraint balances_transaction_fee_non_negative check (transaction_fee_centavos >= 0);

comment on column public.balances.transaction_fee_centavos is
  'T172: flat fee (centavos, >= 0) auto-deducted from every forecasted transaction connected to this account, both incoming and outgoing. 0 = no fee.';
