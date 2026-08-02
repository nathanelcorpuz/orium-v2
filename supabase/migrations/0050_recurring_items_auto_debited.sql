-- 0050: "auto-debited" flag on recurring items (SPEC.md T232)
--
-- User request 2026-08-03 (REMINDER.md), raised alongside the fund-
-- distribution planning discussion: some bills/debt/savings items are paid
-- automatically by a specific account (e.g. subscriptions auto-debited from
-- "BDO Tatay", the Car Loan) and can't be freely reassigned to a different
-- account during that planning. This flag marks an item as pinned so the UI
-- can show it "at a glance" and skip offering a reassignment control for it.
--
-- Scoped to recurring_items only (bill/debt/savings, per the user's own
-- examples) - one_off_items (Misc) are single dated transactions, not a
-- recurring auto-debit arrangement, so the concept doesn't apply there.

alter table public.recurring_items
  add column if not exists auto_debited boolean not null default false;
