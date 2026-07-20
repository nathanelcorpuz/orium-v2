-- Preferences: one row per user, auto-created on first login (see src/lib/supabase/preferences.ts)

create table if not exists public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default '₱',
  balance_ranges bigint[] not null default array[0, 500000, 2000000, 5000000, 10000000]::bigint[]
);

alter table public.preferences enable row level security;

create policy "preferences_select_own"
  on public.preferences for select
  using (auth.uid() = user_id);

create policy "preferences_insert_own"
  on public.preferences for insert
  with check (auth.uid() = user_id);

create policy "preferences_update_own"
  on public.preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "preferences_delete_own"
  on public.preferences for delete
  using (auth.uid() = user_id);
