// Hosting can run the server in UTC while users are in the Philippines, so
// computing "today" from the server's local clock (or new Date().toISOString())
// can be off by a day. Always resolve "today" in the app's target timezone.
export function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

// Human-readable date formatting (SPEC.md Phase 7 "Date display format") -
// storage/computation stays YYYY-MM-DD everywhere per the core design rules;
// these are purely for display. Shared here so recurrenceSummary.ts and
// every Phase 7 page reuse one implementation instead of duplicating it.
export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "2025-06-01" -> "Jun 1, 2025"
export function formatFullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${MONTH_ABBR[month - 1]} ${day}, ${year}`;
}

// "2025-06-01" -> "Jun 2025"
export function formatMonthYear(dateStr: string): string {
  const [year, month] = dateStr.split("-").map(Number);
  return `${MONTH_ABBR[month - 1]} ${year}`;
}
