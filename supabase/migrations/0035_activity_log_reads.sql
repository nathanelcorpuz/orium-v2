-- 0035: per-entry "mark as read" state for Updates (SPEC.md T187)
--
-- User request: an Updates entry should stay visually "new" until the user
-- explicitly marks it read - individually, or via "Mark all as read" -
-- rather than the previous behavior (T163) of silently marking the entire
-- feed read the moment the page was opened.
--
-- "Mark all as read" keeps using preferences.activity_log_seen_at (T163,
-- migration 0030) unchanged - a single watermark is exactly right for a
-- bulk "everything up to now" action. This table only covers the individual
-- case: marking one entry read while others stay unread, the same shape
-- T185's activity_log_dismissals table already established for "hide" -
-- select/insert-only RLS, no update/delete policy, since there is no
-- "mark unread again" feature being built.
--
-- No addition needed to wipeFinancialData.ts/wipe_test_data.sql, same
-- reasoning as 0034: activity_log_id cascades on delete, so wiping a user's
-- activity_log rows (already listed there since T163) clears this table's
-- rows for that user too.

create table if not exists public.activity_log_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_log_id uuid not null references public.activity_log(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, activity_log_id)
);

alter table public.activity_log_reads enable row level security;

create policy "activity_log_reads_select_own" on public.activity_log_reads
  for select using (auth.uid() = user_id);
create policy "activity_log_reads_insert_own" on public.activity_log_reads
  for insert with check (auth.uid() = user_id);
