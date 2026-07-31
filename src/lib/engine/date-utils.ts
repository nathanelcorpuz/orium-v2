export function daysInMonth(year: number, month: number): number {
  // Date.UTC's day-0 trick returns the last day of the *previous* month,
  // so passing `month` (1-indexed) gives the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addYears(dateStr: string, years: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// T85 (SPEC.md), raised 5 -> 50 by T171 (user's own final decision,
// 2026-07-31, superseding T146's "keep 5" and the unscoped "raise to 25"
// discussion that preceded it - see SPEC.md's Roadmap): the cap on how far
// into the future anything can be tracked or scheduled - shared by the
// forecast horizon (forecastData.ts) and recurrence/one-off end-date
// validation (recurrenceForm.ts, misc/actions.ts) so both stay in sync.
// `recurrence.ts`'s MAX_PERIODS is derived from this constant specifically
// so a daily-recurring rule can still reach the full horizon rather than
// silently truncating partway - see that file's comment.
export const MAX_TRACKING_YEARS = 50;

export function daysBetween(a: string, b: string): number {
  const toUTC = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

// Days beyond a month's length (e.g. day 31 in April, day 29-31 in
// February) clamp to that month's last day.
export function clampDayOfMonth(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}
