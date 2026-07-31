-- 0030: "last seen" marker for the activity log feed (SPEC.md T163)
--
-- T163 - "what's changed since you last logged in", so a couple sharing one
-- account can stay in sync - reads T162's activity_log and needs a per-user
-- watermark to know what's new since they last looked. `preferences` already
-- has exactly one row per user (migration 0001), so a nullable timestamp
-- column there is cheaper than a new one-row-per-user table just for this.
--
-- Null means "never looked at the feed" - every existing user's entries all
-- count as unseen the first time they open it, rather than the feed
-- silently starting empty for accounts that predate this column.

alter table public.preferences
  add column if not exists activity_log_seen_at timestamptz;

comment on column public.preferences.activity_log_seen_at is
  'T163: activity_log entries created after this are "new" on the Updates page. Null = never viewed.';
