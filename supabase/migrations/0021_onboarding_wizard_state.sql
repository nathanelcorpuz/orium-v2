-- T115 follow-up (user request 2026-07-26): "add another?" interstitial
-- after each save, instead of auto-advancing straight to the next step.
--
-- This has to be server-persisted, not client React state or a URL search
-- param - both were tried and empirically failed (confirmed via a
-- temporary mount-id debug log) because every embedded create action
-- (createBalance etc.) calls revalidatePath, and Next.js's own automatic
-- post-action refresh of this route remounts `OnboardingWizard` and/or
-- races a client-side URL update, discarding it. A DB column read fresh
-- by `(app)/layout.tsx` on every request sidesteps both failure modes.
--
-- Encodes one of two states as `"prompt:<stepKey>"` (show the "X added -
-- add another or continue?" interstitial) or `"reopen:<stepKey>"` (force
-- that step's Add form open again, ignoring otherwise-already-satisfied
-- natural step progress) - null means no override, fall back to normal
-- step derivation.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.preferences
  add column if not exists onboarding_wizard_state text null;
