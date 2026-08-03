import type { RecurrenceUnit, RecurringItemType } from "./engine/types";
import { monthlyEquivalent } from "./engine/monthlyTotals";
import { isActive } from "./isActive";

// Accounts page (2026-08-03, replacing the standalone /allocation page the
// user asked to remove): "the amount each account received monthly, the
// amount each account is deducted monthly, the sum of those two" - and
// beyond the monthly rollup, a full breakdown by each item's own actual
// recurrence, so a yearly or one-time payment isn't hidden inside an
// averaged monthly figure.

export type MonthlyBreakdownItem = {
  id: string;
  name: string;
  type: RecurringItemType;
  amount: number; // centavos, signed
  interval: number;
  unit: RecurrenceUnit;
  weekdays: number[] | null;
  daysOfMonth: number[] | null;
  balanceId: string | null;
  autoDebited?: boolean;
  // T175: false = switched off. Bug #20 (2026-08-03): a switched-off item
  // must be excluded here too, same as the Forecast already excludes it -
  // "switching off any finance items should assume that its been
  // completely removed from everything."
  active?: boolean;
};

export type OneTimeItem = {
  id: string;
  name: string;
  amount: number; // centavos, signed
  dueDate: string;
  balanceId: string | null;
  active?: boolean;
};

// T212's transfer rule: whenever a linked income settles, a portion moves
// straight into another account. Bug report 2026-08-03: "bdo tatay does not
// consider the received funds as income" / "UB Nanay has an 88k monthly
// income, which is inaccurate because some of those funds are being auto
// moved to bdo tatay" - the breakdown below previously only ever looked at
// `balanceId` connections, so it had no idea this second, silent money
// movement existed at all.
export type AutoMoveItem = {
  id: string;
  incomeId: string;
  destinationBalanceId: string;
  amount: number; // centavos, positive magnitude - mirrors income_auto_moves.amount
};

export type AutoMoveFlow = {
  id: string;
  label: string;
  amount: number; // monthly-equivalent centavos, signed (+ in, - out)
};

export type FrequencyGroup = {
  label: string;
  items: MonthlyBreakdownItem[];
};

export type AccountMonthlyBreakdown = {
  monthlyReceived: number; // centavos, >= 0 - income items' monthly equivalent + auto-moves in
  monthlyDeducted: number; // centavos, <= 0 - bill/debt/savings monthly equivalent + auto-moves out
  monthlyNet: number; // received + deducted
  // Every connected recurring item, grouped by its own actual frequency
  // (not just the ones that happen to be monthly) - sorted shortest period
  // first, so "Daily"/"Weekly" surface before "Yearly". Empty when nothing
  // is connected.
  frequencyGroups: FrequencyGroup[];
  // Connected one-off items (Misc) - not recurring, so they never
  // contribute to the monthly figures above, but still worth seeing when
  // deciding how to distribute payments across accounts.
  oneTime: OneTimeItem[];
  // Transparent, on its own rather than folded into frequencyGroups (an
  // auto-move isn't its own editable record - it rides on its income's
  // schedule) - money moving in from another account's income, or moving
  // out to another account, both counted in the totals above.
  autoMoves: AutoMoveFlow[];
};

// Human-readable frequency label, generalized the same way T219/T234's
// monthlyEquivalent already generalizes the *amount* - every interval/unit
// combination gets a real label, not just the four legacy presets.
export function frequencyLabel(interval: number, unit: RecurrenceUnit): string {
  if (interval === 1) {
    switch (unit) {
      case "day":
        return "Daily";
      case "week":
        return "Weekly";
      case "month":
        return "Monthly";
      case "year":
        return "Yearly";
    }
  }
  return `Every ${interval} ${unit}s`;
}

// Approximate days per occurrence - sort key only, never shown or used for
// money math (monthlyEquivalent already handles that precisely).
function frequencyWeight(interval: number, unit: RecurrenceUnit): number {
  switch (unit) {
    case "day":
      return interval;
    case "week":
      return interval * 7;
    case "month":
      return interval * 30;
    case "year":
      return interval * 365;
  }
}

export function computeAccountMonthlyBreakdown(
  recurringItems: MonthlyBreakdownItem[],
  oneOffItems: OneTimeItem[],
  autoMoves: AutoMoveItem[],
  balanceNameById: Map<string, string>,
  balanceId: string,
): AccountMonthlyBreakdown {
  const connected = recurringItems.filter((item) => item.balanceId === balanceId && isActive(item));

  let monthlyReceived = 0;
  let monthlyDeducted = 0;
  const groupsByLabel = new Map<string, FrequencyGroup>();

  for (const item of connected) {
    const monthly = monthlyEquivalent({
      amount: item.amount,
      interval: item.interval,
      unit: item.unit,
      weekdays: item.weekdays,
      daysOfMonth: item.daysOfMonth,
    });
    if (item.type === "income") {
      monthlyReceived += monthly;
    } else {
      monthlyDeducted += monthly;
    }

    const label = frequencyLabel(item.interval, item.unit);
    const group = groupsByLabel.get(label) ?? { label, items: [] };
    group.items.push(item);
    groupsByLabel.set(label, group);
  }

  const frequencyGroups = [...groupsByLabel.values()].sort((a, b) => {
    const first = a.items[0];
    const second = b.items[0];
    return frequencyWeight(first.interval, first.unit) - frequencyWeight(second.interval, second.unit);
  });

  const oneTime = oneOffItems.filter((item) => item.balanceId === balanceId && isActive(item));

  // Bug report 2026-08-03: an auto-move (T212) is a second, silent money
  // movement no earlier version of this breakdown knew about - it fires
  // whenever its linked income settles, so its own monthly-equivalent uses
  // that income's rule, not a rule of its own. Only active, still-connected
  // incomes count, same reasoning Bug #20 already applied everywhere else.
  const incomesById = new Map(
    recurringItems.filter((item) => item.type === "income" && isActive(item)).map((item) => [item.id, item]),
  );
  const autoMoveFlows: AutoMoveFlow[] = [];
  for (const move of autoMoves) {
    const income = incomesById.get(move.incomeId);
    if (!income) continue;
    const monthly = monthlyEquivalent({
      amount: move.amount,
      interval: income.interval,
      unit: income.unit,
      weekdays: income.weekdays,
      daysOfMonth: income.daysOfMonth,
    });
    if (move.destinationBalanceId === balanceId) {
      monthlyReceived += monthly;
      autoMoveFlows.push({ id: move.id, label: `Auto-moved in from ${income.name}`, amount: monthly });
    }
    if (income.balanceId === balanceId && income.balanceId !== move.destinationBalanceId) {
      monthlyDeducted -= monthly;
      autoMoveFlows.push({
        id: move.id,
        label: `Auto-moved out to ${balanceNameById.get(move.destinationBalanceId) ?? "another account"}`,
        amount: -monthly,
      });
    }
  }

  return {
    monthlyReceived,
    monthlyDeducted,
    monthlyNet: monthlyReceived + monthlyDeducted,
    frequencyGroups,
    oneTime,
    autoMoves: autoMoveFlows,
  };
}
