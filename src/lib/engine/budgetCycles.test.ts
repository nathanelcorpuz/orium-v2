import { describe, expect, it } from "vitest";
import {
  computeBudgetCycleStatus,
  expandBudgetCycleOccurrences,
  futureBudgetEntries,
  resolveBoundaries,
} from "./budgetCycles";
import type { Budget, BudgetEntry, OccurrenceOverride, RecurringItem } from "./types";

function budget(overrides: Partial<Budget>): Budget {
  return {
    id: "budget-1",
    name: "Groceries",
    monthlyAllocation: 500000,
    allocation: 500000,
    carryoverEnabled: true,
    createdAt: "2026-01-01",
    linkedIncomeId: null,
    startDate: null,
    interval: null,
    unit: null,
    weekdays: null,
    daysOfMonth: null,
    ordinal: null,
    ordinalWeekday: null,
    endsType: null,
    endDate: null,
    occurrenceCount: null,
    ...overrides,
  };
}

function income(overrides: Partial<RecurringItem>): RecurringItem {
  return {
    id: "income-1",
    name: "Salary",
    type: "income",
    amount: 3000000,
    startDate: "2026-01-01",
    interval: 1,
    unit: "month",
    weekdays: null,
    daysOfMonth: [1],
    ordinal: null,
    ordinalWeekday: null,
    endsType: "on_date",
    endDate: "2026-12-31",
    occurrenceCount: null,
    ...overrides,
  };
}

function entry(overrides: Partial<BudgetEntry>): BudgetEntry {
  return { id: "e1", budgetId: "budget-1", entryDate: "2026-01-01", amount: 0, note: null, ...overrides };
}

describe("computeBudgetCycleStatus - linked income boundaries", () => {
  it("uses the linked income's occurrences as cycle boundaries", () => {
    // carryoverEnabled: false to isolate boundary behavior from carryover
    // math (covered separately below).
    const b = budget({ linkedIncomeId: "income-1", allocation: 500000, carryoverEnabled: false });
    const inc = income({});
    const entries: BudgetEntry[] = [
      entry({ entryDate: "2026-02-10", amount: 200000 }), // in the Feb1-Mar1 cycle
    ];

    const status = computeBudgetCycleStatus(b, entries, [inc], [], "2026-02-15");
    expect(status.source).toBe("linked_income");
    expect(status.currentCycleStart).toBe("2026-02-01");
    expect(status.spent).toBe(200000);
    expect(status.remaining).toBe(300000);
  });

  it("a moved occurrence moves the boundary to the new date", () => {
    const b = budget({ linkedIncomeId: "income-1", allocation: 500000 });
    const inc = income({});
    const overrides: OccurrenceOverride[] = [
      { id: "ov1", recurringItemId: "income-1", originalDate: "2026-02-01", newDate: "2026-02-10", newAmount: null, newName: null, skipped: false },
    ];
    // Entry dated Feb 5 - between the original Feb1 boundary and the moved
    // Feb10 boundary. Since the boundary moved to Feb10, this entry still
    // belongs to the Jan1-Feb10 cycle, not a "Feb1" cycle that no longer
    // exists.
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-02-05", amount: 150000 })];

    const status = computeBudgetCycleStatus(b, entries, [inc], overrides, "2026-02-08");
    expect(status.currentCycleStart).toBe("2026-01-01");
    expect(status.spent).toBe(150000);
  });

  it("a skipped occurrence produces no boundary - the cycle just extends through it", () => {
    const b = budget({ linkedIncomeId: "income-1", allocation: 500000 });
    const inc = income({});
    const overrides: OccurrenceOverride[] = [
      { id: "ov1", recurringItemId: "income-1", originalDate: "2026-02-01", newDate: null, newAmount: null, newName: null, skipped: true },
    ];
    const entries: BudgetEntry[] = [
      entry({ entryDate: "2026-01-15", amount: 100000 }),
      entry({ entryDate: "2026-02-15", amount: 100000 }), // would be a new cycle if Feb1 weren't skipped
    ];

    // Today is in March, after the (skipped) Feb boundary and the real
    // Mar1 boundary.
    const status = computeBudgetCycleStatus(b, entries, [inc], overrides, "2026-03-05");
    // Boundaries: Jan1, Mar1 (Feb1 skipped). Current cycle = Mar1 onward,
    // spent = 0 so far in March.
    expect(status.currentCycleStart).toBe("2026-03-01");
    expect(status.spent).toBe(0);
  });

  it("income-ends extension: after the income's final occurrence, the last cycle extends indefinitely", () => {
    const b = budget({ linkedIncomeId: "income-1", allocation: 500000 });
    const inc = income({ endsType: "on_date", endDate: "2026-03-31" }); // last occurrence Mar 1
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-05-01", amount: 100000 })];

    const status = computeBudgetCycleStatus(b, entries, [inc], [], "2026-06-15");
    expect(status.source).toBe("linked_income");
    expect(status.currentCycleStart).toBe("2026-03-01");
    expect(status.spent).toBe(100000);
  });

  it("falls back to the budget's own schedule when the linked income no longer exists", () => {
    const b = budget({
      linkedIncomeId: "income-missing",
      allocation: 500000,
      startDate: "2026-01-01",
      interval: 1,
      unit: "month",
      daysOfMonth: [1],
      endsType: "never",
    });
    const status = computeBudgetCycleStatus(b, [], [], [], "2026-02-15");
    expect(status.source).toBe("own_schedule");
  });

  it("a budget linked to an income with months of prior history doesn't carry over phantom allowance from before it existed", () => {
    // Income has boundaries on the 1st since January; the budget wasn't
    // created until June, with nothing ever spent. Without clipping to
    // createdAt, the carryover walk would treat Jan-May as five real
    // unspent cycles and inflate `available` to 3,000,000 (allocation x6).
    const b = budget({ linkedIncomeId: "income-1", allocation: 500000, carryoverEnabled: true, createdAt: "2026-06-15" });
    const inc = income({});

    const status = computeBudgetCycleStatus(b, [], [inc], [], "2026-06-20");
    expect(status.currentCycleStart).toBe("2026-06-01");
    expect(status.carriedIn).toBe(0);
    expect(status.remaining).toBe(500000);
  });
});

describe("computeBudgetCycleStatus - own schedule", () => {
  it("weekly own-schedule cycles", () => {
    // 2026-01-05 is a Monday; weekly boundaries land on Mondays.
    const b = budget({
      allocation: 100000,
      startDate: "2026-01-05",
      interval: 1,
      unit: "week",
      weekdays: [1],
      endsType: "never",
    });
    const entries: BudgetEntry[] = [
      entry({ entryDate: "2026-01-06", amount: 30000 }), // Jan5-Jan12 cycle
      entry({ entryDate: "2026-01-13", amount: 40000 }), // Jan12-Jan19 cycle (boundary-date)
    ];

    // Today is Jan 15, within the Jan12-Jan19 cycle.
    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-01-15");
    expect(status.source).toBe("own_schedule");
    expect(status.currentCycleStart).toBe("2026-01-12");
    expect(status.spent).toBe(40000);
  });
});

describe("computeBudgetCycleStatus - fallback", () => {
  it("falls back to monthly-on-the-1st when neither a linked income nor an own schedule is set", () => {
    const b = budget({ allocation: 500000 });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-20", amount: 200000 })];

    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-01-25");
    expect(status.source).toBe("fallback");
    expect(status.currentCycleStart).toBe("2026-01-01");
    expect(status.spent).toBe(200000);
    expect(status.remaining).toBe(300000);
  });
});

describe("computeBudgetCycleStatus - carryover", () => {
  it("carryover on: an underspent cycle increases the next cycle's available", () => {
    const b = budget({ allocation: 500000, carryoverEnabled: true });
    const entries: BudgetEntry[] = [
      entry({ entryDate: "2026-01-10", amount: 200000 }), // Jan: 300000 left over
    ];

    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-02-15");
    expect(status.currentCycleStart).toBe("2026-02-01");
    expect(status.carriedIn).toBe(300000);
    expect(status.remaining).toBe(800000); // 500000 allocation + 300000 carried in
  });

  it("carryover off: available resets flat every cycle regardless of prior underspend", () => {
    const b = budget({ allocation: 500000, carryoverEnabled: false });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-10", amount: 200000 })];

    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-02-15");
    expect(status.carriedIn).toBe(0);
    expect(status.remaining).toBe(500000);
  });

  it("carryover negative: an overspent cycle reduces the next cycle's available", () => {
    const b = budget({ allocation: 500000, carryoverEnabled: true });
    const entries: BudgetEntry[] = [
      entry({ entryDate: "2026-01-10", amount: 700000 }), // Jan: overspent by 200000
    ];

    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-02-15");
    expect(status.carriedIn).toBe(-200000);
    expect(status.remaining).toBe(300000); // 500000 - 200000 carried-in deficit
    expect(status.over).toBe(0);
  });

  it("carryover negative can push the current cycle itself over, not just reduce remaining", () => {
    const b = budget({ allocation: 500000, carryoverEnabled: true });
    const entries: BudgetEntry[] = [
      entry({ id: "e1", entryDate: "2026-01-10", amount: 700000 }), // Jan: -200000 carry
      entry({ id: "e2", entryDate: "2026-02-05", amount: 400000 }), // Feb spend
    ];

    // Feb available = 500000 - 200000 = 300000; spent 400000 -> over by 100000.
    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-02-15");
    expect(status.remaining).toBe(0);
    expect(status.over).toBe(100000);
  });
});

describe("computeBudgetCycleStatus - remaining/over", () => {
  it("remaining is 0 and over is 0 exactly at the available amount", () => {
    const b = budget({ allocation: 500000 });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-10", amount: 500000 })];
    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-01-15");
    expect(status.remaining).toBe(0);
    expect(status.over).toBe(0);
  });

  it("over is positive and remaining is 0 when spends exceed available", () => {
    const b = budget({ allocation: 500000 });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-10", amount: 650000 })];
    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-01-15");
    expect(status.remaining).toBe(0);
    expect(status.over).toBe(150000);
  });
});

describe("computeBudgetCycleStatus - boundary-date entries", () => {
  it("an entry dated exactly on a boundary belongs to the new cycle, not the old one", () => {
    const b = budget({ allocation: 500000 });
    // Fallback boundaries: ..., 2026-01-01, 2026-02-01, ...
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-02-01", amount: 100000 })];

    const januaryStatus = computeBudgetCycleStatus(b, entries, [], [], "2026-01-31");
    expect(januaryStatus.currentCycleStart).toBe("2026-01-01");
    expect(januaryStatus.spent).toBe(0);

    const februaryStatus = computeBudgetCycleStatus(b, entries, [], [], "2026-02-01");
    expect(februaryStatus.currentCycleStart).toBe("2026-02-01");
    expect(februaryStatus.spent).toBe(100000);
  });

  it("entries dated before the very first boundary fold into cycle 0", () => {
    const b = budget({
      allocation: 500000,
      startDate: "2026-03-01",
      interval: 1,
      unit: "month",
      daysOfMonth: [1],
      endsType: "never",
    });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-15", amount: 50000 })];

    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-03-10");
    expect(status.currentCycleStart).toBe("2026-03-01");
    expect(status.spent).toBe(50000);
  });
});

describe("computeBudgetCycleStatus - future-dated entries (T43)", () => {
  it("a future entry still inside the current cycle counts toward spent/remaining", () => {
    const b = budget({ allocation: 500000 });
    // Fallback boundaries land on the 1st; today Jan 15, entry Jan 25 - both
    // still inside the Jan1-Feb1 cycle even though the entry is dated after today.
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-25", amount: 100000 })];
    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-01-15");
    expect(status.currentCycleEnd).toBe("2026-02-01");
    expect(status.spent).toBe(100000);
    expect(status.remaining).toBe(400000);
  });

  it("a future entry in a LATER cycle does not leak into the current cycle's spent", () => {
    const b = budget({ allocation: 500000 });
    // Today Jan 15 (Jan1-Feb1 cycle); entry Mar 10 belongs to a much later
    // cycle and must not inflate the current cycle's spent/reduce remaining.
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-03-10", amount: 100000 })];
    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-01-15");
    expect(status.spent).toBe(0);
    expect(status.remaining).toBe(500000);
  });

  it("currentCycleEnd is null once the schedule's boundaries run out (income ended)", () => {
    const b = budget({ linkedIncomeId: "income-1", allocation: 500000 });
    const inc = income({ endsType: "on_date", endDate: "2026-03-31" }); // last occurrence Mar 1
    const status = computeBudgetCycleStatus(b, [], [inc], [], "2026-06-15");
    expect(status.currentCycleEnd).toBeNull();
  });
});

describe("futureBudgetEntries", () => {
  it("returns only this budget's entries dated after today, sorted ascending", () => {
    const entries: BudgetEntry[] = [
      entry({ id: "e1", entryDate: "2026-02-10", amount: 100000 }),
      entry({ id: "e2", entryDate: "2026-01-05", amount: 200000 }), // past - excluded
      entry({ id: "e3", entryDate: "2026-01-20", amount: 300000 }),
      entry({ id: "e4", budgetId: "other-budget", entryDate: "2026-02-01", amount: 400000 }), // different budget - excluded
    ];
    const result = futureBudgetEntries(entries, "budget-1", "2026-01-15");
    expect(result.map((e) => e.id)).toEqual(["e3", "e1"]);
  });
});

describe("expandBudgetCycleOccurrences - future-dated entries (T43)", () => {
  it("reduces the current-cycle remaining row by a future entry within this cycle, instead of ignoring it", () => {
    const b = budget({ allocation: 500000 });
    const entries: BudgetEntry[] = [
      entry({ id: "e1", entryDate: "2026-01-10", amount: 100000 }), // past
      entry({ id: "e2", entryDate: "2026-01-25", amount: 50000 }), // future, still this cycle
    ];
    // remaining = 500000 - (100000 + 50000) = 350000; the boundary row here
    // only carries the UNKNOWN portion (350000 - the 50000 already dated) -
    // the future entry itself gets its own separate row (forecast.ts), so
    // together they still total the true 350000 remaining, without double-
    // counting. Horizon stays within January so no future boundary rows
    // appear, isolating just this row's calculation.
    const occurrences = expandBudgetCycleOccurrences(b, entries, [], [], "2026-01-15", "2026-01-31");
    expect(occurrences).toEqual([{ date: "2026-01-15", amount: -300000 }]);
  });

  it("reduces a future boundary's allocation row by a future entry inside that specific cycle", () => {
    const b = budget({ allocation: 500000 });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-02-10", amount: 200000 })]; // in the Feb cycle
    const occurrences = expandBudgetCycleOccurrences(b, entries, [], [], "2026-01-15", "2026-03-31");
    expect(occurrences).toEqual([
      { date: "2026-01-15", amount: -500000 }, // nothing spent in Jan yet
      { date: "2026-02-01", amount: -300000 }, // 500000 - 200000 known future spend
      { date: "2026-03-01", amount: -500000 }, // untouched
    ]);
  });

  it("clamps a future allocation row at 0 (not negative) when known future spend meets or exceeds it", () => {
    const b = budget({ allocation: 500000 });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-02-10", amount: 600000 })];
    const occurrences = expandBudgetCycleOccurrences(b, entries, [], [], "2026-01-15", "2026-02-28");
    const febRow = occurrences.find((o) => o.date === "2026-02-01");
    expect(febRow?.amount).toBe(0);
  });
});

describe("computeBudgetCycleStatus - integer math", () => {
  it("stays integer centavos through carryover accumulation", () => {
    const b = budget({ allocation: 333333, carryoverEnabled: true });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-10", amount: 111111 })];
    const status = computeBudgetCycleStatus(b, entries, [], [], "2026-02-15");
    expect(Number.isInteger(status.carriedIn)).toBe(true);
    expect(Number.isInteger(status.remaining)).toBe(true);
    expect(status.carriedIn).toBe(222222);
    expect(status.remaining).toBe(555555);
  });
});

describe("expandBudgetCycleOccurrences", () => {
  it("dates the current-cycle remaining row today", () => {
    const b = budget({ allocation: 500000 });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-10", amount: 200000 })];
    const occurrences = expandBudgetCycleOccurrences(b, entries, [], [], "2026-01-15", "2026-01-15");
    expect(occurrences).toEqual([{ date: "2026-01-15", amount: -300000 }]);
  });

  it("omits the current-cycle row entirely when remaining is 0", () => {
    const b = budget({ allocation: 500000 });
    const entries: BudgetEntry[] = [entry({ entryDate: "2026-01-10", amount: 500000 })];
    const occurrences = expandBudgetCycleOccurrences(b, entries, [], [], "2026-01-15", "2026-01-15");
    expect(occurrences).toEqual([]);
  });

  it("emits one row per future boundary at the full allocation", () => {
    const b = budget({ allocation: 500000 });
    const occurrences = expandBudgetCycleOccurrences(b, [], [], [], "2026-01-15", "2026-04-30");
    expect(occurrences).toEqual([
      { date: "2026-01-15", amount: -500000 },
      { date: "2026-02-01", amount: -500000 },
      { date: "2026-03-01", amount: -500000 },
      { date: "2026-04-01", amount: -500000 },
    ]);
  });

  it("stops generating future rows once the income source ends", () => {
    const b = budget({ linkedIncomeId: "income-1", allocation: 500000 });
    const inc = income({ endsType: "on_date", endDate: "2026-02-28" }); // last occurrence Feb1
    const occurrences = expandBudgetCycleOccurrences(b, [], [inc], [], "2026-01-15", "2026-04-30");
    expect(occurrences).toEqual([
      { date: "2026-01-15", amount: -500000 },
      { date: "2026-02-01", amount: -500000 },
    ]);
  });
});

describe("resolveBoundaries (T42 stale-budget-override check)", () => {
  // deleteStaleBudgetOverrides (src/lib/staleOverrides.ts) asks "is this
  // exact date still a real boundary under the new rule" via
  // resolveBoundaries(..., through=that date).boundaries.includes(date) -
  // confirming that exact usage, since every other test here exercises
  // resolveBoundaries only indirectly through computeBudgetCycleStatus/
  // expandBudgetCycleOccurrences with a realistic today/horizon.
  it("includes a date that's still a valid boundary after a rule change", () => {
    const b = budget({
      startDate: "2026-01-05",
      interval: 1,
      unit: "week",
      weekdays: [1], // Monday
      endsType: "never",
    });
    const { boundaries } = resolveBoundaries(b, [], [], "2026-01-19"); // a Monday
    expect(boundaries).toContain("2026-01-19");
  });

  it("omits a date that a rule change removed", () => {
    // Was weekly on Monday; now weekly on Wednesday - the old Monday date
    // is no longer a real boundary.
    const b = budget({
      startDate: "2026-01-05",
      interval: 1,
      unit: "week",
      weekdays: [3], // Wednesday
      endsType: "never",
    });
    const { boundaries } = resolveBoundaries(b, [], [], "2026-01-19"); // the old Monday
    expect(boundaries).not.toContain("2026-01-19");
  });
});
