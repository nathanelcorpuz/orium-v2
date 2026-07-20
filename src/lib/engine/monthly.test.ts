import { describe, expect, it } from "vitest";
import { expandMonthlyOccurrences } from "./monthly";

describe("expandMonthlyOccurrences", () => {
  it("clamps day 31 to the last day of shorter months (Feb/Apr)", () => {
    const dates = expandMonthlyOccurrences(
      { dayOfMonth: 31, startDate: "2026-01-01", endDate: "2026-12-31" },
      "2026-01-01",
      "2026-04-30",
    );
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("clamps to Feb 29 in a leap year", () => {
    const dates = expandMonthlyOccurrences(
      { dayOfMonth: 31, startDate: "2028-02-01", endDate: "2028-02-29" },
      "2028-02-01",
      "2028-02-29",
    );
    expect(dates).toEqual(["2028-02-29"]);
  });

  it("clamps to Feb 28 in a non-leap year", () => {
    const dates = expandMonthlyOccurrences(
      { dayOfMonth: 31, startDate: "2026-02-01", endDate: "2026-02-28" },
      "2026-02-01",
      "2026-02-28",
    );
    expect(dates).toEqual(["2026-02-28"]);
  });

  it("delays occurrences until the item's own start_date", () => {
    const dates = expandMonthlyOccurrences(
      { dayOfMonth: 15, startDate: "2026-03-01", endDate: "2026-12-31" },
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual([
      "2026-03-15",
      "2026-04-15",
      "2026-05-15",
      "2026-06-15",
      "2026-07-15",
      "2026-08-15",
      "2026-09-15",
      "2026-10-15",
      "2026-11-15",
      "2026-12-15",
    ]);
  });

  it("cuts off occurrences after the item's own end_date", () => {
    const dates = expandMonthlyOccurrences(
      { dayOfMonth: 15, startDate: "2026-01-01", endDate: "2026-03-31" },
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);
  });

  it("is bounded by the forecast window, not just the item's dates", () => {
    const dates = expandMonthlyOccurrences(
      { dayOfMonth: 10, startDate: "2020-01-01", endDate: "2030-12-31" },
      "2026-06-01",
      "2026-06-30",
    );
    expect(dates).toEqual(["2026-06-10"]);
  });

  it("returns an empty array when dayOfMonth is null", () => {
    const dates = expandMonthlyOccurrences(
      { dayOfMonth: null, startDate: "2026-01-01", endDate: "2026-12-31" },
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual([]);
  });

  it("returns an empty array when the item's range never overlaps the window", () => {
    const dates = expandMonthlyOccurrences(
      { dayOfMonth: 1, startDate: "2020-01-01", endDate: "2020-12-31" },
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual([]);
  });
});
