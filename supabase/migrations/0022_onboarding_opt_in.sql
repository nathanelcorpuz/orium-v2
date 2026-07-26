-- T117 (SPEC.md): guided setup (the step-by-step wizard from T115) is now
-- fully opt-in instead of a hard block for every new signup. The wizard
-- itself, its resume/skip state, and Settings' "Start guided setup"/
-- "Continue guided setup" buttons are all unchanged - a user can still start
-- it (restartRequiredOnboarding sets onboarding_required_completed back to
-- false, the same flag (app)/layout.tsx already gates on). The only change
-- needed is which value NEW rows start with: flipping the column's default
-- back to true means a brand-new signup's Dashboard is never auto-blocked.
--
-- Existing rows are untouched by an ALTER ... SET DEFAULT (it only changes
-- what future inserts get), so no backfill needed and no risk to whatever
-- state today's accounts are already in.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.preferences
  alter column onboarding_required_completed set default true;
