-- SPEC.md Phase 10 (T53): budgets are being rewritten from a cycle/
-- allocation/carryover model to a simple running ledger - every
-- budget_entries row is now either money IN ('incoming', replenishment via
-- a settled linked income or a manual add) or money OUT ('outgoing', a
-- logged spend or a manual take), and a budget's current total is just
-- sum(incoming) - sum(outgoing) up to today. No cycle boundaries, no
-- carryover math, negative totals allowed.
--
-- Purely additive: every existing row is a past logged spend, so it
-- backfills as 'outgoing' - its meaning is unchanged. The default is then
-- dropped so every future insert must say which direction it is rather than
-- silently defaulting.
--
-- Not yet wired into forecast.ts or any page - see SPEC.md Phase 10 for the
-- staged rollout. Safe to run now regardless of that: this table has no
-- other consumers to break.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.budget_entries
  add column direction text not null default 'outgoing'
  check (direction in ('incoming', 'outgoing'));

alter table public.budget_entries alter column direction drop default;
