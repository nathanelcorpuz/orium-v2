import { describe, expect, it } from "vitest";
import { monthlyEquivalent } from "./monthlyTotals";

describe("monthlyEquivalent", () => {
  it("monthly items count once", () => {
    expect(monthlyEquivalent({ amount: 500000, frequency: "monthly" })).toBe(500000);
  });

  it("weekly items count x4 (never 52/12)", () => {
    expect(monthlyEquivalent({ amount: 2000000, frequency: "weekly" })).toBe(8000000);
  });

  it("biweekly items count x2 (never 26/12)", () => {
    expect(monthlyEquivalent({ amount: 2000000, frequency: "biweekly" })).toBe(4000000);
  });

  it("semi_monthly_15_30 items count x2", () => {
    expect(monthlyEquivalent({ amount: 1000000, frequency: "semi_monthly_15_30" })).toBe(2000000);
  });

  it("stays integer centavos for amounts that would produce a decimal under fractional math", () => {
    const result = monthlyEquivalent({ amount: 2000000, frequency: "weekly" });
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(8000000);
  });

  it("preserves sign for negative (bill/debt/savings) amounts", () => {
    expect(monthlyEquivalent({ amount: -150000, frequency: "monthly" })).toBe(-150000);
  });
});

describe("monthlyEquivalent - generalized formula (T34), items with the new recurrence columns", () => {
  it("day: 30/interval - daily bill counts x30", () => {
    expect(
      monthlyEquivalent({ amount: -10000, frequency: "monthly", interval: 1, unit: "day" }),
    ).toBe(-300000);
  });

  it("day: every-3-days counts x10 (30/3)", () => {
    expect(
      monthlyEquivalent({ amount: 10000, frequency: "monthly", interval: 3, unit: "day" }),
    ).toBe(100000);
  });

  it("week: reproduces the old weekly preset (x4) via (4*1)/1", () => {
    expect(
      monthlyEquivalent({
        amount: 2000000,
        frequency: "monthly",
        interval: 1,
        unit: "week",
        weekdays: [5],
      }),
    ).toBe(8000000);
  });

  it("week: reproduces the old biweekly preset (x2) via (4*1)/2", () => {
    expect(
      monthlyEquivalent({
        amount: 2000000,
        frequency: "monthly",
        interval: 2,
        unit: "week",
        weekdays: [5],
      }),
    ).toBe(4000000);
  });

  it("week: every-2-weeks on two weekdays counts x4 (4*2/2)", () => {
    expect(
      monthlyEquivalent({
        amount: 100000,
        frequency: "monthly",
        interval: 2,
        unit: "week",
        weekdays: [1, 4],
      }),
    ).toBe(400000);
  });

  it("month: reproduces the old semi-monthly preset (x2) via len([15,30])/1", () => {
    expect(
      monthlyEquivalent({
        amount: 1000000,
        frequency: "monthly",
        interval: 1,
        unit: "month",
        daysOfMonth: [15, 30],
      }),
    ).toBe(2000000);
  });

  it("month: reproduces the old monthly preset (x1) via len([d])/1", () => {
    expect(
      monthlyEquivalent({
        amount: 500000,
        frequency: "monthly",
        interval: 1,
        unit: "month",
        daysOfMonth: [1],
      }),
    ).toBe(500000);
  });

  it("month: an nth-weekday (ordinal) rule counts x1 via the 'or 1' fallback", () => {
    expect(
      monthlyEquivalent({
        amount: -300000,
        frequency: "monthly",
        interval: 1,
        unit: "month",
        daysOfMonth: null,
      }),
    ).toBe(-300000);
  });

  it("month: interval-3 (quarterly) rounds down toward 0 (1/3 rounds to 0)", () => {
    expect(
      monthlyEquivalent({
        amount: -900000,
        frequency: "monthly",
        interval: 3,
        unit: "month",
        daysOfMonth: [1],
      }),
    ).toBe(0);
  });

  it("year: an annual item rounds to 0 per month (1/12)", () => {
    expect(
      monthlyEquivalent({ amount: -1200000, frequency: "monthly", interval: 1, unit: "year" }),
    ).toBe(0);
  });

  it("stays integer centavos under the generalized formula", () => {
    const result = monthlyEquivalent({
      amount: 333333,
      frequency: "monthly",
      interval: 1,
      unit: "week",
      weekdays: [2, 4],
    });
    expect(Number.isInteger(result)).toBe(true);
  });

  it("falls back to the legacy preset table when the new columns are absent (e.g. IncomeRow)", () => {
    // No interval/unit at all - matches the shape of pages still on the
    // pre-T35 CRUD forms.
    expect(monthlyEquivalent({ amount: 2000000, frequency: "weekly" })).toBe(8000000);
  });
});
