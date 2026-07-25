-- Follow-up to 0016_sample_data_seeding: the security advisor flagged that
-- `anon` (unauthenticated) could still call seed_sample_data via PostgREST,
-- since Postgres grants EXECUTE to PUBLIC by default and the function's own
-- guard only blocks a *different* authenticated user, not an anon caller
-- (anon has no session either, so `auth.uid() is not null` is false for it
-- too - the same condition that's meant to let the trusted SQL-editor path
-- through). Explicitly revoking closes that gap; `authenticated` keeps
-- access since that's the only role the app's own server actions call this
-- as (always with the caller's own user id).

revoke execute on function public.seed_sample_data(uuid) from public;
revoke execute on function public.seed_sample_data(uuid) from anon;
grant execute on function public.seed_sample_data(uuid) to authenticated;
