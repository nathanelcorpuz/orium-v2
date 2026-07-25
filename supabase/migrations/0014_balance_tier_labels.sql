-- T80 (SPEC.md Phase 12): user-editable "lowest balance" tier labels
-- (T76's "Comfortable low point", "Healthy low point", etc.), alongside the
-- existing balance color thresholds. 6 entries, one per tier in
-- balanceRangeTier's order: danger, low, medium, high, higher, highest.
-- Default matches the previously-hardcoded TIER_LABEL table in
-- src/lib/balanceColor.ts exactly, so existing behavior is unchanged until
-- a user edits their own labels.
--
-- Non-destructive: NOT NULL with a default, no existing rows lose data.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor.

alter table public.preferences
  add column if not exists balance_tier_labels text[] not null default array[
    '⚠ Goes negative by',
    'Cutting it close:',
    'Lowest balance ahead:',
    'Comfortable low point:',
    'Healthy low point:',
    'Strong low point:'
  ]::text[];
