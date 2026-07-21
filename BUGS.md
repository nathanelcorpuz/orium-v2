# BUGS.md — Orium bug tracker

Format per bug: steps to reproduce → what happened → what was expected. Claude Code: when fixing, add a test (or a manual verification note), move the bug to Fixed with the commit reference.

## Open

### Bug #2 — Greeting name wrong by default
- **Reproduce**: log in with an account that has no profile name set; view Dashboard greeting.
- **What happened**: greeting doesn't show a sensible name.
- **Expected**: show profile name when set; otherwise the email's local part (before `@`). Example: `juan.lopez@gmail.com` → "Hello, juan.lopez." Definition: SPEC2.md → T23.

## Fixed

### Bug #1 — Total Monthly Income uses fractional weekly math
- **Reproduce**: add a weekly income of ₱20,000; open Dashboard or Income page.
- **What happened**: Total Monthly Income showed ₱86,666.7 (20,000 × 52 ÷ 12), with a decimal.
- **Expected**: ₱80,000 — weekly items count ×4 per month.
- **Fixed by**: `monthlyEquivalent()` in `src/lib/engine/monthlyTotals.ts`, integer multipliers (monthly ×1, weekly ×4, biweekly ×2, semi_monthly_15_30 ×2), covered by Vitest in `monthlyTotals.test.ts`. See SPEC2.md → T22.
