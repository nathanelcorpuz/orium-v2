-- T126: drop the three onboarding columns left dead by Phase 18's rebuild.
--
-- WHAT THIS DOES: permanently removes three columns from `preferences`.
-- Nothing else. No data other than these columns' own values is touched,
-- and no other table is affected.
--
--   onboarding_required_completed (migration 0019, default flipped by 0022)
--   onboarding_dismissed_at       (migration 0020)
--   onboarding_post_tour_choice   (migration 0024)
--
-- WHY THEY'RE DEAD:
--   * `onboarding_required_completed` and `onboarding_dismissed_at` existed
--     only to drive the hard route-block in `(app)/layout.tsx` - "is setup
--     finished?" and "did they explicitly pause it?". T123 removed that gate
--     entirely (guided setup is now the ordinary /setup page), so nothing
--     asks either question any more.
--   * `onboarding_post_tour_choice` existed only to control the persistent
--     three-option prompt shown after the tour. T123 deleted that prompt as
--     one of the duplicated "which path do you want?" asks.
--
-- VERIFIED UNREAD BEFORE WRITING THIS (the T35/migration-0005 precedent -
-- that outage came from dropping columns something still read): grepped the
-- whole `src/` tree for each name. The only remaining occurrences were
-- writes in `/api/dev-reset-onboarding`, which was resetting them to their
-- defaults rather than reading them, and which this task removes in the
-- same commit. Every other onboarding column IS still live and is
-- deliberately untouched here: onboarding_choice, onboarding_tour_step,
-- onboarding_tour_completed_at, onboarding_wizard_state,
-- onboarding_skipped_steps, dismissed_form_tips, sample_data_seeded_at.
--
-- Safe to re-run: `if exists` on each drop.

alter table public.preferences
  drop column if exists onboarding_required_completed,
  drop column if exists onboarding_dismissed_at,
  drop column if exists onboarding_post_tour_choice;
