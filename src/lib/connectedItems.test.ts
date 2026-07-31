import { describe, expect, it } from "vitest";
import { connectedItemsFromFixture } from "./connectedItems";
import type { RecurringItem } from "./engine/types";

// T152 (Bug #12): the Forecast page's balance chips opened an account with no
// connected items, because only the Balances page knew how to build that list.
// The mapping now lives in one place; this covers the pure half of it. The
// Supabase half (`loadConnectedItems`) needs a request-scoped client and is
// left to the build and to browser checks.
//
// Second non-engine test in this project, after `writingStyle.test.ts` - the
// function is pure and has no dependencies, which is exactly why it was split
// out of `connectedItemsData.ts`.

function item(overrides: Partial<RecurringItem>): RecurringItem {
  return {
    id: "item-1",
    name: "Item",
    type: "bill",
    amount: -100000,
    startDate: "2026-01-01",
    endDate: null,
    interval: 1,
    unit: "month",
    weekdays: null,
    daysOfMonth: [1],
    ordinal: null,
    ordinalWeekday: null,
    endsType: "never",
    occurrenceCount: null,
    balanceId: null,
    ...overrides,
  };
}

describe("connectedItemsFromFixture", () => {
  it("keeps only items linked to an account", () => {
    const result = connectedItemsFromFixture([
      item({ id: "a", name: "Rent", balanceId: "wallet" }),
      item({ id: "b", name: "Unlinked bill", balanceId: null }),
      item({ id: "c", name: "Salary", type: "income", amount: 5000000, balanceId: "wallet" }),
    ]);

    expect(result.map((connected) => connected.name)).toEqual(["Rent", "Salary"]);
  });

  it("carries the fields the modal actually displays", () => {
    const result = connectedItemsFromFixture([
      item({ id: "a", name: "Rent", type: "bill", amount: -3000000, balanceId: "wallet" }),
    ]);

    expect(result).toEqual([
      {
        id: "a",
        name: "Rent",
        amount: -3000000,
        balanceId: "wallet",
        sourceType: "recurring",
        type: "bill",
      },
    ]);
  });

  it("returns nothing when no item is linked", () => {
    expect(connectedItemsFromFixture([item({ balanceId: null })])).toEqual([]);
    expect(connectedItemsFromFixture([])).toEqual([]);
  });
});
