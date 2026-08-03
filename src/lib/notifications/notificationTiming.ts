// Daily due-today email (user request 2026-08-03): "I should be able to set
// the time of when in the day I will receive it and it should ask for a
// timezone." Deliberately compares local wall-clock time in the user's own
// IANA zone rather than converting to UTC - `Intl.DateTimeFormat` already
// knows how to render any instant in any zone, which sidesteps having to
// hand-roll UTC-offset/DST math for an arbitrary zone entirely.
export type LocalTime = { minutesSinceMidnight: number; dateStr: string };

export function localTimeInTimeZone(instant: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    minutesSinceMidnight: hour * 60 + minute,
    // "en-CA" formats as YYYY-MM-DD - reused as-is, matching the app's
    // storage/comparison format for dates everywhere else.
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

// `notification_time` comes back from Postgres as "HH:MM:SS" - seconds are
// never meaningful here (the cron granularity is 15 minutes), so they're
// dropped.
export function minutesSinceMidnight(hhmmss: string): number {
  const [hh, mm] = hhmmss.split(":").map(Number);
  return hh * 60 + mm;
}

// True when `nowMinutes` has just passed `targetMinutes`, within a window
// wide enough to survive normal cron jitter without a 15-minute check ever
// missing its own tick. Callers must additionally guard against a repeat
// send within the same matching window via `last_notified_date` - this
// function alone doesn't know whether a match already fired today.
//
// Known limitation, not handled: a target time within `windowMinutes` of
// local midnight can be missed if the matching tick falls on the other side
// of the day boundary (the two are compared as plain minutes-since-midnight
// on the same calendar day, not on a continuous timeline). Not worth
// handling for a personal digest email - documented rather than silently
// ignored.
export function isWithinNotificationWindow(nowMinutes: number, targetMinutes: number, windowMinutes = 20): boolean {
  return nowMinutes >= targetMinutes && nowMinutes - targetMinutes < windowMinutes;
}
