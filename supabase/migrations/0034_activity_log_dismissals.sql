-- 0034: per-user "hide from view" for activity_log entries (SPEC.md T185)
--
-- User request: let a user hide an Updates entry from their own view
-- without deleting the underlying activity_log row - T162's own migration
-- (0029) deliberately made that table append-only ("no update/delete
-- policy... even to its own owner"), so the row has to survive for
-- bug-hunting/audit purposes even after the user "deletes" it from what
-- they see.
--
-- A separate table rather than a column on activity_log itself, for the
-- same reason: adding a `hidden` column there would need an UPDATE policy
-- on a table whose whole point is that nothing (including its owner) can
-- ever modify a row after it's written.
--
-- No explicit delete/update policy here either - only select/insert. There
-- is no "un-hide" feature being built, so no write path needs to remove a
-- dismissal row; if that's ever wanted, it's a follow-up migration, not a
-- policy added speculatively now.
--
-- No FK-ordering entry needed in wipeFinancialData.ts/wipe_test_data.sql:
-- `activity_log_id` cascades on delete, so wiping a user's activity_log
-- rows (already in both lists since T163) automatically clears their
-- dismissals with it.

create table if not exists public.activity_log_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_log_id uuid not null references public.activity_log(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, activity_log_id)
);

alter table public.activity_log_dismissals enable row level security;

create policy "activity_log_dismissals_select_own" on public.activity_log_dismissals
  for select using (auth.uid() = user_id);
create policy "activity_log_dismissals_insert_own" on public.activity_log_dismissals
  for insert with check (auth.uid() = user_id);
