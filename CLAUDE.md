# CLAUDE.md — Orium project instructions

## About this project
Orium is a family cash-flow forecasting app (Next.js + Supabase). The full product definition, data model, engine rules, and task list live in **SPEC.md — read it before doing anything.** Phases 5–7 (bug fixes, budgets, redesign) are defined in **SPEC2.md**. Active bugs are tracked in **BUGS.md** — read both before starting work.

## About the user
- Beginner coder with ~1 hour per day. Explain what you're doing in plain, non-technical language as you go.
- The user is the product owner: ask before making product or architecture decisions not covered by SPEC.md.

## Session workflow (always follow)
1. At session start, check `git log` and the Phase checklists in SPEC.md and SPEC2.md (and BUGS.md for open bugs) to see where we left off.
2. Work on **exactly one task** from SPEC.md per session unless told otherwise.
3. Before writing code, state a short plan (3–6 bullets) and wait for approval.
4. After building: run `npm run build` and `npm run test`; fix failures before finishing.
5. End every session by committing with a clear message (e.g. `T5: engine monthly expansion + tests`) and updating the task checkbox in SPEC.md.
6. Tell the user how to verify the result in the browser in 1–2 steps.

## Hard rules
- Money = integer centavos (bigint). Never floats for money. Format only in the UI.
- Due dates = `YYYY-MM-DD` strings / Postgres `date`. Never UTC timestamps for due dates.
- The forecast engine (`src/lib/engine/`) stays pure: no imports from Supabase, Next.js, or fetch. It must keep 100% passing Vitest coverage of the cases listed in SPEC.md.
- Every table: `user_id` + owner-only RLS. Never query with the service-role key from the browser.
- Secrets live only in `.env.local` (gitignored). Never hardcode or commit keys. If a secret is needed, tell the user which value to paste and where.
- No new dependencies without asking. Stack is fixed in SPEC.md.
- Never run destructive DB commands (drop/truncate/delete without where) — propose SQL for the user to review instead.
- Before any migration that alters or drops columns/tables **and the database holds real data the user can't quickly recreate**, back up first. The Supabase dashboard's "Database > Backups" page is Pro-plan only — this project is on the free tier, which has no managed backup feature. Use a manual `pg_dump` via the Supabase CLI instead (works on any plan, no new project dependency since it runs through `npx`): `npx supabase db dump --db-url "<connection string>" -f orium-backup-YYYY-MM-DD.sql`. To get the connection string: on the project dashboard (not Settings), click the **Connect** button near the top of the page, then pick **Direct connection** (not a pooler) and copy the URI — it looks like `postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres`. Swap in the database password (set at project creation; resettable from Project Settings > Database if forgotten). While the database only holds disposable test data, skip this step — ask the user if unsure whether current data is real.
- Keep diffs small and focused on the current task. Don't refactor unrelated code.

## Commands
- `npm run dev` — local server at http://localhost:3000
- `npm run build` — production build check
- `npm run test` — Vitest (engine tests)

## Code style
- TypeScript strict; no `any` unless unavoidable and commented.
- Small components; shared form/modal components in `src/components/`.
- Server-side data access via Supabase server client per `@supabase/ssr` patterns; client components only where interactivity requires it.
- Tailwind for all styling; match the clean, minimal look described in SPEC.md (white cards, slate background, type colors: income green, debt orange, savings blue, extra purple).
