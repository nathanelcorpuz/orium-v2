-- 0053: app-owned signup email verification (SPEC.md T271)
--
-- User request 2026-08-04: "Now that we're going to use nodemailer, we can
-- easily implement the code stuff don't we?" Replaces reliance on Supabase
-- Auth's own "Confirm signup" email (which Supabase refuses to let this
-- project edit or send more than ~2/hour without custom SMTP - Bug #24/#25)
-- with a code the app generates, stores, and emails itself via nodemailer.
--
-- One row per user (`unique(user_id)`) - a resend overwrites the existing
-- code/expiry rather than accumulating rows, so "verify" only ever has one
-- candidate to check. Short-lived (`expires_at`, app-set to ~15 minutes
-- ahead at insert time) since a code sitting valid indefinitely would be a
-- real, if small, account-takeover window.
--
-- RLS policies scope to `auth.uid() = user_id` normally - the account is
-- already created and signed in (via signInWithPassword, immediately after
-- the admin-API createUser call) by the time this table is ever touched, so
-- no admin/service-role client is needed for the code itself, only for the
-- one-time user creation in `signup()`.
create table if not exists public.signup_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.signup_verification_codes enable row level security;

create policy "signup_verification_codes_select_own" on public.signup_verification_codes
  for select using (auth.uid() = user_id);
create policy "signup_verification_codes_insert_own" on public.signup_verification_codes
  for insert with check (auth.uid() = user_id);
create policy "signup_verification_codes_update_own" on public.signup_verification_codes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "signup_verification_codes_delete_own" on public.signup_verification_codes
  for delete using (auth.uid() = user_id);

-- Gates real app access until the code above is verified - default false so
-- every existing (already-verified) user is completely unaffected; signup()
-- sets this true explicitly for new email-based accounts only. T269's
-- planned username-only accounts (not yet built) will start false too, since
-- there's no email to verify.
alter table public.preferences
  add column if not exists pending_email_verification boolean not null default false;
