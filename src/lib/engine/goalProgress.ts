import type { RecurrenceRule } from "./types";
import { expandRecurrenceOccurrences } from "./recurrence";

// Safe upper bound for "expand the whole rule" queries against on_date/
// after_count rules - matches remaining.ts's FAR_FUTURE_DATE. Debt/Savings
// items are DB-enforced (migration 0013, SPEC.md T72) to never use
// endsType "never", so every rule passed here has a real, finite total.
const FAR_FUTURE_DATE = "9999-12-31";

export interface GoalProgress {
  total: number;
  settled: number;
  fraction: number; // 0-1, settled/total; 0 when total is 0
}

// How many of a debt/savings item's occurrences have been settled vs. how
// many it will ever have in total (SPEC.md T72: "occurrences settled /
// total occurrences"). `settledCount` comes from the caller's own
// settlements count - this function only owns the total-occurrences half
// (recurrence math), same division of labor as remainingTotal
// (remaining.ts). Settled is clamped to total so an item whose rule was
// edited to be shorter after some occurrences were already settled still
// reports a sane 0-1 fraction instead of exceeding 100%.
export function goalProgress(rule: RecurrenceRule, settledCount: number): GoalProgress {
  const total = expandRecurrenceOccurrences(rule, rule.startDate, FAR_FUTURE_DATE).length;
  const settled = Math.min(settledCount, total);
  return { total, settled, fraction: total === 0 ? 0 : settled / total };
}
