import { describe, expect, it } from "vitest";
import { splitAmountByShares } from "./budgetSplit";

describe("splitAmountByShares", () => {
  it("returns nothing for no accounts", () => {
    expect(splitAmountByShares(10000, [])).toEqual([]);
  });

  it("gives the whole amount to a single account", () => {
    expect(splitAmountByShares(10000, [500])).toEqual([10000]);
  });

  it("splits proportional to configured shares", () => {
    // 300/1300 and 1000/1300 of 4000 - matches the user's own example
    // (GCash Tatay 300, Cash Tatay 1000).
    expect(splitAmountByShares(1300, [300, 1000])).toEqual([300, 1000]);
  });

  it("floors and gives the rounding remainder to the last account", () => {
    // 100 split 1:1:1 -> 33, 33, 34 (sums to 100 exactly).
    expect(splitAmountByShares(100, [1, 1, 1])).toEqual([33, 33, 34]);
  });

  it("splits evenly when every configured share is 0", () => {
    expect(splitAmountByShares(100, [0, 0])).toEqual([50, 50]);
    expect(splitAmountByShares(100, [0, 0, 0])).toEqual([33, 33, 34]);
  });

  it("handles a zero total", () => {
    expect(splitAmountByShares(0, [300, 1000])).toEqual([0, 0]);
  });
});
