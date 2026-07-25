"use client";

import { useActionState, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { resetData, type SettingsActionState } from "@/app/(app)/settings/actions";

const initialState: SettingsActionState = { error: null };

// T102: shown once, right after a new signup finishes the Forecast intro
// tour (T98) - the user has just been walked through the app using sample
// data, so this is the natural moment to ask whether to keep exploring with
// it or clear it and start entering real numbers. "Start fresh" reuses the
// exact same `resetData` action and RESET-to-confirm pattern Settings'
// SampleDataActions already uses for the same destructive operation, so the
// two entry points stay consistent rather than growing their own diverging
// confirm flows.
export function SampleDataDecisionModal({ onClose }: { onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(resetData, initialState);

  useEffect(() => {
    if (state.message && !state.error) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal title="You've finished the tour!" onClose={onClose}>
      {!confirming ? (
        <>
          <p className="mb-4 text-sm text-slate-600">
            You&rsquo;ve been exploring with sample data. Keep it around to keep getting a feel for
            Orium, or reset now and start entering your own numbers.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded border border-green-300 px-4 py-2 text-green-700 hover:bg-green-50"
            >
              Start fresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
            >
              Keep sample data
            </button>
          </div>
        </>
      ) : (
        <form action={formAction} className="space-y-4">
          <p className="text-sm text-slate-600">
            This permanently deletes the sample balances, bills, income, debt, savings, budgets,
            extras, history, and reminders. This cannot be undone.
          </p>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="decision-reset-confirmation">
              Type RESET to confirm
            </label>
            <input
              id="decision-reset-confirmation"
              name="confirmation"
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={confirmation !== "RESET" || pending}
              className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {pending ? "Resetting..." : "Reset my data"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
