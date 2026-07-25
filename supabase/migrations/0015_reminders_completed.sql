-- T84 (SPEC.md Phase 12): reminders get a "completed" state distinct from
-- delete. Completing a reminder persists it (so it isn't lost) while the
-- Forecast panel's default list stops showing it; a "Show completed" toggle
-- in the UI reveals it again, restorable via the same column.
--
-- Non-destructive: both columns are additive with safe defaults, no existing
-- rows lose data or behavior (every existing reminder reads as not-completed,
-- same as today).
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.reminders
  add column if not exists completed boolean not null default false,
  add column if not exists completed_at timestamptz;
