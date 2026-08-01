"use client";

import { useState } from "react";
import { formatCentavos } from "@/lib/money";
import { ChevronIcon, DeleteIcon, EditIcon } from "@/components/navIcons";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteBudgetAccount } from "./actions";
import { BudgetAccountModal, type BudgetAccountRow } from "./BudgetAccountModal";

// T204 (user request 2026-08-01): "I need another set of accounts that
// will be used as storage for the budgets" - managed from a sub-section
// right on this page (the user's own answer), collapsed by default like
// Forecast's own Insights card (T81) so it doesn't compete with the budget
// list below for a feature most sessions won't touch.
export function BudgetAccountsSection({ accounts }: { accounts: BudgetAccountRow[] }) {
  const [open, setOpen] = useState(false);
  const [modalState, setModalState] = useState<null | "new" | BudgetAccountRow>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

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
              {accounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-notion-text">{account.name}</span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-notion-text">
                    {formatCentavos(account.amount)}
                  </span>
                  {confirmingDeleteId === account.id ? (
                    <div className="flex shrink-0 items-center gap-1">
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
                    <div className="flex shrink-0 items-center gap-1">
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
                </li>
              ))}
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
    </div>
  );
}
