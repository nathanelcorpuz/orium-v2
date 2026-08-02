import type { IncomeAutoMove, IncomeAutoMoveOverride } from "@/lib/engine/types";

// SPEC.md T224: shared between ForecastClient.tsx and CalendarGrid.tsx (both
// need the exact same per-occurrence resolution for the income row's
// auto-move tag/tooltip and for EditSettleModal's editable section) so the
// two views can never quietly disagree about what a given occurrence's
// auto-moves actually are.

interface AutoMoveRule {
  id: string;
  destinationBalanceId: string;
  amount: number;
}

export function buildAutoMoveRulesByIncomeId(incomeAutoMoves: IncomeAutoMove[]): Map<string, AutoMoveRule[]> {
  const map = new Map<string, AutoMoveRule[]>();
  for (const autoMove of incomeAutoMoves) {
    const list = map.get(autoMove.incomeId) ?? [];
    list.push({ id: autoMove.id, destinationBalanceId: autoMove.destinationBalanceId, amount: autoMove.amount });
    map.set(autoMove.incomeId, list);
  }
  return map;
}

function overrideKey(incomeAutoMoveId: string, originalDate: string): string {
  return `${incomeAutoMoveId}|${originalDate}`;
}

export function buildAutoMoveOverrideByKey(
  incomeAutoMoveOverrides: IncomeAutoMoveOverride[],
): Map<string, IncomeAutoMoveOverride> {
  const map = new Map<string, IncomeAutoMoveOverride>();
  for (const override of incomeAutoMoveOverrides) {
    map.set(overrideKey(override.incomeAutoMoveId, override.originalDate), override);
  }
  return map;
}

export interface ResolvedAutoMove {
  id: string;
  destinationName: string;
  // Effective amount for this exact occurrence - the rule's plain amount,
  // an edited amount, or 0 when skipped.
  amount: number;
  skipped: boolean;
  // True when a non-skip override changed this occurrence's amount or date.
  edited: boolean;
  newDate: string | null;
}

/** Resolves every auto-move rule attached to `incomeId` for one specific occurrence (`originalDate`), applying any per-instance override (T224). */
export function resolveAutoMoves(
  incomeId: string,
  originalDate: string,
  rulesByIncomeId: Map<string, AutoMoveRule[]>,
  overrideByKey: Map<string, IncomeAutoMoveOverride>,
  balanceNameById: Map<string, string>,
): ResolvedAutoMove[] {
  const rules = rulesByIncomeId.get(incomeId) ?? [];
  return rules.map((rule) => {
    const override = overrideByKey.get(overrideKey(rule.id, originalDate));
    const skipped = override?.skipped ?? false;
    return {
      id: rule.id,
      destinationName: balanceNameById.get(rule.destinationBalanceId) ?? "another account",
      amount: skipped ? 0 : (override?.newAmount ?? rule.amount),
      skipped,
      edited: !skipped && !!override && (override.newAmount != null || override.newDate != null),
      newDate: override?.newDate ?? null,
    };
  });
}
