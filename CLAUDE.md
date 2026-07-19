# CLAUDE.md — Orium project instructions

## About this project
Orium is a family cash-flow forecasting app (Next.js + Supabase). The full product definition, data model, engine rules, and task list live in **SPEC.md — read it before doing anything.**

## About the user
- Beginner coder with ~1 hour per day. Explain what you're doing in plain, non-technical language as you go.
- The user is the product owner: ask before making product or architecture decisions not covered by SPEC.md.

## Session workflow (always follow)
1. At session start, check `git log` and the Phase checklists in SPEC.md to see where we left off.
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
