-- T88 (SPEC.md Phase 13): full wipe of the test account's data, ahead of
-- re-running the rewritten supabase/seed.sql. The account holds only
-- disposable test data (confirmed with the user - no real family finances
-- entered yet), including drift from earlier ad-hoc bug-repro sessions, so
-- this deletes by user_id rather than only the seed's own id prefix.
--
-- Deletes in FK-safe child-before-parent order. Does NOT touch
-- `preferences` or the `auth.users` row itself - seed.sql sets preferences
-- to its own values via upsert, and the account/login stays intact.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL editor, then
-- paste and run supabase/seed.sql immediately after.

do $$
declare
  v_user uuid;
  v_email text;
begin
  select id, email into v_user, v_email
  from auth.users
  order by last_sign_in_at desc nulls last, created_at desc
  limit 1;

  if v_user is null then
    raise exception 'auth.users is empty - nothing to wipe';
  end if;

  raise notice 'Wiping test data for account: %', v_email;

  delete from public.budget_entries where user_id = v_user;
  delete from public.budget_replenish_overrides where user_id = v_user;
  delete from public.occurrence_overrides where user_id = v_user;
  delete from public.settlements where user_id = v_user;
  delete from public.reminders where user_id = v_user;
  delete from public.budgets where user_id = v_user;
  delete from public.one_off_items where user_id = v_user;
  delete from public.recurring_items where user_id = v_user;
  delete from public.balances where user_id = v_user;
end $$;

-- Confirmation (expect every count to be 0):
select
  (select count(*) from public.balances) as balances,
  (select count(*) from public.recurring_items) as recurring_items,
  (select count(*) from public.one_off_items) as one_off_items,
  (select count(*) from public.budgets) as budgets,
  (select count(*) from public.budget_entries) as budget_entries,
  (select count(*) from public.settlements) as settlements,
  (select count(*) from public.reminders) as reminders;
