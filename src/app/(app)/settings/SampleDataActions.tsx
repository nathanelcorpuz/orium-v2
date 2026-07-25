"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { resetData, restoreSampleData, type SettingsActionState } from "./actions";

const initialState: SettingsActionState = { error: null };

// T97: "Reset my data" (wipe everything, keep the account + preferences)
// and "Restore sample data" (wipe, then re-seed) - always wipe-then-seed
// for Restore rather than layering on top of whatever's already there, so
// the account never ends up with a mix of sample and real entries the user
// didn't ask for (confirmed with the user 2026-07-25 - the warning lives in
// this modal's copy, not in any extra "are you sure" step).
//
// `showPreviewLink` (T103) adds a third, non-destructive entry - "Preview
// with sample data" - available regardless of whether the account currently
// holds sample or real data (unlike Restore/Reset, which do touch real
// rows). Only passed `true` from Settings' own Sample Data card, not from
// the Dashboard banner this component is also reused by (SampleDataBanner),
// since that banner only ever shows when sample data is already loaded -
// a "preview sample data" link there would be redundant.
export function SampleDataActions({ showPreviewLink = false }: { showPreviewLink?: boolean }) {
  const [openModal, setOpenModal] = useState<"reset" | "restore" | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [restoreConfirmation, setRestoreConfirmation] = useState("");
  const [resetState, resetFormAction, resetPending] = useActionState(resetData, initialState);
  const [restoreState, restoreFormAction, restorePending] = useActionState(
    restoreSampleData,
    initialState,
  );

  function close() {
    setOpenModal(null);
    setResetConfirmation("");
    setRestoreConfirmation("");
  }

  // Neither action redirects (unlike Delete account) - they stay on
  // Settings and show a success message, so the modal needs to close
  // itself once its action actually succeeds.
  useEffect(() => {
    if (resetState.message && !resetState.error) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetState]);

  useEffect(() => {
    if (restoreState.message && !restoreState.error) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreState]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {showPreviewLink && (
          <Link
            href="/?preview=1"
            className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
          >
            Preview with sample data
          </Link>
        )}
        <button
          type="button"
          onClick={() => setOpenModal("restore")}
          className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
        >
          Restore sample data
        </button>
        <button
          type="button"
          onClick={() => setOpenModal("reset")}
          className="rounded border border-red-300 px-4 py-2 text-red-600"
        >
          Reset my data
        </button>
      </div>
      {resetState.message && !resetState.error && openModal === null && (
        <p className="mt-2 text-sm text-green-700">{resetState.message}</p>
      )}
      {restoreState.message && !restoreState.error && openModal === null && (
        <p className="mt-2 text-sm text-green-700">{restoreState.message}</p>
      )}

      {openModal === "reset" && (
        <Modal title="Reset your data?" onClose={close}>
          <p className="mb-4 text-sm text-slate-600">
            This permanently deletes all your balances, bills, income, debt, savings, budgets,
            extras, history, and reminders. Your account and preferences stay intact. This
            cannot be undone.
          </p>
          <form action={resetFormAction} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600" htmlFor="reset-confirmation">
                Type RESET to confirm
              </label>
              <input
                id="reset-confirmation"
                name="confirmation"
                type="text"
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              />
            </div>
            {resetState.error && <p className="text-sm text-red-600">{resetState.error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetConfirmation !== "RESET" || resetPending}
                className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {resetPending ? "Resetting..." : "Reset my data"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {openModal === "restore" && (
        <Modal title="Restore sample data?" onClose={close}>
          <p className="mb-4 text-sm text-slate-600">
            This first deletes all your current balances, bills, income, debt, savings,
            budgets, extras, history, and reminders, then replaces them with the sample
            dataset. Any real data you've entered will be lost. This cannot be undone.
          </p>
          <form action={restoreFormAction} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600" htmlFor="restore-confirmation">
                Type RESTORE to confirm
              </label>
              <input
                id="restore-confirmation"
                name="confirmation"
                type="text"
                value={restoreConfirmation}
                onChange={(event) => setRestoreConfirmation(event.target.value)}
                className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              />
            </div>
            {restoreState.error && <p className="text-sm text-red-600">{restoreState.error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={restoreConfirmation !== "RESTORE" || restorePending}
                className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
              >
                {restorePending ? "Restoring..." : "Restore sample data"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
