import { describe, expect, it } from "vitest";
import { isWithinNotificationWindow, localTimeInTimeZone, minutesSinceMidnight } from "./notificationTiming";

describe("localTimeInTimeZone", () => {
  it("reads the correct local hour/minute/date for a timezone ahead of UTC", () => {
    // 2026-08-03T23:30:00Z is 2026-08-04 07:30 in Asia/Manila (UTC+8).
    const result = localTimeInTimeZone(new Date("2026-08-03T23:30:00Z"), "Asia/Manila");
    expect(result).toEqual({ minutesSinceMidnight: 7 * 60 + 30, dateStr: "2026-08-04" });
  });

  it("reads the correct local hour/minute/date for a timezone behind UTC", () => {
    // 2026-08-03T05:15:00Z is 2026-08-02 22:15 in America/Los_Angeles (UTC-7 in August, DST).
    const result = localTimeInTimeZone(new Date("2026-08-03T05:15:00Z"), "America/Los_Angeles");
    expect(result).toEqual({ minutesSinceMidnight: 22 * 60 + 15, dateStr: "2026-08-02" });
  });
});

describe("minutesSinceMidnight", () => {
  it("parses HH:MM:SS from Postgres, ignoring seconds", () => {
    expect(minutesSinceMidnight("08:00:00")).toBe(480);
    expect(minutesSinceMidnight("23:45:59")).toBe(23 * 60 + 45);
    expect(minutesSinceMidnight("00:00:00")).toBe(0);
  });
});

describe("isWithinNotificationWindow", () => {
  it("matches exactly at the target time", () => {
    expect(isWithinNotificationWindow(480, 480)).toBe(true);
  });

  it("matches shortly after the target time, within the window", () => {
    expect(isWithinNotificationWindow(495, 480)).toBe(true);
  });

  it("does not match before the target time", () => {
    expect(isWithinNotificationWindow(470, 480)).toBe(false);
  });

  it("does not match once the window has passed", () => {
    expect(isWithinNotificationWindow(501, 480, 20)).toBe(false);
  });

  it("respects a custom window size", () => {
    expect(isWithinNotificationWindow(484, 480, 5)).toBe(true);
    expect(isWithinNotificationWindow(485, 480, 5)).toBe(false);
  });
});
