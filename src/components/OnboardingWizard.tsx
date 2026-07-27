"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCentavos } from "@/lib/money";
import { CheckIcon, CloseIcon, DeleteIcon, EditIcon } from "@/components/navIcons";
import { BalanceModal, type BalanceRow } from "@/app/(app)/accounts/BalanceModal";
import { deleteBalance } from "@/app/(app)/accounts/actions";
import { BillModal, type BillRow } from "@/app/(app)/bills/BillModal";
import { deleteBill } from "@/app/(app)/bills/actions";
import { IncomeModal, type IncomeRow } from "@/app/(app)/income/IncomeModal";
import { deleteIncome } from "@/app/(app)/income/actions";
import { MonthlyGoalModal } from "@/components/recurring/MonthlyGoalModal";
import type { MonthlyGoalRow } from "@/components/recurring/MonthlyGoalRow";
import { BudgetModal, type BudgetRow } from "@/app/(app)/budgets/BudgetModal";
import { deleteBudget } from "@/app/(app)/budgets/actions";
import { ExtraModal, type ExtraRow } from "@/app/(app)/misc/ExtraModal";
import { deleteExtra } from "@/app/(app)/misc/actions";
import { createDebt, updateDebt, deleteDebt } from "@/app/(app)/debt/actions";
import { createSavings, updateSavings, deleteSavings } from "@/app/(app)/savings/actions";
import {
  skipOnboardingStep,
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

// T115: the guided-setup walkthrough, distinct from the skippable
// SpotlightTour. Accounts/Bills/Income are what "set up" means; Debt,
// Savings, Budgets and Misc are offered afterwards and can be skipped.
// Which step shows is derived from what the account actually contains (does
// a real row exist for this step, or was it explicitly skipped), so a
// refresh mid-setup naturally resumes in the right place with no separate
// step-index state to keep in sync. The "add another?" interstitial's
// trigger (`wizardState`) is likewise server-persisted rather than client
// state - see `createXForWizard` in onboardingActions.ts for why (a save's
// own revalidatePath can remount this component before any client-side
// success callback would fire).
//
// T123: this used to render *instead of* the whole app from
// `(app)/layout.tsx`, with each step's add-form as a modal whose Cancel did
// nothing - a genuine no-escape block. It's now the content of the ordinary
// `/setup` page: each step shows a panel describing itself, and the real
// add-form opens as a modal *from* that panel and closes back to it. The
// nav is always present, so nothing here can trap anyone.
//
// T120: each step carries a one-line `hint` explaining why it comes where
// it does - the modals themselves explain what each entity *is* (their own
// intro paragraphs, which render here too since this embeds the real
// add-forms), so this is purely the "why am I being asked this now" thread.
const STEPS = [
  {
    key: "accounts",
    label: "Add an account",
    noun: "Account",
    required: true,
    hint: "Start here - everything else connects back to an account.",
  },
  {
    key: "bills",
    label: "Add a bill",
    noun: "Bill",
    required: true,
    hint: "What goes out regularly. This is most of what pulls your balance down.",
  },
  {
    key: "income",
    label: "Add income",
    noun: "Income",
    required: true,
    hint: "What comes in. With bills and income, your forecast starts working.",
  },
  {
    key: "debt",
    label: "Add debt (optional)",
    noun: "Debt",
    required: false,
    hint: "Anything you're paying down, so Orium can show you the payoff date.",
  },
  {
    key: "savings",
    label: "Add a savings goal (optional)",
    noun: "Savings goal",
    required: false,
    hint: "Money you set aside, reserved in the forecast rather than counted as spare.",
  },
  {
    key: "budgets",
    label: "Set up a budget (optional)",
    noun: "Budget",
    required: false,
    hint: "For spending that varies month to month, like groceries or fuel.",
  },
  {
    key: "misc",
    label: "Add a misc item (optional)",
    noun: "Misc item",
    required: false,
    hint: "One-off amounts that don't repeat - a big purchase, a bonus.",
  },
] as const;

function parseWizardState(raw: string | null): { type: "prompt" | "reopen"; key: StepKey } | null {
  if (!raw) return null;
  const [type, key] = raw.split(":");
  if (type !== "prompt" && type !== "reopen") return null;
  if (!STEPS.some((s) => s.key === key)) return null;
  return { type, key: key as StepKey };
}

// T115 follow-up: each preview row's amount is signed differently per type
// (bills/debt/savings/misc store an outflow as negative; income and account
// balances are positive) - this normalizes to "what a user reads as the size
// of the entry".
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
  const [adding, setAdding] = useState(false);
  // T115 follow-up: "edit" from the preview list. Plain client state is fine
  // here (unlike wizardState) - a save-triggered remount resetting this to
  // null closes the edit view, which is exactly the wanted outcome.
  const [editing, setEditing] = useState<{ step: StepKey; id: string } | null>(null);
  // Which preview-list item (if any) is showing its inline "delete this?"
  // confirm, same treatment as BudgetEntriesModal's own entry rows.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // REMINDER (user request 2026-07-26): step derivation is normally
  // "whatever's next unresolved" (below), with no way to look at a step
  // already passed. `viewIndex` overrides that derivation while set, driven
  // by the Back/Forward buttons - null means "follow the natural flow."
  const [viewIndex, setViewIndex] = useState<number | null>(null);

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
  const deleteActionByKey: Record<StepKey, (formData: FormData) => Promise<void>> = {
    accounts: deleteBalance,
    bills: deleteBill,
    income: deleteIncome,
    debt: deleteDebt,
    savings: deleteSavings,
    budgets: deleteBudget,
    misc: deleteExtra,
  };

  const stepIndex = STEPS.findIndex(
    (step) => !hasByKey[step.key] && !skippedSteps.includes(step.key),
  );

  const displayKey: StepKey | null =
    justSaved ??
    reopenKey ??
    (viewIndex !== null ? STEPS[viewIndex].key : stepIndex === -1 ? null : STEPS[stepIndex].key);
  const step = STEPS.find((s) => s.key === displayKey);
  const displayIndex = step ? STEPS.findIndex((s) => s.key === step.key) : -1;
  // Back/Forward only make sense while looking at a step's ordinary panel -
  // hidden during the post-save interstitial or an open add form, so they
  // never fight `justSaved`/`reopenKey`'s own precedence above.
  const showStepNav = justSaved === null && reopenKey === null && !adding && displayIndex !== -1;

  async function handleAddAnother() {
    if (!justSaved) return;
    await setWizardReopen(justSaved);
    setAdding(true);
    router.refresh();
  }

  async function handleContinue() {
    await clearWizardState();
    setAdding(false);
    router.refresh();
  }

  async function handleSkip(key: string) {
    setPendingKey(key);
    await skipOnboardingStep(key);
    setAdding(false);
    // Skipping is a forward-moving action just like completing the step, so
    // it returns to the natural flow rather than leaving the view pinned on
    // the now-skipped step.
    setViewIndex(null);
    router.refresh();
  }

  function goToStepIndex(index: number) {
    setDeletingId(null);
    setEditing(null);
    setViewIndex(Math.max(0, Math.min(STEPS.length - 1, index)));
  }

  // T123: replaces the old auto-complete effect, which fired
  // `completeRequiredOnboarding()` and redirected the moment every step
  // resolved. That existed only because the wizard was a gate that had to
  // decide when to let you through; a page can simply say so and let you
  // choose where to go.
  if (!step) {
    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-xl rounded-lg border border-notion-hairline bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-notion-text">You&rsquo;re all set</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your accounts, bills and income are in, so your forecast is working. Everything else can
            be added any time from its own page.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/forecast"
              className="rounded bg-notion-text px-4 py-2 text-sm text-white hover:opacity-90"
            >
              See your forecast
            </Link>
            <Link
              href="/"
              className="rounded border border-notion-hairline px-4 py-2 text-sm text-notion-text hover:bg-notion-hover"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const stepNumber = displayIndex + 1;
  const previewItems = itemsByKey[step.key];
  const editingItem =
    editing && editing.step === step.key ? previewItems.find((i) => i.id === editing.id) : undefined;
  // The add-form shows when explicitly opened, or when "Add another" set the
  // reopen state. Never forced open otherwise - the panel comes first, so
  // this page always has a visible way out.
  const addFormOpen = adding || reopenKey !== null;

  const createModal = (
    <>
      {step.key === "accounts" && (
        <BalanceModal
          balance={null}
          onClose={() => setAdding(false)}
          createActionOverride={createBalanceForWizard}
        />
      )}
      {step.key === "bills" && (
        <BillModal
          bill={null}
          balances={balances}
          onClose={() => setAdding(false)}
          createActionOverride={createBillForWizard}
        />
      )}
      {step.key === "income" && (
        <IncomeModal
          income={null}
          balances={balances}
          onClose={() => setAdding(false)}
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
          onClose={() => setAdding(false)}
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
          onClose={() => setAdding(false)}
        />
      )}
      {step.key === "budgets" && (
        <BudgetModal
          budget={null}
          incomes={incomeOptions}
          onClose={() => setAdding(false)}
          createActionOverride={createBudgetForWizard}
        />
      )}
      {step.key === "misc" && (
        <ExtraModal
          extra={null}
          balances={balances}
          onClose={() => setAdding(false)}
          createActionOverride={createExtraForWizard}
        />
      )}
    </>
  );

  const editModal = editingItem ? (
    <>
      {step.key === "accounts" && (
        <BalanceModal balance={editingItem as BalanceRow} onClose={() => setEditing(null)} />
      )}
      {step.key === "bills" && (
        <BillModal bill={editingItem as BillRow} balances={balances} onClose={() => setEditing(null)} />
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
  ) : null;

  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-notion-text">Guided setup</h1>
            <p className="text-sm text-slate-500">
              Step {stepNumber} of {STEPS.length}
            </p>
          </div>
          {/* T123: the old "Exit setup for now" flipped a dismissal flag to
              unblock the app. Nothing blocks any more, so leaving is just a
              link - and the nav beside it works too. */}
          <Link href="/" className="text-sm text-slate-500 underline hover:text-notion-text">
            Done for now
          </Link>
        </div>

        {/* REMINDER (user request 2026-07-26): the step shown used to be
            purely derived from what's left to do, with no way to look back at
            a step already passed. These free-browse any of the 7 steps via
            `viewIndex`, independent of completion - hidden during the
            post-save interstitial or an open add form, since neither is "a
            step's ordinary panel" to navigate away from mid-flow. */}
        {showStepNav && (
          <div className="mb-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => goToStepIndex(displayIndex - 1)}
              disabled={displayIndex <= 0}
              className="rounded border border-notion-hairline px-3 py-1 text-xs text-notion-text hover:bg-notion-hover disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => goToStepIndex(displayIndex + 1)}
              disabled={displayIndex >= STEPS.length - 1}
              className="rounded border border-notion-hairline px-3 py-1 text-xs text-notion-text hover:bg-notion-hover disabled:opacity-40"
            >
              Forward
            </button>
          </div>
        )}

        <div className="rounded-lg border border-notion-hairline bg-white p-6">
          <h2 className="text-base font-semibold text-notion-text">{step.label}</h2>
          <p className="mt-1 text-sm text-slate-600">{step.hint}</p>

          {justSaved !== null && (
            <p className="mt-3 rounded bg-notion-hover px-3 py-2 text-sm text-notion-text">
              {step.noun} added. Add another, or continue.
            </p>
          )}

          {previewItems.length > 0 && (
            <ul className="mt-4 max-h-56 space-y-1 overflow-y-auto rounded border border-notion-hairline p-2">
              {previewItems.map((item) =>
                deletingId === item.id ? (
                  // REMINDER (user request 2026-07-26): delete confirm, same
                  // inline pattern as BudgetEntriesModal's own entry rows -
                  // a destructive action gets one extra click, not a full
                  // dialog.
                  <li key={item.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm">
                    <span className="truncate text-slate-600">Delete {item.name}?</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <form action={deleteActionByKey[step.key]}>
                        <input type="hidden" name="id" value={item.id} />
                        <button
                          type="submit"
                          title="Confirm delete"
                          aria-label={`Confirm delete ${item.name}`}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setDeletingId(null)}
                        title="Cancel"
                        aria-label="Cancel"
                        className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ) : (
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
                        title="Edit"
                        aria-label={`Edit ${item.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(item.id)}
                        title="Delete"
                        aria-label={`Delete ${item.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <DeleteIcon className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (justSaved !== null ? handleAddAnother() : setAdding(true))}
              className="rounded bg-notion-text px-4 py-2 text-sm text-white hover:opacity-90"
            >
              {previewItems.length > 0 ? `Add another ${step.noun.toLowerCase()}` : step.label.replace(" (optional)", "")}
            </button>
            {justSaved !== null && (
              <button
                type="button"
                onClick={handleContinue}
                className="rounded border border-notion-hairline px-4 py-2 text-sm text-notion-text hover:bg-notion-hover"
              >
                Continue
              </button>
            )}
            {justSaved === null && !step.required && (
              <button
                type="button"
                onClick={() => handleSkip(step.key)}
                disabled={pendingKey === step.key}
                className="rounded border border-notion-hairline px-4 py-2 text-sm text-notion-text hover:bg-notion-hover disabled:opacity-50"
              >
                {pendingKey === step.key ? "Skipping…" : "Skip this step"}
              </button>
            )}
          </div>
        </div>
      </div>

      {editModal ?? (addFormOpen ? createModal : null)}
    </div>
  );
}
