-- T120 follow-up (user request 2026-07-26): the explainer tips added to every
-- add/edit form are helpful the first few times and clutter afterwards, so
-- each one gets its own "don't show this tip next time" dismissal.
--
-- Stored server-side (rather than localStorage, which every other purely
-- cosmetic collapse state in this app uses) for the same reason T119 moved
-- onboarding progress to the database: a dismissal is a lasting statement
-- about what the user already understands, and having tips reappear after a
-- logout or on a second device would defeat the point.
--
-- One row per user holding the set of dismissed tip keys (e.g.
-- 'bill-account', 'budget-intro'); an unknown/removed key is simply never
-- matched, so renaming a tip in code just makes it show again rather than
-- breaking anything.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.preferences
  add column if not exists dismissed_form_tips text[] not null default '{}'::text[];
