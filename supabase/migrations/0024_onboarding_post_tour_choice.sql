-- T120 (SPEC.md): the persistent "what next?" prompt shown once the short
-- tour finishes - explore with test data, get guided step-by-step setup, or
-- start entering real data. It has to survive navigation AND reload until a
-- choice is made (user request 2026-07-26: "I want this option to persist
-- anywhere they go until they select one"), so it's server state, not a
-- client-side banner flag.
--
-- Values: null = not chosen yet, keep showing the prompt;
--         'test_data' | 'guided_setup' | 'own_data' = a real choice;
--         'dismissed' = the small close button (Settings > Help brings the
--         same three options back).
--
-- Same additive-then-flip-default pattern as T115/T119's own onboarding
-- columns: every EXISTING row is backfilled to 'own_data' so nobody already
-- using the app is suddenly shown a post-tour prompt for a tour they may
-- have finished sessions ago, then the default flips to null so only rows
-- created from here on - genuinely new signups - start unset.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.preferences
  add column if not exists onboarding_post_tour_choice text default 'own_data';

alter table public.preferences
  alter column onboarding_post_tour_choice set default null;
