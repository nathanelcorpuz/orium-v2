-- 0051: per-occurrence connected-account override (SPEC.md, bug report 2026-08-03)
--
-- T193 made the Forecast/Calendar Edit tab's "Connected account" field a
-- *permanent* change to the underlying recurring item's own `balance_id` -
-- deliberate at the time ("I connected this to the wrong account" reads as
-- a lasting fix). User report 2026-08-03: "editing an account in the
-- forecast page edits all of the future transactions for that finance item.
-- it should just update for that specific forecasted transaction." This
-- reverses that decision - the account picker in the Edit tab now writes a
-- per-occurrence override here instead, mirroring new_date/new_amount/
-- new_name above it.
--
-- `balance_id_overridden` exists because `new_balance_id` alone can't tell
-- "never touched" apart from "explicitly set to no account" - both are
-- plain SQL null. Every occurrence_overrides row is written as a full
-- snapshot by exactly one of two callers (editRecurringOccurrence or the
-- settle-time skip upsert in forecast/actions.ts), so this flag just
-- records which case produced the row, the same way skipped's own default
-- already had to be chosen carefully per-caller (see migration 0049's
-- income_auto_move_overrides for the same reasoning applied there).
alter table public.occurrence_overrides
  add column if not exists new_balance_id uuid references public.balances(id) on delete set null,
  add column if not exists balance_id_overridden boolean not null default false;
