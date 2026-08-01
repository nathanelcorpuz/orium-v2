# CLAUDE.md — Orium project instructions

## About this project
Orium is a family cash-flow forecasting app (Next.js + Supabase). The full product definition, data model, engine rules, and roadmap live in **SPEC.md — the single spec file; read it before doing anything.** Active bugs are tracked in **BUGS.md** — read it before starting work.

Two supporting files, added 2026-07-31, deliberately do *not* need reading at session start:
- **ARCHIVE.md** — build write-ups for every completed task, moved out of SPEC.md when it hit ~318KB. Read it only when you need the history of a specific task; SPEC.md's "Completed work" index says which task number is which.
- **STAGING.md** — the production-safety, staging and inviting-users plan. Read it before anything that touches the database, deployment, or user accounts. Note its first finding: local dev currently points at the production Supabase project, so `npm run dev` reads and writes the user's real financial data.

## About the user
- Beginner coder with ~1 hour per day. Explain what you're doing in plain, non-technical language as you go.
- The user is the product owner: ask before making product or architecture decisions not covered by SPEC.md.

## Session workflow (always follow)
1. **At session start, and every time the user says "continue" (including after a usage-limit gap):**
   - Re-read REMINDER.md, SPEC.md, and this file before doing anything else - context may have changed since it was last loaded, and messages the user sent while a response was still generating can otherwise get silently lost.
   - Check REMINDER.md for pending items. Work through those first.
   - If a reminder item is substantial, ask the user whether to do it now or write it into SPEC.md first.
   - **Every single item gets documented somewhere - never silently drop one, even a duplicate.** If a reminder item turns out to already be covered by an existing SPEC.md task, note the cross-reference in the triage log rather than just discarding it - the user has explicitly said losing a note this way is the failure mode to avoid.
   - Once a reminder item is done or added to SPEC.md, remove it from REMINDER.md - never keep the same item listed in both files.
   - Check `git log`, the Roadmap checklists in SPEC.md, and BUGS.md (open bugs) to see where we left off.
   - **If the previous turn was cut off mid-task** (e.g. a usage limit reset): before continuing, write a short note of what was interrupted into SPEC.md (under the in-progress task, or REMINDER.md if it hadn't been specced yet) so the interruption itself is never lost - then tell the user plainly what was interrupted and what has changed since, before resuming the work itself.
2. **Pick the task:** work on exactly one task from SPEC.md per session unless told otherwise.
   - **Task order is non-negotiable: always the topmost unchecked (`- [ ]`) item in the Roadmap, top to bottom.**
   - Never skip ahead or cherry-pick a later task without the user explicitly saying so.
   - **When explicitly told to run the whole Roadmap uninterrupted** (the user's own standing loop, given 2026-08-01): work through roadmap tasks without stopping to ask → check REMINDER.md for anything new the user added mid-session → integrate any new content into SPEC.md/BUGS.md/this file, per the "every item gets documented" rule above → resume another pass of roadmap tasks → check REMINDER.md again → once a check finds nothing new, that's the natural stopping point. Executive judgment calls on anything ambiguous are expected in this mode, not a reason to stop and ask.
3. **Before writing code:** state a short plan (3-6 bullets) and wait for approval.
4. **After building:**
   - Run `npm run build` and `npm run test` yourself; fix failures before finishing.
   - The user never runs `npm run build` themselves - that's always Claude's job.
   - If a dev server is already running on :3000, stop it, run the build, then restart the dev server so the user isn't left without one.
5. **End every session** by committing with a clear message (e.g. `T5: engine monthly expansion + tests`) and checking off the task in SPEC.md.
6. **Tell the user** how to verify the result in the browser, in 1-2 steps.

## Hard rules
- Money = integer centavos (bigint). Never floats for money. Format only in the UI.
- Due dates = `YYYY-MM-DD` strings / Postgres `date`. Never UTC timestamps for due dates.
- The forecast engine (`src/lib/engine/`) stays pure: no imports from Supabase, Next.js, or fetch. It must keep 100% passing Vitest coverage of the cases listed in SPEC.md.
- Every table: `user_id` + owner-only RLS. Never query with the service-role key from the browser.
- Secrets live only in `.env.local` (gitignored). Never hardcode or commit keys. If a secret is needed, tell the user which value to paste and where.
- No new dependencies without asking. Stack is fixed in SPEC.md.
- **Supabase migrations, via MCP** (project "Orium", ref `fptpkrbfbtfhzxbtmgic`; staging project ref `gwvnqvampbztirzqjuaq` - see STAGING.md):
  - When the MCP connection is available, apply migrations and run SQL directly (`apply_migration`/`execute_sql`/etc.) instead of asking the user to paste into the SQL editor.
  - Migrations are still written as reviewed files in `supabase/migrations/` first - the file *is* the review step, committed and visible before it's applied.
  - State plainly what a migration will do before running it, especially anything destructive (dropping columns/tables).
  - Ad-hoc destructive SQL that isn't a committed migration file (drop/truncate/delete without a where clause) still needs the user's explicit go-ahead, same as any other hard-to-reverse action.
  - If MCP isn't available this session, fall back to proposing the SQL for the user to paste manually.
- **Back up before destructive migrations** (altering/dropping columns or tables) **when the database holds real data the user can't quickly recreate:**
  - Free tier has no managed backup feature (the dashboard's "Database > Backups" page is Pro-only) - use a manual `pg_dump` instead: `npx supabase db dump --db-url "<connection string>" -f orium-backup-YYYY-MM-DD.sql`.
  - Get the connection string from the project dashboard's **Connect** button (not Settings) > **Direct connection** (not a pooler) > copy the URI (`postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres`), then swap in the database password (resettable from Project Settings > Database).
  - Skip this step while the database only holds disposable test data - ask the user if unsure whether current data is real.
- Keep diffs small and focused on the current task. Don't refactor unrelated code.
- **Never use long em dashes (—) anywhere** - not in UI copy, seed/sample data, code comments, or commit messages. Use a plain hyphen `-` instead. (User rule, 2026-07-25/26; see SPEC.md's "Writing style" section and T113.)

## Commands
- `npm run dev` — local server at http://localhost:3000
- `npm run build` — production build check
- `npm run test` — Vitest (engine tests)

## Code style
- TypeScript strict; no `any` unless unavoidable and commented.
- Small components; shared form/modal components in `src/components/`.
- Server-side data access via Supabase server client per `@supabase/ssr` patterns; client components only where interactivity requires it.
- Tailwind for all styling; match the clean, minimal look described in SPEC.md (white cards, slate background, type colors: income green, debt orange, savings blue, extra purple).
