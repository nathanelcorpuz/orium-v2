// Hosting can run the server in UTC while users are in the Philippines, so
// computing "today" from the server's local clock (or new Date().toISOString())
// can be off by a day. Always resolve "today" in the app's target timezone.
export function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}
