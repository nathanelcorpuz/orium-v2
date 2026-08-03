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

export type FrequencyGroup = {
  label: string;
  items: MonthlyBreakdownItem[];
};

export type AccountMonthlyBreakdown = {
  monthlyReceived: number; // centavos, >= 0 - sum of income items' monthly equivalent
  monthlyDeducted: number; // centavos, <= 0 - sum of bill/debt/savings items' monthly equivalent
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

  return {
    monthlyReceived,
    monthlyDeducted,
    monthlyNet: monthlyReceived + monthlyDeducted,
    frequencyGroups,
    oneTime,
  };
}
