"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createReminder, deleteReminder, updateReminder, type ReminderActionState } from "./reminderActions";

export type ReminderRow = { id: string; text: string };

const initialState: ReminderActionState = { error: null };

function AddReminderForm() {
  const [state, formAction, pending] = useActionState(createReminder, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      formRef.current?.reset();
      submitted.current = false;
    }
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        submitted.current = true;
      }}
      className="mb-4"
    >
      <div className="flex gap-2">
        <input
          name="text"
          type="text"
          placeholder="New reminder"
          required
          className="flex-1 rounded border border-notion-hairline p-2 text-sm text-notion-text focus:border-notion-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-notion-text px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {state.error && <p className="mt-1 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

function ReminderItem({ reminder }: { reminder: ReminderRow }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [editState, editFormAction, editPending] = useActionState(updateReminder, initialState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !editPending && !editState.error) {
      setMode("view");
      submitted.current = false;
    }
  }, [editPending, editState]);

  if (mode === "edit") {
    return (
      <form
        action={editFormAction}
        onSubmit={() => {
          submitted.current = true;
        }}
      >
        <input type="hidden" name="id" value={reminder.id} />
        <div className="flex items-center gap-1">
          <input
            name="text"
            type="text"
            defaultValue={reminder.text}
            required
            className="flex-1 rounded border border-notion-hairline p-1 text-sm text-notion-text focus:border-notion-accent focus:outline-none"
          />
          <button type="submit" disabled={editPending} className="text-xs text-slate-600 underline">
            Save
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            className="text-xs text-slate-400 underline"
          >
            Cancel
          </button>
        </div>
        {editState.error && <p className="mt-1 text-xs text-red-600">{editState.error}</p>}
      </form>
    );
  }

  if (mode === "delete") {
    return (
      <div className="flex items-center justify-between gap-1 text-sm">
        <span className="text-slate-600">Delete this reminder?</span>
        <div className="flex gap-1">
          <form action={deleteReminder}>
            <input type="hidden" name="id" value={reminder.id} />
            <button type="submit" className="text-xs text-red-600 underline">
              Yes
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode("view")}
            className="text-xs text-slate-400 underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="flex-1 break-words text-notion-text">{reminder.text}</span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="text-xs text-slate-500 underline"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setMode("delete")}
          className="text-xs text-red-600 underline"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function RemindersPanel({ reminders }: { reminders: ReminderRow[] }) {
  return (
    <aside className="w-full shrink-0 rounded-lg border border-notion-hairline bg-white p-4 lg:w-72">
      <h2 className="mb-3 text-sm font-semibold text-notion-text">Reminders</h2>
      <AddReminderForm />
      {reminders.length === 0 ? (
        <p className="text-sm text-slate-400">No reminders yet.</p>
      ) : (
        <div className="max-h-56 overflow-y-auto pr-1 md:max-h-96">
          <ul className="space-y-2">
            {reminders.map((reminder) => (
              <li key={reminder.id}>
                <ReminderItem reminder={reminder} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
