"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { updateBudgetAssumedSpendPercent } from "@/app/(app)/budgets/actions";

export type BudgetUsageEntry = { id: string; name: string; assumedSpendPercent: number };

// T284 follow-up (SPEC.md Phase 49, user request 2026-08-08): "I want a
// slider for each budget, controllable from the forecast and peaks/drops" -
// one shared panel, reused from both `ForecastClient.tsx` and
// `PeaksAndDropsCard.tsx` so the two pages don't drift into two different
// controls for the same setting. Dragging a slider updates the live figures
// on whichever page it's open on *instantly* via `onChange` (the parent
// recomputes with `computeRunningBalances`, engine/forecast.ts - no server
// round-trip needed for that part; the plain "Total balance" figure itself
// never moves - only the projection does, per the user's own correction
// 2026-08-08) - the actual save is debounced separately so a fast drag
// doesn't fire a write per pixel.
const SAVE_DEBOUNCE_MS = 400;

// User request (2026-08-08): "add quick buttons... 1. all consumed 2.
// halfway consumed 3. not consumed at all." Reuses the slider labels'
// own wording ("Fully available"/"Fully spent") for a consistent vocabulary
// across the panel.
const PRESETS = [
  { label: "None spent", percent: 0 },
  { label: "Half spent", percent: 50 },
  { label: "All spent", percent: 100 },
] as const;

export function BudgetUsagePanel({
  budgets,
  onClose,
  onChange,
}: {
  budgets: BudgetUsageEntry[];
  onClose: () => void;
  onChange: (budgetId: string, percent: number) => void;
}) {
  const [localPercents, setLocalPercents] = useState<Record<string, number>>(() =>
    Object.fromEntries(budgets.map((b) => [b.id, b.assumedSpendPercent])),
  );
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function handleChange(budgetId: string, percent: number) {
    setLocalPercents((prev) => ({ ...prev, [budgetId]: percent }));
    onChange(budgetId, percent);

    clearTimeout(saveTimers.current[budgetId]);
    saveTimers.current[budgetId] = setTimeout(() => {
      updateBudgetAssumedSpendPercent(budgetId, percent);
    }, SAVE_DEBOUNCE_MS);
  }

  function applyPresetToAll(percent: number) {
    for (const budget of budgets) handleChange(budget.id, percent);
  }

  return (
    <Modal title="Budget usage" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">
        How much of each budget&apos;s money do you assume is already spoken for? Drag toward
        &ldquo;Fully spent&rdquo; to treat it like a bill - deducted from your forecast the moment
        it&apos;s set aside. Drag toward &ldquo;Fully available&rdquo; to keep counting it as free
        cash until you actually log a spend.
      </p>
      {budgets.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.percent}
              type="button"
              onClick={() => applyPresetToAll(preset.percent)}
              className="rounded border border-notion-hairline px-2 py-1 text-xs text-notion-text hover:bg-notion-hover"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {budgets.length === 0 ? (
        <p className="text-sm text-slate-500">No budgets yet.</p>
      ) : (
        <ul className="max-h-96 space-y-5 overflow-y-auto">
          {budgets.map((budget) => {
            const percent = localPercents[budget.id] ?? budget.assumedSpendPercent;
            return (
              <li key={budget.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate font-medium text-notion-text">{budget.name}</span>
                  <span className="shrink-0 text-slate-500">{percent}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={percent}
                  onChange={(e) => handleChange(budget.id, Number(e.target.value))}
                  className="w-full accent-notion-accent"
                  aria-label={`${budget.name} assumed spend percent`}
                />
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Fully available</span>
                  <span>Fully spent</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
