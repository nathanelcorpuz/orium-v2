-- 0052: daily "transactions due today" email notification preferences
--
-- User request 2026-08-03: "implement an email notification system that
-- notifies me when a forecasted transaction is detected for the day...
-- give me a list of the transactions in question. I should be able to set
-- the time of when in the day I will receive it and it should ask for a
-- timezone." Resolves ask (1) of the "Email notifications" discussion item
-- in SPEC.md's Before MVP launch section.
--
-- `notification_timezone` is a plain IANA name (e.g. "Asia/Manila"),
-- validated app-side against `Intl.supportedValuesOf("timeZone")` rather
-- than a DB constraint - Postgres has no built-in IANA-name check, and the
-- browser's own Intl API is the authoritative list anyway.
--
-- `last_notified_date` prevents a duplicate send within the same day if the
-- scheduled check (every 15 minutes, see vercel.json) runs more than once
-- inside a user's matching time window - compared against "today" computed
-- in the user's own timezone, not the server's.
alter table public.preferences
  add column if not exists email_notifications_enabled boolean not null default false,
  add column if not exists notification_time time not null default '08:00:00',
  add column if not exists notification_timezone text,
  add column if not exists last_notified_date date;
