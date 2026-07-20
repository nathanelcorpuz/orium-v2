import { describe, expect, it } from "vitest";
import { expandBiweeklyOccurrences, expandWeeklyOccurrences } from "./interval";

describe("expandWeeklyOccurrences", () => {
  it("generates occurrences every 7 days anchored on start_date", () => {
    const dates = expandWeeklyOccurrences(
      { startDate: "2026-01-07", endDate: "2026-12-31" },
      "2026-01-01",
      "2026-02-01",
    );
    expect(dates).toEqual(["2026-01-07", "2026-01-14", "2026-01-21", "2026-01-28"]);
  });

  it("skips ahead to the first occurrence within the window without breaking the anchor", () => {
    const dates = expandWeeklyOccurrences(
      { startDate: "2026-01-01", endDate: "2026-12-31" },
      "2026-02-10",
      "2026-02-28",
    );
    // Anchored occurrences fall on Jan 1, 8, 15, 22, 29, Feb 5, 12, 19, 26...
    expect(dates).toEqual(["2026-02-12", "2026-02-19", "2026-02-26"]);
  });

  it("delays occurrences until the item's own start_date", () => {
    const dates = expandWeeklyOccurrences(
      { startDate: "2026-03-15", endDate: "2026-12-31" },
      "2026-01-01",
      "2026-04-01",
    );
    expect(dates).toEqual(["2026-03-15", "2026-03-22", "2026-03-29"]);
  });

  it("cuts off occurrences after the item's own end_date", () => {
    const dates = expandWeeklyOccurrences(
      { startDate: "2026-01-01", endDate: "2026-01-15" },
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
  });
});

describe("expandBiweeklyOccurrences", () => {
  it("generates occurrences every 14 days anchored mid-week across a month boundary", () => {
    // start_date is a Wednesday; window spans January into February.
    const dates = expandBiweeklyOccurrences(
      { startDate: "2026-01-14", endDate: "2026-12-31" },
      "2026-01-01",
      "2026-02-28",
    );
    expect(dates).toEqual(["2026-01-14", "2026-01-28", "2026-02-11", "2026-02-25"]);
  });

  it("skips ahead to the first occurrence within the window on the interval grid", () => {
    const dates = expandBiweeklyOccurrences(
      { startDate: "2026-01-01", endDate: "2026-12-31" },
      "2026-02-01",
      "2026-02-28",
    );
    // Anchored occurrences: Jan 1, 15, 29, Feb 12, 26...
    expect(dates).toEqual(["2026-02-12", "2026-02-26"]);
  });

  it("returns an empty array when the item's range never overlaps the window", () => {
    const dates = expandBiweeklyOccurrences(
      { startDate: "2020-01-01", endDate: "2020-12-31" },
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual([]);
  });
});
