-- 0039: optional due date on reminders (SPEC.md T190)
--
-- User request: reminders should have an optional date that, when set,
-- shows up on the calendar with a green icon - closing a gap T164's own
-- write-up flagged directly: "the reminders table has no due-date column
-- at all (id/text/completed/completed_at only), so there is no date to
-- place one on."
--
-- Nullable, no default: a reminder with no date behaves exactly as before
-- (shown in the Reminders list, never plotted on the calendar). Purely
-- additive.

alter table public.reminders
  add column if not exists due_date date;

comment on column public.reminders.due_date is
  'T190: optional - when set, this reminder is also plotted on the calendar (green). Null = list-only, same as before this column existed.';
