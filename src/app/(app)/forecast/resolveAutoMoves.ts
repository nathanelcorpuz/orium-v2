import type { IncomeAutoMove, IncomeAutoMoveManualEntry, IncomeAutoMoveOverride } from "@/lib/engine/types";

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
  // T243: true for a one-off entry with no standing rule behind it at all -
  // AutoMoveRow.tsx uses this to show a "Manual"/delete treatment instead of
  // the rule-based edit/skip/reset one, since there's no rule to reset to.
  manual?: true;
}

function manualKey(incomeId: string, originalDate: string): string {
  return `${incomeId}|${originalDate}`;
}

// T243: grouped by (incomeId, originalDate) since - unlike a rule, which
// applies to every occurrence - a manual entry only ever names the one
// occurrence it was added for.
export function buildManualAutoMovesByKey(
  manualEntries: IncomeAutoMoveManualEntry[],
): Map<string, IncomeAutoMoveManualEntry[]> {
  const map = new Map<string, IncomeAutoMoveManualEntry[]>();
  for (const entry of manualEntries) {
    const key = manualKey(entry.incomeId, entry.originalDate);
    const list = map.get(key) ?? [];
    list.push(entry);
    map.set(key, list);
  }
  return map;
}

/** Resolves every auto-move rule attached to `incomeId` for one specific occurrence (`originalDate`), applying any per-instance override (T224), plus any manual one-off entries added for that exact occurrence (T243). */
export function resolveAutoMoves(
  incomeId: string,
  originalDate: string,
  rulesByIncomeId: Map<string, AutoMoveRule[]>,
  overrideByKey: Map<string, IncomeAutoMoveOverride>,
  balanceNameById: Map<string, string>,
  manualByKey: Map<string, IncomeAutoMoveManualEntry[]> = new Map(),
): ResolvedAutoMove[] {
  const rules = rulesByIncomeId.get(incomeId) ?? [];
  const resolvedRules = rules.map((rule) => {
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
  const resolvedManual = (manualByKey.get(manualKey(incomeId, originalDate)) ?? []).map((entry) => ({
    id: entry.id,
    destinationName: balanceNameById.get(entry.destinationBalanceId) ?? "another account",
    amount: entry.amount,
    skipped: false,
    edited: false,
    newDate: null,
    manual: true as const,
  }));
  return [...resolvedRules, ...resolvedManual];
}
