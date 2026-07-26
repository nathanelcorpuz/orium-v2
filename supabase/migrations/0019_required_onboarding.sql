-- T115 (SPEC.md): required onboarding wizard state. New signups now start
-- empty (T97's auto-seed-on-signup was removed the same session) and are
-- hard-blocked into a wizard requiring at least one real account, bill, and
-- income before using the rest of the app; debt/savings/budgets/misc are
-- offered the same way but can be explicitly skipped.
--
-- `onboarding_required_completed` uses the additive-then-flip-default
-- pattern: every EXISTING row gets `true` from the column's initial
-- default (never retroactively blocked by a feature that didn't exist when
-- they signed up), then the default flips to `false` so only rows created
-- from this point forward - genuinely new signups - start blocked.
--
-- `onboarding_skipped_steps` persists which optional steps a user
-- explicitly opted out of (vs. simply not having gotten to yet), so
-- resuming the wizard later doesn't re-ask for something already declined.
--
-- Both non-destructive additive columns, no existing data touched.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.preferences
  add column if not exists onboarding_required_completed boolean not null default true;

alter table public.preferences
  alter column onboarding_required_completed set default false;

alter table public.preferences
  add column if not exists onboarding_skipped_steps text[] not null default '{}'::text[];
