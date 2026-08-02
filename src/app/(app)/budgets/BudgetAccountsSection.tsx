"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { ChevronIcon, DeleteIcon, EditIcon } from "@/components/navIcons";
import { SubmitButton } from "@/components/SubmitButton";
import { ReorderButtons } from "@/components/ReorderButtons";
import { useOrderedList } from "@/lib/useOrderedList";
import { deleteBudgetAccount } from "./actions";
import { BudgetAccountModal, type BudgetAccountRow } from "./BudgetAccountModal";
import { BudgetAccountFundsModal } from "./BudgetAccountFundsModal";

type FundsModalState = { account: BudgetAccountRow; mode: "add" | "take" | "move" };

// T204 (user request 2026-08-01): "I need another set of accounts that
// will be used as storage for the budgets" - managed from a sub-section
// right on this page (the user's own answer), collapsed by default like
// Forecast's own Insights card (T81) so it doesn't compete with the budget
// list below for a feature most sessions won't touch.
export function BudgetAccountsSection({
  accounts,
  budgetsByAccountId,
}: {
  accounts: BudgetAccountRow[];
  // T222 (user request 2026-08-02): which budgets have money in each
  // account, and how much of it is theirs - a budget account can hold more
  // than one budget's money at once. Whatever's left over (the account's
  // raw total minus every budget's attributed share) is unallocated - money
  // added directly to the account rather than through any one budget's own
  // ledger.
  budgetsByAccountId: Record<string, { budgetId: string; budgetName: string; amount: number }[]>;
}) {
  const [open, setOpen] = useState(false);
  const [modalState, setModalState] = useState<null | "new" | BudgetAccountRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  // T209 (user follow-up to T204): Add/Take/Move funds, mirroring Accounts'
  // own row (T189/T186).
  const [fundsModalState, setFundsModalState] = useState<FundsModalState | null>(null);
  // T228 (user request via REMINDER.md 2026-08-03): "Allow to rearrange
  // budget accounts" - same localStorage-backed click-reorder pattern T145
  // established elsewhere (Bills, Income, Debt, Savings, Budgets).
  const { orderedItems: orderedAccounts, moveUp, moveDown } = useOrderedList(
    "orium.budgetAccountsOrder",
    accounts,
    (account) => account.id,
  );

  return (
    <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between text-sm font-semibold text-notion-text hover:opacity-80 ${open ? "mb-2" : ""}`}
      >
        Budget Accounts
        <ChevronIcon
          direction="right"
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div>
          <p className="mb-3 text-sm text-slate-500">
            Separate storage accounts for your budgets - not part of Total Balance or the
            forecast. Link one to a budget so its replenishments, spends, and manual funds move
            real money here too.
          </p>
          {accounts.length === 0 ? (
            <p className="mb-3 text-sm text-slate-400">No budget accounts yet.</p>
          ) : (
            <ul className="mb-3 divide-y divide-notion-hairline">
              {orderedAccounts.map((account, index) => {
                // T222: this account's own attributed breakdown - which
                // budgets have money here, and how much of the raw total is
                // still unallocated (added directly to the account, not
                // through any one budget's own ledger).
                const attributed = budgetsByAccountId[account.id] ?? [];
                const unallocated =
                  account.amount - attributed.reduce((sum, entry) => sum + entry.amount, 0);
                return (
                <li key={account.id} className="py-2 text-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <ReorderButtons
                      onMoveUp={() => moveUp(account.id)}
                      onMoveDown={() => moveDown(account.id)}
                      isFirst={index === 0}
                      isLast={index === orderedAccounts.length - 1}
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:justify-start">
                      <span className="min-w-0 flex-1 truncate text-notion-text">{account.name}</span>
                      <span className="w-24 shrink-0 text-right tabular-nums text-notion-text">
                        {formatCentavos(account.amount)}
                      </span>
                    </div>
                  </div>
                  {confirmingDeleteId === account.id ? (
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                      <span className="text-xs text-slate-500">Delete?</span>
                      <form action={deleteBudgetAccount}>
                        <input type="hidden" name="id" value={account.id} />
                        <SubmitButton
                          className="rounded p-1 text-xs text-red-600 hover:bg-red-50"
                          spinnerClassName="h-3.5 w-3.5"
                        >
                          Yes
                        </SubmitButton>
                      </form>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        className="rounded p-1 text-xs text-slate-500 hover:bg-notion-hover"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setFundsModalState({ account, mode: "add" })}
                          className="text-xs font-medium text-green-700 hover:underline"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setFundsModalState({ account, mode: "take" })}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Take
                        </button>
                        {accounts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFundsModalState({ account, mode: "move" })}
                            className="text-xs font-medium text-notion-accent hover:underline"
                          >
                            Move
                          </button>
                        )}
                      </div>
                      <div className="h-4 w-px bg-notion-hairline" />
                      <button
                        type="button"
                        onClick={() => setModalState(account)}
                        title="Edit"
                        aria-label={`Edit ${account.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
                      >
                        <EditIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(account.id)}
                        title="Delete"
                        aria-label={`Delete ${account.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <DeleteIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  </div>
                  {/* T222 fix (user report 2026-08-02): "taking funds
                      directly from a budget account should simply just
                      adjust that budget account, not create an
                      'Unallocated'." An account with no budget attached at
                      all previously still showed "Unallocated ₱X" - just
                      restating the account's own total already shown above,
                      with no new information - and a plain Add/Take on that
                      kind of account made it look like this line had just
                      "appeared." Only shown now when at least one budget
                      actually has money here - a real mix worth breaking
                      down, not a account that's simply never been attached
                      to a budget. */}
                  {attributed.length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      {attributed.map((entry) => `${entry.budgetName} ${formatCentavos(entry.amount)}`).join(" · ")}
                      {unallocated !== 0 && ` · Unallocated ${formatCentavos(unallocated)}`}
                    </p>
                  )}
                </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setModalState("new")}
            className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover"
          >
            Add budget account
          </button>
        </div>
      )}

      {modalState !== null && (
        <BudgetAccountModal
          account={modalState === "new" ? null : modalState}
          onClose={() => setModalState(null)}
        />
      )}

      {fundsModalState && (
        <BudgetAccountFundsModal
          mode={fundsModalState.mode}
          account={fundsModalState.account}
          accounts={accounts}
          onClose={() => setFundsModalState(null)}
        />
      )}
    </div>
  );
}
