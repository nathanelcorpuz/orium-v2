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

**Email volume, which blocks either approach.** Supabase's built-in email sender is rate-limited to a couple of messages per hour on the free tier - this is the "email rate limit exceeded" error already hit during testing, and it is recorded as an open action item in SPEC.md's Operations note. Every invite, confirmation, and password reset goes through it. Inviting real users will hit this wall immediately.

The fix is custom SMTP, configured in the Supabase dashboard against a transactional email provider. Free tiers are generous enough to cover a beta comfortably. This is the single blocking item for inviting anyone, and it is a dashboard configuration task rather than a code change.

---

## 5. Suggested order

1. Create the staging Supabase project, apply the 26 migrations, seed it, and repoint `.env.local`. One session, and it retires the production-database hazard in section 1 entirely.
2. Configure custom SMTP on production. Unblocks inviting anyone.
3. Decide how signup is gated (dashboard invites first, invite code later if the group grows).
4. Set up the one-way data refresh, on request rather than automatically.

Steps 1 and 2 are independent of each other and both are prerequisites for the rest.

---

## Open decisions for the user

- Second hosted Supabase project (recommended) or local Docker via the Supabase CLI?
- Closed signup with dashboard invites, or open signup behind an invite code?
- Data refresh on explicit request (recommended) or as a standing per-session step?
