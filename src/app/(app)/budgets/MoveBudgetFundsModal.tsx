"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { blockNegativeKey, formatCentavos, parseCentavos } from "@/lib/money";
import { todayInManila } from "@/lib/date";
import { moveBudgetFunds, moveBudgetOwnAccountFunds, type BudgetActionState } from "./actions";
import type { BudgetRow } from "./BudgetModal";
import type { BudgetAccountRow } from "./BudgetAccountModal";

const initialState: BudgetActionState = { error: null };

// Encodes what's picked in the single "Move to" select - either one of this
// same budget's own other connected accounts, or a different budget
// entirely. A plain string value (not an object) since a native <select>
// only ever carries strings.
const ACCOUNT_PREFIX = "account:";
const BUDGET_PREFIX = "budget:";

// T222 (user request 2026-08-02): "if i move some of the pocket money
// funds from gcash tatay to cash tatay, how should i reflect that in the
// budgets? [...] i want that to reflect in the app easily." Replaces the
// "move" mode FundsModal.tsx used to handle - grown enough (two genuinely
// different move types, each with its own account picker) to warrant its
// own component. "Move to" is one list with two groups:
//  - this budget's own other connected accounts -> moveBudgetOwnAccountFunds
//    (same budget, same ledger total, money just physically relocates)
//  - a different budget -> moveBudgetFunds (T203/T220/T222), with its own
//    "which of {that budget}'s accounts" picker once it's chosen, if that
//    budget itself has 2+ connected accounts
export function MoveBudgetFundsModal({
  budgetId,
  budgetName,
  accounts,
  budgets,
  accountLinksByBudgetId,
  budgetAccounts,
  onClose,
}: {
  budgetId: string;
  budgetName: string;
  // This budget's own connected accounts.
  accounts: { id: string; name: string }[];
  // Every other budget, to move funds to.
  budgets: BudgetRow[];
  // Every budget's own connected accounts, so a chosen destination budget's
  // own picker can be resolved live.
  accountLinksByBudgetId: Record<string, { budgetAccountId: string; replenishAmount: number }[]>;
  budgetAccounts: BudgetAccountRow[];
  onClose: () => void;
}) {
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? "");
  const [destination, setDestination] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [amountPesos, setAmountPesos] = useState("");

  const isAccountDestination = destination.startsWith(ACCOUNT_PREFIX);
  const isBudgetDestination = destination.startsWith(BUDGET_PREFIX);
  const toAccountId = isAccountDestination ? destination.slice(ACCOUNT_PREFIX.length) : null;
  const toBudgetId = isBudgetDestination ? destination.slice(BUDGET_PREFIX.length) : null;
  const toBudget = toBudgetId ? budgets.find((budget) => budget.id === toBudgetId) : undefined;

  const toBudgetAccounts = useMemo(() => {
    if (!toBudgetId) return [];
    return (accountLinksByBudgetId[toBudgetId] ?? [])
      .map((link) => budgetAccounts.find((account) => account.id === link.budgetAccountId))
      .filter((account): account is BudgetAccountRow => account !== undefined);
  }, [toBudgetId, accountLinksByBudgetId, budgetAccounts]);

  // A destination-budget account pick from a *previous* destination can
  // never be silently submitted for the new one - reset inline on the
  // select's own onChange below rather than in an effect (no need to
  // synchronize with anything external; setState-in-effect is exactly the
  // cascading-render pattern React's own docs warn against).
  function handleDestinationChange(value: string) {
    setDestination(value);
    setDestinationAccountId("");
  }

  const otherBudgets = budgets.filter((budget) => budget.id !== budgetId);
  const accountOptions = accounts.filter((account) => account.id !== fromAccountId);

  const action = isAccountDestination ? moveBudgetOwnAccountFunds : moveBudgetFunds;
  const [state, formAction, pending] = useActionState(action, initialState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      onClose();
    }
  }, [pending, state, onClose]);

  const amountCentavos = parseCentavos(amountPesos) ?? 0;
  const fromAccountName = accounts.find((account) => account.id === fromAccountId)?.name;
  const destinationLabel = isAccountDestination
    ? accounts.find((account) => account.id === toAccountId)?.name
    : toBudget?.name;

  const canSubmit =
    destination !== "" && amountCentavos > 0 && (toBudgetAccounts.length <= 1 || destinationAccountId !== "");

  return (
    <Modal title={`${budgetName} - Move funds`} onClose={onClose}>
      <form
        action={formAction}
        onSubmit={() => {
          submitted.current = true;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="entryDate" value={todayInManila()} />
        {isAccountDestination ? (
          <>
            <input type="hidden" name="budgetId" value={budgetId} />
            <input type="hidden" name="budgetName" value={budgetName} />
            <input type="hidden" name="fromBudgetAccountId" value={fromAccountId} />
            <input type="hidden" name="toBudgetAccountId" value={toAccountId ?? ""} />
          </>
        ) : (
          <>
            <input type="hidden" name="fromBudgetId" value={budgetId} />
            <input type="hidden" name="fromBudgetName" value={budgetName} />
            <input type="hidden" name="toBudgetId" value={toBudgetId ?? ""} />
            <input type="hidden" name="toBudgetName" value={toBudget?.name ?? ""} />
            {accounts.length > 1 && <input type="hidden" name="fromBudgetAccountId" value={fromAccountId} />}
            {toBudgetAccounts.length > 1 && (
              <input type="hidden" name="toBudgetAccountId" value={destinationAccountId} />
            )}
          </>
        )}

        {accounts.length > 1 && (
          <div>
            <label className="block text-sm text-slate-600" htmlFor="fromAccountSelect">
              From account
            </label>
            <select
              id="fromAccountSelect"
              value={fromAccountId}
              onChange={(event) => setFromAccountId(event.target.value)}
              required
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600" htmlFor="destinationSelect">
            Move to
          </label>
          <select
            id="destinationSelect"
            value={destination}
            onChange={(event) => handleDestinationChange(event.target.value)}
            required
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          >
            <option value="" disabled>
              Choose where this goes…
            </option>
            {accountOptions.length > 0 && (
              <optgroup label={`${budgetName}'s other accounts`}>
                {accountOptions.map((account) => (
                  <option key={account.id} value={`${ACCOUNT_PREFIX}${account.id}`}>
                    {account.name}
                  </option>
                ))}
              </optgroup>
            )}
            {otherBudgets.length > 0 && (
              <optgroup label="A different budget">
                {otherBudgets.map((budget) => (
                  <option key={budget.id} value={`${BUDGET_PREFIX}${budget.id}`}>
                    {budget.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {isBudgetDestination && toBudgetAccounts.length > 1 && (
          <div>
            <label className="block text-sm text-slate-600" htmlFor="destinationAccountSelect">
              Which of {toBudget?.name}&rsquo;s accounts
            </label>
            <select
              id="destinationAccountSelect"
              value={destinationAccountId}
              onChange={(event) => setDestinationAccountId(event.target.value)}
              required
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            >
              <option value="" disabled>
                Choose which account this affects…
              </option>
              {toBudgetAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600" htmlFor="amountPesos">
            Amount (₱)
          </label>
          <input
            id="amountPesos"
            name="amountPesos"
            type="number"
            step="0.01"
            min="0"
            required
            value={amountPesos}
            onChange={(event) => setAmountPesos(event.target.value)}
            onKeyDown={blockNegativeKey}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>

        {destination !== "" && amountCentavos > 0 && (
          <p className="text-sm text-slate-500">
            Moves {formatCentavos(amountCentavos)}
            {fromAccountName ? ` from ${fromAccountName}` : ""} to {destinationLabel}
            {isBudgetDestination ? " (a different budget)" : ""}.
          </p>
        )}

        <div>
          <label className="block text-sm text-slate-600" htmlFor="note">
            Comment (optional)
          </label>
          <input
            id="note"
            name="note"
            type="text"
            placeholder="Defaults to “Moved to/from…”"
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !canSubmit}
            className="rounded bg-notion-accent px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Moving..." : "Move funds"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
