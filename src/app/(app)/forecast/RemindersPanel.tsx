"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronIcon } from "@/components/navIcons";
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

const COLLAPSED_STORAGE_KEY = "orium.remindersCollapsed";

// Full-height collapsible right panel, mirroring AppShell's left sidebar
// (user request 2026-07-23: "occupy the entire right panel, like the menu
// in the left, also collapsible"). Same hydration-safe localStorage pattern
// as AppShell: `collapsed` starts `false` on both server and first client
// render, then a post-mount effect applies the stored preference, avoiding
// a server/client markup mismatch.
export function RemindersPanel({ reminders }: { reminders: ReminderRow[] }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  }

  if (collapsed) {
    return (
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col items-center border-l border-notion-hairline bg-white p-2 lg:flex">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={`Expand reminders${reminders.length > 0 ? ` (${reminders.length})` : ""}`}
          aria-label="Expand reminders"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-notion-hover hover:text-notion-text"
        >
          <ChevronIcon direction="left" className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-l border-notion-hairline bg-white p-4 lg:flex">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-notion-text">Reminders</h2>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Collapse reminders"
          aria-label="Collapse reminders"
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
        >
          <ChevronIcon direction="right" className="h-4 w-4" />
        </button>
      </div>
      <AddReminderForm />
      {reminders.length === 0 ? (
        <p className="text-sm text-slate-400">No reminders yet.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
