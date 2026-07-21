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
