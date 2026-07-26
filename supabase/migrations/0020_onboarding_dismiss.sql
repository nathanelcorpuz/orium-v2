-- T115 follow-up (user request 2026-07-26): a completely new user can opt
-- out of the required onboarding wizard entirely ("explore first") without
-- losing progress - `onboarding_dismissed_at` set means "don't hard-block
-- right now", independent of `onboarding_required_completed` (migration
-- 0019). The wizard's own derived per-step progress (real rows +
-- `onboarding_skipped_steps`) is untouched by dismissing, so resuming later
-- via Settings' "Continue guided setup" picks up at the exact same step.
--
-- Nullable, no default needed (existing rows correctly get NULL = "never
-- dismissed, and also already completed" - irrelevant for them either way
-- since `onboarding_required_completed` is already true for every
-- pre-existing row per migration 0019's backfill).
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.preferences
  add column if not exists onboarding_dismissed_at timestamptz null;
