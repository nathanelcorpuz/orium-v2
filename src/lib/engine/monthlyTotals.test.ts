import { describe, expect, it } from "vitest";
import { monthlyEquivalent } from "./monthlyTotals";

describe("monthlyEquivalent", () => {
  it("day: 30/interval - daily bill counts x30", () => {
    expect(
      monthlyEquivalent({ amount: -10000, interval: 1, unit: "day", weekdays: null, daysOfMonth: null }),
    ).toBe(-300000);
  });

  it("day: every-3-days counts x10 (30/3)", () => {
    expect(
      monthlyEquivalent({ amount: 10000, interval: 3, unit: "day", weekdays: null, daysOfMonth: null }),
    ).toBe(100000);
  });

  it("week: a single weekly weekday counts x4 (4*1/1, never 52/12)", () => {
    expect(
      monthlyEquivalent({
        amount: 2000000,
        interval: 1,
        unit: "week",
        weekdays: [5],
        daysOfMonth: null,
      }),
    ).toBe(8000000);
  });

  it("week: every-2-weeks on one weekday counts x2 (4*1/2, never 26/12)", () => {
    expect(
      monthlyEquivalent({
        amount: 2000000,
        interval: 2,
        unit: "week",
        weekdays: [5],
        daysOfMonth: null,
      }),
    ).toBe(4000000);
  });

  it("week: every-2-weeks on two weekdays counts x4 (4*2/2)", () => {
    expect(
      monthlyEquivalent({
        amount: 100000,
        interval: 2,
        unit: "week",
        weekdays: [1, 4],
        daysOfMonth: null,
      }),
    ).toBe(400000);
  });

  it("month: two days (e.g. 15th and 30th) counts x2 via len([15,30])/1", () => {
    expect(
      monthlyEquivalent({
        amount: 1000000,
        interval: 1,
        unit: "month",
        weekdays: null,
        daysOfMonth: [15, 30],
      }),
    ).toBe(2000000);
  });

  it("month: a single day counts x1 via len([d])/1", () => {
    expect(
      monthlyEquivalent({
        amount: 500000,
        interval: 1,
        unit: "month",
        weekdays: null,
        daysOfMonth: [1],
      }),
    ).toBe(500000);
  });

  it("month: an nth-weekday (ordinal) rule counts x1 via the 'or 1' fallback", () => {
    expect(
      monthlyEquivalent({
        amount: -300000,
        interval: 1,
        unit: "month",
        weekdays: null,
        daysOfMonth: null,
      }),
    ).toBe(-300000);
  });

  it("month: interval-3 (quarterly) rounds down toward 0 (1/3 rounds to 0)", () => {
    expect(
      monthlyEquivalent({
        amount: -900000,
        interval: 3,
        unit: "month",
        weekdays: null,
        daysOfMonth: [1],
      }),
    ).toBe(0);
  });

  it("year: an annual item rounds to 0 per month (1/12)", () => {
    expect(
      monthlyEquivalent({ amount: -1200000, interval: 1, unit: "year", weekdays: null, daysOfMonth: null }),
    ).toBe(0);
  });

  it("stays integer centavos for amounts that would produce a decimal under fractional math", () => {
    const result = monthlyEquivalent({
      amount: 333333,
      interval: 1,
      unit: "week",
      weekdays: [2, 4],
      daysOfMonth: null,
    });
    expect(Number.isInteger(result)).toBe(true);
  });

  it("preserves sign for negative (bill/debt/savings) amounts", () => {
    expect(
      monthlyEquivalent({ amount: -150000, interval: 1, unit: "month", weekdays: null, daysOfMonth: [1] }),
    ).toBe(-150000);
  });
});
