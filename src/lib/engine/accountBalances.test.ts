import { describe, expect, it } from "vitest";
import { accountBalanceForRow, computeAccountBalancesAfterEachRow, findAccountLowestPoints } from "./accountBalances";
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

describe("computeAccountBalancesAfterEachRow / accountBalanceForRow", () => {
  it("records the connected account's own balance immediately after each of its rows, leaving the other account untouched", () => {
    const rowA1 = row("2026-01-05", -80000, { balanceId: "a" });
    const rowA2 = row("2026-01-10", 20000, { balanceId: "a" });
    const timeline = computeAccountBalancesAfterEachRow([rowA1, rowA2], accounts);
    expect(accountBalanceForRow(rowA1, timeline)).toBe(20000);
    expect(accountBalanceForRow(rowA2, timeline)).toBe(40000);
  });

  it("subtracts the connected account's own fee before recording the balance", () => {
    const target = row("2026-01-05", 20000, { balanceId: "a", feeAmount: 500 });
    const timeline = computeAccountBalancesAfterEachRow([target], accounts);
    expect(accountBalanceForRow(target, timeline)).toBe(119500);
  });

  it("returns null for a row with no connected account at all", () => {
    const unlinked = row("2026-01-05", -10000);
    const timeline = computeAccountBalancesAfterEachRow([unlinked], accounts);
    // Still attributed internally (to the highest-balance account, same
    // fallback as findAccountLowestPoints), but this feature only answers
    // "what will *this row's own* connected account hold" - a row with no
    // connection of its own has nothing to report.
    expect(accountBalanceForRow(unlinked, timeline)).toBeNull();
  });

  it("returns null when the row's balanceId no longer matches a tracked account", () => {
    const stale = row("2026-01-05", -10000, { balanceId: "does-not-exist" });
    const timeline = computeAccountBalancesAfterEachRow([stale], accounts);
    // Falls back to the highest-balance account internally, but that isn't
    // the account this row claims to be connected to - showing it would be
    // misleading, so this reports null rather than someone else's balance.
    expect(accountBalanceForRow(stale, timeline)).toBeNull();
  });

  it("returns null for a row the timeline was never computed over", () => {
    const known = row("2026-01-05", -10000, { balanceId: "a" });
    const unknown = row("2026-01-06", -10000, { balanceId: "a" });
    const timeline = computeAccountBalancesAfterEachRow([known], accounts);
    expect(accountBalanceForRow(unknown, timeline)).toBeNull();
  });

  it("nets a same-occurrence income_auto_move debit leg into the income row's own snapshot, even though the debit leg sorts after it", () => {
    // Reproduces the reported case exactly: an income auto-moves its entire
    // amount to another account on the same day - the source account's own
    // "balance after this income" should already reflect the transfer,
    // not the pre-transfer figure the sort order would otherwise expose.
    const income: ForecastRow = {
      sourceType: "recurring",
      sourceId: "income-1",
      originalDate: "2026-08-31",
      name: "Nanay - HH",
      amount: 4400000,
      dueDate: "2026-08-31",
      type: "income",
      runningBalance: 0,
      balanceId: "a",
    };
    const autoMoveDebit: ForecastRow = {
      sourceType: "income_auto_move",
      sourceId: "move-1",
      originalDate: "2026-08-31",
      name: "Auto-move to b",
      amount: -4400000,
      dueDate: "2026-08-31",
      type: "auto_move",
      runningBalance: 0,
      balanceId: "a",
      linkedIncomeId: "income-1",
      hidden: true,
    };
    const autoMoveCredit: ForecastRow = {
      sourceType: "income_auto_move",
      sourceId: "move-1",
      originalDate: "2026-08-31",
      name: "Auto-move from a",
      amount: 4400000,
      dueDate: "2026-08-31",
      type: "auto_move",
      runningBalance: 0,
      balanceId: "b",
      linkedIncomeId: "income-1",
      hidden: true,
    };
    // Sorted order a real forecast would produce: incoming before outgoing
    // on the shared date, so both credits (income, auto-move credit) land
    // ahead of the debit.
    const timeline = computeAccountBalancesAfterEachRow([income, autoMoveCredit, autoMoveDebit], accounts);
    expect(accountBalanceForRow(income, timeline)).toBe(100000); // 100000 + 4400000 - 4400000
    expect(accountBalanceForRow(autoMoveCredit, timeline)).toBe(4450000); // 50000 + 4400000, unaffected
  });

  it("leaves an income row's snapshot unaugmented when it has no tied auto-move at all", () => {
    const plainIncome: ForecastRow = {
      sourceType: "recurring",
      sourceId: "income-2",
      originalDate: "2026-01-05",
      name: "Plain income",
      amount: 20000,
      dueDate: "2026-01-05",
      type: "income",
      runningBalance: 0,
      balanceId: "a",
    };
    const timeline = computeAccountBalancesAfterEachRow([plainIncome], accounts);
    expect(accountBalanceForRow(plainIncome, timeline)).toBe(120000);
  });
});
