-- T119 (SPEC.md): server-persisted "which onboarding path did they pick"
-- state, so a first-time user's tour/guided-setup progress survives logout
-- and closing the browser (previously the tour tracked its step purely in
-- React state, lost on any reload; guided setup already persisted via
-- onboarding_required_completed/onboarding_wizard_state from T115).
--
-- `onboarding_choice` uses the same additive-then-flip-default pattern
-- T115's onboarding_required_completed did: every EXISTING row gets
-- 'skipped' from the column's initial default (an already-onboarded account
-- should never see a "welcome, pick tour or setup" prompt), then the
-- default flips to null so only rows created from this point forward -
-- genuinely new signups - start unset and see the welcome choice.
--
-- `onboarding_tour_step` is the tour's current step index (0-based) while
-- `onboarding_choice = 'tour'`; null means no tour in progress (never
-- started, or finished). `onboarding_tour_completed_at` is set the first
-- time the tour is ever finished, so a later replay (Settings' "Review the
-- tour") doesn't re-trigger the once-only end-of-tour prompts.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.preferences
  add column if not exists onboarding_choice text default 'skipped';

alter table public.preferences
  alter column onboarding_choice set default null;

alter table public.preferences
  add column if not exists onboarding_tour_step smallint;

alter table public.preferences
  add column if not exists onboarding_tour_completed_at timestamptz;
