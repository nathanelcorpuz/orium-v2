"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/Modal";
import { deleteAccount, type SettingsActionState } from "./actions";

const initialState: SettingsActionState = { error: null };

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-red-300 px-4 py-2 text-red-600"
      >
        Delete my account
      </button>

      {open && (
        <Modal title="Delete your account?" onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-slate-600">
            This permanently deletes all your balances, bills, income, debt, savings, extras,
            history, and reminders. This cannot be undone.
          </p>
          <form action={formAction} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600" htmlFor="confirmation">
                Type DELETE to confirm
              </label>
              <input
                id="confirmation"
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
                onClick={() => setOpen(false)}
                className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={confirmation !== "DELETE" || pending}
                className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {pending ? "Deleting..." : "Delete my account"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
