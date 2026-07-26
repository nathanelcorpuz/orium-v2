"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCentavos } from "@/lib/money";
import { BalanceModal, type BalanceRow } from "@/app/(app)/accounts/BalanceModal";
import { BillModal, type BillRow } from "@/app/(app)/bills/BillModal";
import { IncomeModal, type IncomeRow } from "@/app/(app)/income/IncomeModal";
import { MonthlyGoalModal } from "@/components/recurring/MonthlyGoalModal";
import type { MonthlyGoalRow } from "@/components/recurring/MonthlyGoalRow";
import { BudgetModal, type BudgetRow } from "@/app/(app)/budgets/BudgetModal";
import { ExtraModal, type ExtraRow } from "@/app/(app)/extra/ExtraModal";
import { createDebt, updateDebt } from "@/app/(app)/debt/actions";
import { createSavings, updateSavings } from "@/app/(app)/savings/actions";
import { logout } from "@/app/auth/actions";
import {
  skipOnboardingStep,
  completeRequiredOnboarding,
  dismissOnboardingSetup,
  setWizardReopen,
  clearWizardState,
  createBalanceForWizard,
  createBillForWizard,
  createIncomeForWizard,
  createDebtForWizard,
  createSavingsForWizard,
  createBudgetForWizard,
  createExtraForWizard,
} from "@/lib/onboardingActions";

type BalanceOption = { id: string; name: string };
type StepKey = (typeof STEPS)[number]["key"];

// T115: the required onboarding wizard - distinct from the skippable
// SpotlightTour chain (T110). Accounts/Bills/Income are required (no way
// to skip: each step's Cancel/X does nothing); Debt/Savings/Budgets/Misc
// are offered the same way but can be explicitly skipped. Natural step
// position is derived from props passed down by `(app)/layout.tsx` (does a
// real row already exist for this step, or was it explicitly skipped) -
// no separate step-index state to keep in sync, so refreshing mid-wizard
// naturally resumes at the right place. The "add another?" interstitial's
// trigger (`wizardState`) is likewise server-persisted rather than client
// state - see `createXForWizard` in onboardingActions.ts for why (a save's
// own revalidatePath can remount this component before any client-side
// success callback would fire).
const STEPS = [
  { key: "accounts", label: "Add an account", noun: "Account", required: true },
  { key: "bills", label: "Add a bill", noun: "Bill", required: true },
  { key: "income", label: "Add income", noun: "Income", required: true },
  { key: "debt", label: "Add debt (optional)", noun: "Debt", required: false },
  { key: "savings", label: "Add a savings goal (optional)", noun: "Savings goal", required: false },
  { key: "budgets", label: "Set up a budget (optional)", noun: "Budget", required: false },
  { key: "misc", label: "Add a misc item (optional)", noun: "Misc item", required: false },
] as const;

function parseWizardState(raw: string | null): { type: "prompt" | "reopen"; key: StepKey } | null {
  if (!raw) return null;
  const [type, key] = raw.split(":");
  if (type !== "prompt" && type !== "reopen") return null;
  if (!STEPS.some((s) => s.key === key)) return null;
  return { type, key: key as StepKey };
}

// T115 follow-up (user request 2026-07-26): each preview row's amount is
// signed differently per type (bills/debt/savings/misc store an outflow as
// negative; income and account balances are positive) - this normalizes to
// "what a user reads as the size of the entry" for the interstitial list.
function previewAmount(stepKey: StepKey, item: { amount?: number; allocation?: number }): number {
  if (stepKey === "budgets") return item.allocation ?? 0;
  return Math.abs(item.amount ?? 0);
}

export function OnboardingWizard({
  hasAccounts,
  hasBills,
  hasIncome,
  hasDebt,
  hasSavings,
  hasBudgets,
  hasExtras,
  skippedSteps,
  wizardState,
  balances,
  bills,
  income,
  debt,
  savings,
  budgets,
  extras,
  incomeOptions,
}: {
  hasAccounts: boolean;
  hasBills: boolean;
  hasIncome: boolean;
  hasDebt: boolean;
  hasSavings: boolean;
  hasBudgets: boolean;
  hasExtras: boolean;
  skippedSteps: string[];
  wizardState: string | null;
  balances: BalanceRow[];
  bills: BillRow[];
  income: IncomeRow[];
  debt: MonthlyGoalRow[];
  savings: MonthlyGoalRow[];
  budgets: BudgetRow[];
  extras: ExtraRow[];
  incomeOptions: BalanceOption[];
}) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // T115 follow-up: "edit" from the "add another?" preview list. Plain
  // client state is fine here (unlike wizardState) - editing doesn't need
  // to survive a save-triggered remount, since a remount resetting this to
  // null (closing the edit view) is exactly the wanted post-save outcome,
  // the same coincidence every other page's plain "modalState" already
  // relies on.
  const [editing, setEditing] = useState<{ step: StepKey; id: string } | null>(null);

  const parsed = parseWizardState(wizardState);
  const justSaved = parsed?.type === "prompt" ? parsed.key : null;
  const reopenKey = parsed?.type === "reopen" ? parsed.key : null;

  const hasByKey: Record<string, boolean> = {
    accounts: hasAccounts,
    bills: hasBills,
    income: hasIncome,
    debt: hasDebt,
    savings: hasSavings,
    budgets: hasBudgets,
    misc: hasExtras,
  };
  const itemsByKey: Record<StepKey, { id: string; name: string; amount?: number; allocation?: number }[]> = {
    accounts: balances,
    bills,
    income,
    debt,
    savings,
    budgets,
    misc: extras,
  };

  const stepIndex = STEPS.findIndex(
    (step) => !hasByKey[step.key] && !skippedSteps.includes(step.key),
  );

  // All steps resolved (every required step has data; every optional step
  // has data or was skipped) - finalize and hand off to the real app. A
  // brief loading state covers the gap between this effect firing and
  // `(app)/layout.tsx` re-rendering without the wizard.
  useEffect(() => {
    if (stepIndex === -1 && justSaved === null && reopenKey === null) {
      completeRequiredOnboarding().then(() => router.refresh());
    }
  }, [stepIndex, justSaved, reopenKey, router]);

  if (stepIndex === -1 && justSaved === null && reopenKey === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Setting things up…</p>
      </div>
    );
  }

  // Priority: the interstitial for whatever was just saved, then a forced
  // reopen ("Add another"), then wherever natural progress says to go.
  const displayKey: StepKey | null = justSaved ?? reopenKey ?? (stepIndex === -1 ? null : STEPS[stepIndex].key);
  const step = STEPS.find((s) => s.key === displayKey);
  const isLastStep = step ? STEPS.findIndex((s) => s.key === step.key) === STEPS.length - 1 : false;

  function noop() {}

  async function handleAddAnother() {
    if (!justSaved) return;
    await setWizardReopen(justSaved);
    router.refresh();
  }

  async function handleContinue() {
    await clearWizardState();
    router.refresh();
  }

  async function handleSkip(key: string) {
    setPendingKey(key);
    await skipOnboardingStep(key);
    router.refresh();
  }

  async function handleExit() {
    setPendingKey("__exit");
    await dismissOnboardingSetup();
    router.refresh();
  }

  if (!step) return null;

  const previewItems = itemsByKey[step.key];
  const editingItem =
    editing && editing.step === step.key ? previewItems.find((i) => i.id === editing.id) : undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed inset-x-0 top-0 z-[70] flex flex-wrap items-center justify-between gap-2 bg-notion-text px-4 py-2 text-sm text-white">
        <div>
          <span className="font-medium">
            Step {STEPS.findIndex((s) => s.key === step.key) + 1} of {STEPS.length}: {step.label}
          </span>
          <span className="ml-2 text-slate-300">
            {step.required
              ? "Required - add one to continue."
              : "Optional - add one, or skip for now."}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {justSaved === null && reopenKey === null && !step.required && (
            <button
              type="button"
              onClick={() => handleSkip(step.key)}
              disabled={pendingKey === step.key}
              className="rounded border border-white/40 px-3 py-1 hover:bg-white/10 disabled:opacity-50"
            >
              {pendingKey === step.key ? "Skipping…" : "Skip this step"}
            </button>
          )}
          <button
            type="button"
            onClick={handleExit}
            disabled={pendingKey === "__exit"}
            className="text-slate-300 underline hover:text-white disabled:opacity-50"
          >
            Exit setup for now
          </button>
          <form action={logout}>
            <button type="submit" className="text-slate-300 underline hover:text-white">
              Log out
            </button>
          </form>
        </div>
      </div>

      {editingItem ? (
        <>
          {step.key === "accounts" && (
            <BalanceModal
              balance={editingItem as BalanceRow}
              onClose={() => setEditing(null)}
            />
          )}
          {step.key === "bills" && (
            <BillModal
              bill={editingItem as BillRow}
              balances={balances}
              onClose={() => setEditing(null)}
            />
          )}
          {step.key === "income" && (
            <IncomeModal
              income={editingItem as IncomeRow}
              balances={balances}
              onClose={() => setEditing(null)}
            />
          )}
          {step.key === "debt" && (
            <MonthlyGoalModal
              item={editingItem as MonthlyGoalRow}
              noun="debt"
              amountLabel="Amount (₱)"
              balances={balances}
              createAction={createDebt}
              updateAction={updateDebt}
              onClose={() => setEditing(null)}
            />
          )}
          {step.key === "savings" && (
            <MonthlyGoalModal
              item={editingItem as MonthlyGoalRow}
              noun="savings goal"
              amountLabel="Amount (₱)"
              balances={balances}
              createAction={createSavings}
              updateAction={updateSavings}
              onClose={() => setEditing(null)}
            />
          )}
          {step.key === "budgets" && (
            <BudgetModal
              budget={editingItem as BudgetRow}
              incomes={incomeOptions}
              onClose={() => setEditing(null)}
            />
          )}
          {step.key === "misc" && (
            <ExtraModal
              extra={editingItem as ExtraRow}
              balances={balances}
              onClose={() => setEditing(null)}
            />
          )}
        </>
      ) : justSaved !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-notion-hairline bg-white p-6 shadow-lg">
            <p className="mb-3 text-center text-notion-text">
              {step.noun} added. Add another, or continue{isLastStep ? "" : ` to the next step`}?
            </p>
            {previewItems.length > 0 && (
              <ul className="mb-4 max-h-48 space-y-1 overflow-y-auto rounded border border-notion-hairline p-2">
                {previewItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-notion-hover"
                  >
                    <span className="truncate text-notion-text">{item.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-slate-500">
                        {formatCentavos(previewAmount(step.key, item))}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditing({ step: step.key, id: item.id })}
                        className="text-xs text-notion-accent underline hover:opacity-80"
                      >
                        Edit
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={handleAddAnother}
                className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
              >
                Add another
              </button>
              <button
                type="button"
                onClick={handleContinue}
                className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
              >
                {isLastStep ? "Finish setup" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {step.key === "accounts" && (
            <BalanceModal
              balance={null}
              onClose={noop}
              createActionOverride={createBalanceForWizard}
            />
          )}
          {step.key === "bills" && (
            <BillModal
              bill={null}
              balances={balances}
              onClose={noop}
              createActionOverride={createBillForWizard}
            />
          )}
          {step.key === "income" && (
            <IncomeModal
              income={null}
              balances={balances}
              onClose={noop}
              createActionOverride={createIncomeForWizard}
            />
          )}
          {step.key === "debt" && (
            <MonthlyGoalModal
              item={null}
              noun="debt"
              amountLabel="Amount (₱)"
              balances={balances}
              createAction={createDebtForWizard}
              updateAction={updateDebt}
              onClose={() => handleSkip("debt")}
            />
          )}
          {step.key === "savings" && (
            <MonthlyGoalModal
              item={null}
              noun="savings goal"
              amountLabel="Amount (₱)"
              balances={balances}
              createAction={createSavingsForWizard}
              updateAction={updateSavings}
              onClose={() => handleSkip("savings")}
            />
          )}
          {step.key === "budgets" && (
            <BudgetModal
              budget={null}
              incomes={incomeOptions}
              onClose={() => handleSkip("budgets")}
              createActionOverride={createBudgetForWizard}
            />
          )}
          {step.key === "misc" && (
            <ExtraModal
              extra={null}
              balances={balances}
              onClose={() => handleSkip("misc")}
              createActionOverride={createExtraForWizard}
            />
          )}
        </>
      )}
    </div>
  );
}
