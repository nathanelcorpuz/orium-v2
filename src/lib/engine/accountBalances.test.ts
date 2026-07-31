import { describe, expect, it } from "vitest";
import { findAccountLowestPoints } from "./accountBalances";
import type { ForecastRow } from "./types";

function row(
  dueDate: string,
  amount: number,
  opts: { balanceId?: string; feeAmount?: number } = {},
): ForecastRow {
  return {
    sourceType: "recurring",
    sourceId: "item-1",
    originalDate: dueDate,
    name: "Test",
    amount,
    dueDate,
    type: "bill",
    runningBalance: 0,
    balanceId: opts.balanceId,
    feeAmount: opts.feeAmount,
  };
}

const accounts = [
  { id: "a", amount: 100000 },
  { id: "b", amount: 50000 },
];

describe("findAccountLowestPoints", () => {
  it("seeds every account's lowest point at its own starting balance/today when there are no rows", () => {
    const result = findAccountLowestPoints([], accounts, "2026-01-01");
    expect(result.get("a")).toEqual({ balance: 100000, date: "2026-01-01" });
    expect(result.get("b")).toEqual({ balance: 50000, date: "2026-01-01" });
  });

  it("applies a connected row only to its own account, leaving the other untouched", () => {
    const rows = [row("2026-01-05", -80000, { balanceId: "a" })];
    const result = findAccountLowestPoints(rows, accounts, "2026-01-01");
    expect(result.get("a")).toEqual({ balance: 20000, date: "2026-01-05" });
    expect(result.get("b")).toEqual({ balance: 50000, date: "2026-01-01" });
  });

  it("attributes an unlinked row to whichever account currently holds the highest balance", () => {
    // "a" starts highest (100000 > 50000), so the unlinked row lands there.
    const rows = [row("2026-01-05", -10000)];
    const result = findAccountLowestPoints(rows, accounts, "2026-01-01");
    expect(result.get("a")).toEqual({ balance: 90000, date: "2026-01-05" });
    expect(result.get("b")).toEqual({ balance: 50000, date: "2026-01-01" });
  });

  it("re-evaluates which account is highest after each row, following the money as it shifts", () => {
    const rows = [
      // Knocks "a" down below "b" (100000 -> 30000), so the next unlinked
      // row should land on "b" (still at 50000), not "a" again.
      row("2026-01-05", -70000, { balanceId: "a" }),
      row("2026-01-10", -5000),
    ];
    const result = findAccountLowestPoints(rows, accounts, "2026-01-01");
    expect(result.get("a")).toEqual({ balance: 30000, date: "2026-01-05" });
    expect(result.get("b")).toEqual({ balance: 45000, date: "2026-01-10" });
  });

  it("subtracts a connected account's own transaction fee regardless of the row's sign", () => {
    const rows = [row("2026-01-05", 20000, { balanceId: "a", feeAmount: 500 })];
    const result = findAccountLowestPoints(rows, accounts, "2026-01-01");
    // +20000 income, then -500 fee = +19500 net, same convention forecast.ts uses.
    expect(result.get("a")).toEqual({ balance: 100000, date: "2026-01-01" });
  });

  it("tracks the true lowest point across several rows, not just the last one", () => {
    const rows = [
      row("2026-01-05", -80000, { balanceId: "a" }), // 100000 -> 20000, the actual lowest
      row("2026-02-01", 30000, { balanceId: "a" }), // 20000 -> 50000, recovers afterward
    ];
    const result = findAccountLowestPoints(rows, accounts, "2026-01-01");
    expect(result.get("a")).toEqual({ balance: 20000, date: "2026-01-05" });
  });

  it("ignores an unknown balanceId (falls back to the highest-balance account)", () => {
    const rows = [row("2026-01-05", -10000, { balanceId: "does-not-exist" })];
    const result = findAccountLowestPoints(rows, accounts, "2026-01-01");
    expect(result.get("a")).toEqual({ balance: 90000, date: "2026-01-05" });
  });

  it("returns an empty map when there are no tracked accounts at all", () => {
    const rows = [row("2026-01-05", -10000)];
    const result = findAccountLowestPoints(rows, [], "2026-01-01");
    expect(result.size).toBe(0);
  });
});
