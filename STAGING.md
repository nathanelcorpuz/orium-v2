# Staging, production safety, and inviting users

**One-pager, written 2026-07-31.** Requested after the user began running Orium against their own real finances in production. Covers three connected asks: a safe place to test changes, real data available as test data, and inviting specific other users. This is a decision document - nothing in it has been implemented.

---

## 1. The thing to fix first

**Local development currently points at the production database.** `.env.local` has `NEXT_PUBLIC_SUPABASE_URL=https://fptpkrbfbtfhzxbtmgic.supabase.co`, which is the production project named in CLAUDE.md. So `npm run dev` on this machine reads and writes the same database that holds the real money data.

This means "use local as staging" does not currently work, because local is not a separate environment - it is production with a different address bar. Two specific hazards follow from it:

- `/api/dev-new-account` creates real accounts in the production database. It cleans up after itself (`?cleanup=1` matches only the `orium-dev+` prefix), so this one is contained, but the rows are genuinely in production while they exist.
- `/api/dev-reset-onboarding?wipe=1` clears the financial data of **whichever account is currently logged in**. Run while signed in as the real account, that deletes real financial data. Nothing about the route asks which account it is about to wipe.

Both routes are correctly gated to `NODE_ENV === "development"`, so they cannot be reached on Vercel. That gate protects the deployed site; it does not protect the production *database*, which is what they are actually connected to.

Everything below is about closing that gap.

---

## 2. Recommended setup: a second free Supabase project

Supabase's free tier allows two projects per organization, so a dedicated staging database costs nothing.

- **Production** stays as it is: project `fptpkrbfbtfhzxbtmgic`, used only by the deployed Vercel site.
- **Staging** is a new free project, e.g. "Orium Staging". Local `.env.local` points at it instead. Local development can then be as destructive as it likes.

Rebuilding staging from scratch is already possible with what is in the repo: 26 migration files in `supabase/migrations/` applied in order, then `supabase/seed.sql` for a realistic dataset. `supabase/wipe_test_data.sql` resets it between runs. No new tooling, no new dependency, no cost.

Two things to know: free projects pause after about a week of inactivity and need a click to wake up (fine for staging), and every future migration then gets applied twice - staging first, production once it looks right. That second point is the actual benefit, not an inconvenience.

**Alternative worth knowing about, not recommended today:** `npx supabase start` runs Postgres and Auth locally in Docker. It is faster, fully offline, and the strongest isolation available. It also requires Docker Desktop on Windows and more setup than a second hosted project. Better as a later upgrade than a first step, given an hour a day.

**Not viable:** Supabase's own branching feature, which does exactly this properly, is a paid Pro plan feature.

---

## 3. Getting real data into staging as test data

The ask was to keep up-to-date real data available for testing, copied into something like `nathanelcorpuz+test@gmail.com`.

This is workable, with one rule: **the copy runs one way only, production to staging, never back.** Nothing in the tooling should be able to write to production as part of a data refresh.

Shape of the refresh, once staging exists:

1. Sign up `nathanelcorpuz+test@gmail.com` in the staging project and note its user id.
2. Read the real user's rows out of production (`balances`, `recurring_items`, `occurrence_overrides`, `one_off_items`, `settlements`, `budgets`, `budget_entries`, `reminders`, `preferences`) with a read-only query.
3. Insert them into staging with `user_id` rewritten to the test account's id.

The Supabase MCP connection takes a project id per call, so Claude can read from one project and write to the other in a single session, with no service-role key going anywhere near a browser.

**One recommendation against part of the original ask.** The note said "always pull up to date data when we start a session." Doing this automatically every session means routinely copying real financial records around, and the failure mode of an automated copy pointed at the wrong project is losing production data. Better as an explicit request - "refresh the test data" - than a standing instruction. The data does not change fast enough to need it every session.

---

## 4. Inviting specific users

Two separate blockers here, and the second is the real one.

**Controlling who can sign up.** Signup is currently open to anyone who reaches the URL. T132 changed confirmation from an emailed link to a typed 6-digit code, which is a better flow but not a gate. Two ways to close it: turn off public signup in Supabase and invite people from the dashboard's Authentication panel, or keep signup open behind an invite code checked at signup. The first needs no code and suits a small, hand-picked group; the second scales better and is worth building only once the group is bigger than a handful.

**Email volume, which blocks either approach.** Supabase's built-in email sender is rate-limited to a couple of messages per hour on the free tier - this is the "email rate limit exceeded" error already hit during testing, and it is recorded as an open action item in SPEC.md's Operations note. Every invite, confirmation, and password reset goes through it. Inviting real users will hit this wall immediately. **Reconfirmed 2026-08-04** (REMINDER.md, logged as BUGS.md Bug #25): the same limit also blocks several real people signing up around the same time even outside a formal invite flow - same root cause, same fix, no new plan needed.

The fix is custom SMTP, configured in the Supabase dashboard against a transactional email provider. Free tiers are generous enough to cover a beta comfortably. This is the single blocking item for inviting anyone, and it is a dashboard configuration task rather than a code change.

**Stronger than previously known, found 2026-08-04**: the Supabase dashboard's Email Templates screen now refuses to save *any* edit at all - "Set up custom SMTP to edit templates" - on the default/shared mailer. This isn't just a rate-limit problem anymore: custom SMTP is a hard prerequisite for editing the "Confirm signup" template too (BUGS.md Bug #24, the still-open confirmation-link cleanup), not only for volume (Bug #25). T239 (SPEC.md Phase 42) already has a Resend account started for the daily-notification emails via their REST API - Resend also issues SMTP credentials, so the same provider/account can likely serve both without a second signup, once a sending domain is verified there.

---

## 5. Suggested order

1. Create the staging Supabase project, apply the 26 migrations, seed it, and repoint `.env.local`. One session, and it retires the production-database hazard in section 1 entirely.
2. Configure custom SMTP on production. Unblocks inviting anyone.
3. Decide how signup is gated (dashboard invites first, invite code later if the group grows).
4. Set up the one-way data refresh, on request rather than automatically.

Steps 1 and 2 are independent of each other and both are prerequisites for the rest.

---

## Open decisions for the user

- ~~Second hosted Supabase project (recommended) or local Docker via the Supabase CLI?~~ **Decided 2026-08-01: second hosted project.** Done - see "Progress" below.
- Closed signup with dashboard invites, or open signup behind an invite code?
- ~~Data refresh on explicit request (recommended) or as a standing per-session step?~~ **Decided 2026-08-01: on explicit request only** ("refresh the test data"), per the recommendation above. Not yet built - section 3's refresh mechanism is still just a plan.

---

## Progress (2026-08-01)

Step 1 of the suggested order is done: a second free Supabase project, **"Orium Staging"** (ref `gwvnqvampbztirzqjuaq`, same org, same `ap-southeast-1` region, confirmed $0/month), was created and all 33 migration files in `supabase/migrations/` were applied to it in order - **with one deliberate exception**: `0007_budgets_drop_legacy_after_t38.sql` was skipped, because checking production directly showed `budgets.monthly_allocation` is still there - T38 never actually ran that migration against production, so staging was built to match production's *real* current schema rather than the idealized one the migration files alone would imply. Verified after applying: staging's 14 public tables match production's table list exactly.

`.env.local` now points local `npm run dev` at staging instead of production - the hazard STAGING.md's section 1 opened with (`/api/dev-reset-onboarding?wipe=1` wiping whichever account is logged in) is retired for local development from this point forward. Production's old values are kept commented out in the same file for a one-line revert if ever needed.

**One manual step left**: `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` is blank for staging. The Supabase MCP connection can only read publishable/anon keys, not the service-role secret, so this one has to come from the user directly: Supabase dashboard > "Orium Staging" project > Settings > API > copy the `service_role` secret > paste it into `.env.local`. Until that's filled in, the dev-only routes that use the service-role client (`/api/dev-new-account`, `/api/dev-reset-onboarding`) won't work against staging.

**Section 3's data refresh, done 2026-08-01**: staging now holds a real copy of the production account, for local testing without ever touching real records again. Built exactly as planned - read-only from production, one-way into staging - with one deliberate change from the original plan: the test account uses the **same email**, `nathanelcorpuz@gmail.com` (not a `+test` alias), since staging is a fully separate Supabase project/auth pool and the user asked for it this way directly.

Mechanism used (repeatable on request - "refresh the test data" - not automatic):
1. Created the staging auth user via the Admin API (`admin.auth.admin.createUser`, `email_confirm: true`), reusing `DEV_LOGIN_PASSWORD` from `.env.local` so it's the same password already used for local dev-only accounts. Done with a throwaway `.mjs` script run from the repo root (needs `node_modules` on the module path) with the staging URL/service-role key/password read out of `.env.local` and exported as env vars in the same shell command - never printed, never committed, deleted immediately after.
2. For each table (`balances`, `recurring_items`, `occurrence_overrides`, `one_off_items`, `settlements`, `budgets`, `budget_entries`, `budget_replenish_overrides`, `reminders`, `preferences`, `balance_transactions`, `scenarios`, `scenario_recurring_items` - `scenario_one_off_items`/`scenario_budgets`/`scenario_budget_entries` were empty for this account, skipped): read every row for the production user via the Supabase MCP `execute_sql` (`jsonb_agg`), then inserted into staging via `jsonb_populate_recordset` against the *same* jsonb literal with `user_id` swapped to the new staging user's id. No manual per-row SQL escaping (`jsonb_populate_recordset` parses the JSON itself), verified by an exact row-count + `sum(balances.amount)` match between the two projects afterward (₱89,211.17 both sides). `activity_log` was deliberately skipped (large, not needed to test Forecast/Budgets behavior).
3. This is a snapshot, not a live sync - staging's copy is already stale the moment new production activity happens. Re-run the same steps on request when a fresh copy is needed; nothing here writes back to production.

Custom SMTP and signup gating (section 4) are still just the plan written above, not built.
