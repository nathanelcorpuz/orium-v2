import { describe, expect, it } from "vitest";
import {
  computeAccountMonthlyBreakdown,
  frequencyLabel,
  type AutoMoveItem,
  type MonthlyBreakdownItem,
  type OneTimeItem,
} from "./accountMonthlyBreakdown";

function recurring(overrides: Partial<MonthlyBreakdownItem>): MonthlyBreakdownItem {
  return {
    id: "id",
    name: "item",
    type: "bill",
    amount: -10000,
    interval: 1,
    unit: "month",
    weekdays: null,
    daysOfMonth: [1],
    balanceId: "acct-1",
    ...overrides,
  };
}

const noAutoMoves: AutoMoveItem[] = [];
const noNames = new Map<string, string>();

describe("frequencyLabel", () => {
  it("labels interval-1 presets", () => {
    expect(frequencyLabel(1, "day")).toBe("Daily");
    expect(frequencyLabel(1, "week")).toBe("Weekly");
    expect(frequencyLabel(1, "month")).toBe("Monthly");
    expect(frequencyLabel(1, "year")).toBe("Yearly");
  });

  it("labels every-N-units for interval > 1", () => {
    expect(frequencyLabel(2, "week")).toBe("Every 2 weeks");
    expect(frequencyLabel(3, "month")).toBe("Every 3 months");
    expect(frequencyLabel(5, "day")).toBe("Every 5 days");
  });
});

describe("computeAccountMonthlyBreakdown", () => {
  it("sums income into monthlyReceived and bill/debt/savings into monthlyDeducted", () => {
    const items = [
      recurring({ id: "inc", type: "income", amount: 2000000, interval: 1, unit: "month", daysOfMonth: [1] }),
      recurring({ id: "bill", type: "bill", amount: -50000, interval: 1, unit: "month", daysOfMonth: [15] }),
      recurring({ id: "debt", type: "debt", amount: -30000, interval: 1, unit: "month", daysOfMonth: [20] }),
    ];
    const result = computeAccountMonthlyBreakdown(items, [], noAutoMoves, noNames, "acct-1");
    expect(result.monthlyReceived).toBe(2000000);
    expect(result.monthlyDeducted).toBe(-80000);
    expect(result.monthlyNet).toBe(1920000);
  });

  it("only counts items connected to the requested account", () => {
    const items = [
      recurring({ id: "a", balanceId: "acct-1", amount: -10000 }),
      recurring({ id: "b", balanceId: "acct-2", amount: -99999 }),
      recurring({ id: "c", balanceId: null, amount: -55555 }),
    ];
    const result = computeAccountMonthlyBreakdown(items, [], noAutoMoves, noNames, "acct-1");
    expect(result.monthlyDeducted).toBe(-10000);
  });

  it("groups items by their own actual frequency, not just monthly ones", () => {
    const items = [
      recurring({ id: "weekly", interval: 1, unit: "week", weekdays: [1], daysOfMonth: null }),
      recurring({ id: "biweekly", interval: 2, unit: "week", weekdays: [1], daysOfMonth: null }),
      recurring({ id: "monthly", interval: 1, unit: "month", daysOfMonth: [1] }),
      recurring({ id: "yearly", interval: 1, unit: "year", daysOfMonth: null }),
    ];
    const result = computeAccountMonthlyBreakdown(items, [], noAutoMoves, noNames, "acct-1");
    expect(result.frequencyGroups.map((g) => g.label)).toEqual([
      "Weekly",
      "Every 2 weeks",
      "Monthly",
      "Yearly",
    ]);
  });

  it("a yearly item rounds to 0 in the monthly total but still appears in its own frequency group", () => {
    const items = [recurring({ id: "yearly", type: "savings", amount: -1200000, interval: 1, unit: "year", daysOfMonth: null })];
    const result = computeAccountMonthlyBreakdown(items, [], noAutoMoves, noNames, "acct-1");
    expect(result.monthlyDeducted).toBe(0);
    expect(result.frequencyGroups).toHaveLength(1);
    expect(result.frequencyGroups[0].label).toBe("Yearly");
    expect(result.frequencyGroups[0].items[0].id).toBe("yearly");
  });

  it("includes only this account's connected one-off items, never rolled into the monthly totals", () => {
    const oneOffs: OneTimeItem[] = [
      { id: "misc-1", name: "Gift", amount: -100000, dueDate: "2026-12-25", balanceId: "acct-1" },
      { id: "misc-2", name: "Other", amount: -50000, dueDate: "2026-11-01", balanceId: "acct-2" },
    ];
    const result = computeAccountMonthlyBreakdown([], oneOffs, noAutoMoves, noNames, "acct-1");
    expect(result.oneTime).toHaveLength(1);
    expect(result.oneTime[0].id).toBe("misc-1");
    expect(result.monthlyReceived).toBe(0);
    expect(result.monthlyDeducted).toBe(0);
  });

  it("returns empty groups/totals for an account with nothing connected", () => {
    const result = computeAccountMonthlyBreakdown([], [], noAutoMoves, noNames, "acct-1");
    expect(result.frequencyGroups).toEqual([]);
    expect(result.oneTime).toEqual([]);
    expect(result.autoMoves).toEqual([]);
    expect(result.monthlyNet).toBe(0);
  });

  // Bug report 2026-08-03: "bdo tatay does not consider the received funds
  // as income" / "UB Nanay has an 88k monthly income, which is inaccurate
  // because some of those funds are being auto moved to bdo tatay."
  describe("auto-moves (T212)", () => {
    const income = recurring({
      id: "income-1",
      name: "Nanay - TNIT",
      type: "income",
      amount: 8800000,
      interval: 1,
      unit: "month",
      daysOfMonth: [5],
      balanceId: "ub-nanay",
    });
    const names = new Map([
      ["ub-nanay", "UB Nanay"],
      ["bdo-tatay", "BDO Tatay"],
    ]);
    const move: AutoMoveItem = { id: "move-1", incomeId: "income-1", destinationBalanceId: "bdo-tatay", amount: 1000000 };

    it("counts an auto-move into the destination account as received, using the linked income's own frequency", () => {
      const result = computeAccountMonthlyBreakdown([income], [], [move], names, "bdo-tatay");
      expect(result.monthlyReceived).toBe(1000000);
      expect(result.monthlyNet).toBe(1000000);
      expect(result.autoMoves).toEqual([{ id: "move-1", label: "Auto-moved in from Nanay - TNIT", amount: 1000000 }]);
    });

    it("deducts an auto-move out of the source account, alongside its own connected income", () => {
      const result = computeAccountMonthlyBreakdown([income], [], [move], names, "ub-nanay");
      expect(result.monthlyReceived).toBe(8800000);
      expect(result.monthlyDeducted).toBe(-1000000);
      expect(result.monthlyNet).toBe(7800000);
      expect(result.autoMoves).toEqual([{ id: "move-1", label: "Auto-moved out to BDO Tatay", amount: -1000000 }]);
    });

    it("skips an auto-move whose linked income is switched off, same as Bug #20's isActive rule", () => {
      const inactiveIncome = { ...income, active: false };
      const result = computeAccountMonthlyBreakdown([inactiveIncome], [], [move], names, "bdo-tatay");
      expect(result.monthlyReceived).toBe(0);
      expect(result.autoMoves).toEqual([]);
    });

    it("skips an auto-move whose income no longer exists (deleted)", () => {
      const result = computeAccountMonthlyBreakdown([], [], [move], names, "bdo-tatay");
      expect(result.monthlyReceived).toBe(0);
      expect(result.autoMoves).toEqual([]);
    });
  });
});
