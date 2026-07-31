-- 0029: activity log foundation (SPEC.md T162)
--
-- User request: "a logs feature where all changes anywhere is logged" -
-- and, separately, the data behind T163's "what's changed since you last
-- logged in" feed. One mechanism, two surfaces - this table is that
-- mechanism; T163 reads from it.
--
-- Deliberately no foreign key to the entity it describes (balances,
-- recurring_items, budgets, one_off_items, reminders): a log entry has to
-- survive the thing it describes being deleted - "Deleted bill: Gym" must
-- still read "Gym" after the row is gone, not fail or cascade-delete the
-- log entry along with it. `entity_name` is a snapshot taken at write time
-- for exactly this reason, not a live join.
--
-- Write mechanism: application-level inserts from each server action, not a
-- Postgres trigger. Considered and rejected - triggers would need
-- per-table trigger functions on 7+ tables, capturing old/new values via
-- row-level triggers, and would still need application code to produce a
-- human-readable detail string (a friendly "Settled Salary, ₱20,000.00" is
-- not something a generic trigger can generate from a raw row diff).
-- Application-level is more code (touches every mutating action) but every
-- mutation already funnels through a small number of server actions, and
-- each one already knows the human-readable names/amounts a log entry
-- needs.

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  action text not null check (action in ('create', 'update', 'delete', 'settle', 'toggle_on', 'toggle_off')),
  entity_type text not null check (
    entity_type in ('account', 'bill', 'income', 'debt', 'savings', 'budget', 'budget_entry', 'misc', 'reminder')
  ),
  entity_name text not null,
  -- Optional short human-readable extra (an amount, a settle date) - not a
  -- full before/after diff. This is a glanceable feed, not a forensic audit
  -- trail; a real diff view is a larger, separate feature if ever needed.
  detail text
);

alter table public.activity_log enable row level security;

create policy "activity_log_select_own" on public.activity_log for select using (auth.uid() = user_id);
create policy "activity_log_insert_own" on public.activity_log for insert with check (auth.uid() = user_id);
-- Deliberately no update/delete policy: the log is append-only, even to its
-- own owner, so it stays a reliable record of what actually happened.

create index if not exists activity_log_user_created_idx on public.activity_log (user_id, created_at desc);
