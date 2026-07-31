# REMINDER.md

Scratchpad for things raised between sessions. Write anything here, in any shape - it does not need to be a well-formed task.

**How this file works** (per CLAUDE.md's session workflow): at the start of a session, everything here is triaged into its proper home - SPEC.md for scoped tasks and product decisions, BUGS.md for defects, a standalone document for anything bigger - and then **removed from this file**. SPEC.md is the record; this file is the inbox. Git history has every previous version if an old note needs looking up.

---

## Pending

(nothing - inbox is empty)

---

## Last triage

- **2026-08-01**: 18 items → **T177-T188** (SPEC.md Phase 23, now done - see ARCHIVE.md). One was a false alarm: "leftover sample data in production" (originally T170) turned out to be a cross-account query bug mixing the real account with throwaway QA test accounts - corrected in SPEC.md (T151's real figure was ₱2,000, not ₱26,000), not a real task. The Supabase service-role key for the new Orium Staging project was provided directly and saved to `.env.local` - not a task, just closing STAGING.md's one open manual step.

---

## Prior triage (condensed - full history in git log and SPEC.md's ARCHIVE.md)

- **2026-07-31, second pass**: 6 items → **T171-T176** (SPEC.md Phase 22).
- **2026-07-31, first pass**: 30 items → 4 became bugs (**Bug #11-#14 / T150-T153**), 11 became tasks (**T154-T164**), 4 became **Phase 21** (**T165-T168**, mostly already built), 1 became **STAGING.md**, 3 became standing decisions in SPEC.md's "Before MVP launch", 2 were already-shipped commits documented retroactively (**T148**, **T149**).
