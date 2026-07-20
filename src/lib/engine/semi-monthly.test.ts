import { describe, expect, it } from "vitest";
import { expandSemiMonthlyOccurrences } from "./semi-monthly";

describe("expandSemiMonthlyOccurrences", () => {
  it("generates the 15th and 30th of each ordinary month", () => {
    const dates = expandSemiMonthlyOccurrences(
      { startDate: "2026-01-01", endDate: "2026-12-31" },
      "2026-01-01",
      "2026-03-31",
    );
    expect(dates).toEqual([
      "2026-01-15",
      "2026-01-30",
      "2026-02-15",
      "2026-02-28",
      "2026-03-15",
      "2026-03-30",
    ]);
  });

  it("uses Feb 28 for the second occurrence in a non-leap year", () => {
    const dates = expandSemiMonthlyOccurrences(
      { startDate: "2026-02-01", endDate: "2026-02-28" },
      "2026-02-01",
      "2026-02-28",
    );
    expect(dates).toEqual(["2026-02-15", "2026-02-28"]);
  });

  it("uses Feb 29 for the second occurrence in a leap year", () => {
    const dates = expandSemiMonthlyOccurrences(
      { startDate: "2028-02-01", endDate: "2028-02-29" },
      "2028-02-01",
      "2028-02-29",
    );
    expect(dates).toEqual(["2028-02-15", "2028-02-29"]);
  });

  it("delays occurrences until the item's own start_date", () => {
    const dates = expandSemiMonthlyOccurrences(
      { startDate: "2026-01-20", endDate: "2026-12-31" },
      "2026-01-01",
      "2026-02-28",
    );
    expect(dates).toEqual(["2026-01-30", "2026-02-15", "2026-02-28"]);
  });

  it("cuts off occurrences after the item's own end_date", () => {
    const dates = expandSemiMonthlyOccurrences(
      { startDate: "2026-01-01", endDate: "2026-01-20" },
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-01-15"]);
  });

  it("is bounded by the forecast window, not just the item's dates", () => {
    const dates = expandSemiMonthlyOccurrences(
      { startDate: "2020-01-01", endDate: "2030-12-31" },
      "2026-06-01",
      "2026-06-30",
    );
    expect(dates).toEqual(["2026-06-15", "2026-06-30"]);
  });

  it("returns an empty array when the item's range never overlaps the window", () => {
    const dates = expandSemiMonthlyOccurrences(
      { startDate: "2020-01-01", endDate: "2020-12-31" },
      "2026-01-01",
      "2026-12-31",
    );
    expect(dates).toEqual([]);
  });
});
