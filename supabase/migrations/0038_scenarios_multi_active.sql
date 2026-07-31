-- 0038: unlimited simultaneously active scenarios (SPEC.md T183)
--
-- User request: reverses T174's deliberate v1 constraint ("one active
-- scenario at a time... matches the user's own 'toggle it on or off'
-- framing") - now every scenario should be independently toggleable, with
-- as many active at once as the user wants, all merged into the same
-- forecast together.
--
-- `preferences.active_scenario_id` (a single FK, migration 0033) can't
-- express "more than one" - replaced with `scenarios.is_active`, a plain
-- boolean on the scenario itself rather than a separate join table, since a
-- scenario already belongs to exactly one user (its own `user_id`) and
-- "is this one on" is a property of the row itself, not a relationship.
--
-- Existing single active scenario (if any) is carried over so nobody's
-- current forecast silently changes the moment this migration runs.

alter table public.scenarios add column if not exists is_active boolean not null default false;

update public.scenarios s
set is_active = true
from public.preferences p
where p.active_scenario_id = s.id;

alter table public.preferences drop column if exists active_scenario_id;
