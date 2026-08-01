"use client";

import { useActionState, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  BellIcon,
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  DeleteIcon,
  EditIcon,
  GripIcon,
  RestoreIcon,
} from "@/components/navIcons";
import { MobileDrawer } from "@/components/MobileDrawer";
import { SubmitButton } from "@/components/SubmitButton";
import { DatePicker } from "@/components/DatePicker";
import { formatFullDate } from "@/lib/date";
import { useOrderedList } from "@/lib/useOrderedList";
import {
  createReminder,
  deleteReminder,
  setReminderCompleted,
  updateReminder,
  type ReminderActionState,
} from "./reminderActions";

// T190: `due_date` is optional - when set, this reminder is also plotted on
// the calendar (green); when null, it behaves exactly as before this field
// existed (list-only).
export type ReminderRow = { id: string; text: string; completed: boolean; due_date: string | null };

const initialState: ReminderActionState = { error: null };

// Bug fix + UX request (user report, 2026-08-01): "adding a new reminder
// should have an add button instead that shows the form instead of showing
// it outright." Previously always rendered inline, taking up permanent
// space above the list even when not in use - now collapsed to a single
// "Add reminder" button by default, same "click to reveal a form" shape
// ReminderItem's own edit/delete modes already use.
function AddReminderForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createReminder, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  // T190: `form.reset()` below only resets plain native inputs - DatePicker
  // is an uncontrolled component with its own React state, which a native
  // reset doesn't touch. Remounting it via a changing `key` on success is
  // the simplest way to actually clear the picked date back to blank.
  const [datePickerResetKey, setDatePickerResetKey] = useState(0);

  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      formRef.current?.reset();
      setDatePickerResetKey((k) => k + 1);
      setOpen(false);
      submitted.current = false;
    }
  }, [pending, state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 w-full rounded border border-dashed border-notion-hairline p-2 text-sm text-slate-500 hover:border-notion-accent hover:text-notion-text"
      >
        + Add reminder
      </button>
    );
  }

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
          autoFocus
          className="min-w-0 flex-1 rounded border border-notion-hairline p-2 text-sm text-notion-text focus:border-notion-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded bg-notion-text px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Cancel"
          aria-label="Cancel"
          className="shrink-0 rounded p-2 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* T190: optional - a reminder with no date is unchanged from before
          this field existed. Placeholder text ("Optional date") since this
          is the one truly-optional date field in the app; a blank
          DatePicker could otherwise read as an error waiting to happen. */}
      <DatePicker
        key={datePickerResetKey}
        name="dueDate"
        placeholder="Optional date (shows on calendar)"
        className="mt-1.5 w-full rounded border border-notion-hairline px-2 py-1 text-left text-xs text-slate-500 focus:border-notion-accent focus:outline-none"
      />
      {state.error && <p className="mt-1 text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

// T177: pointer-based drag reorder - no HTML5 native drag (no touch support)
// and no drag library (CLAUDE.md's "no new dependencies" rule), so this
// tracks the pointer directly via setPointerCapture, which keeps firing
// move/up events on the handle even once the pointer leaves it. On every
// move, it finds which sibling row the pointer's Y now sits above/below
// (via each row's own ref) and reorders live through useOrderedList's
// moveToIndex - the same persisted-order mechanism T145's up/down buttons
// already use elsewhere, just driven by a drag instead of a click.
function useDragReorder(orderedIds: string[], moveToIndex: (id: string, index: number) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  function registerRow(id: string, el: HTMLLIElement | null) {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }

  function handlePointerDown(id: string, e: PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(id);
  }

  function handlePointerMove(id: string, e: PointerEvent) {
    if (draggingId !== id) return;
    const y = e.clientY;
    let targetIndex = orderedIds.length - 1;
    for (let i = 0; i < orderedIds.length; i++) {
      const row = rowRefs.current.get(orderedIds[i]);
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        targetIndex = i;
        break;
      }
    }
    moveToIndex(id, targetIndex);
  }

  function handlePointerUp() {
    setDraggingId(null);
  }

  return { draggingId, registerRow, handlePointerDown, handlePointerMove, handlePointerUp };
}

function ReminderItem({ reminder, readOnly }: { reminder: ReminderRow; readOnly?: boolean }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [editState, editFormAction, editPending] = useActionState(updateReminder, initialState);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !editPending && !editState.error) {
      setMode("view");
      submitted.current = false;
    }
  }, [editPending, editState]);

  // T103: preview mode shows canned sample reminders with no way to
  // mutate them (there's nothing real behind them to save) - short-circuit
  // before the mode-based branches below, but keep the same completed/active
  // text styling so it still looks like a real reminder, just inert.
  if (readOnly) {
    return (
      <div className={`text-sm ${reminder.completed ? "text-slate-400 line-through" : "text-notion-text"}`}>
        {reminder.text}
      </div>
    );
  }

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
            // Bug fix (user report, 2026-08-01): a flex-1 child with no
            // min-width has an implicit `min-width: auto`, so a long
            // reminder's text refused to shrink and pushed the Cancel
            // button (and sometimes Save too) out of the panel entirely -
            // "editing a reminder gets broken, I can only see the check
            // icon." min-w-0 lets it actually shrink to fit.
            className="min-w-0 flex-1 rounded border border-notion-hairline p-1 text-sm text-notion-text focus:border-notion-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={editPending}
            title="Save"
            aria-label="Save"
            className="shrink-0 rounded p-1 text-notion-accent hover:bg-notion-hover disabled:opacity-50"
          >
            <CheckIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            title="Cancel"
            aria-label="Cancel"
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <DatePicker
          name="dueDate"
          defaultValue={reminder.due_date ?? undefined}
          placeholder="Optional date (shows on calendar)"
          className="mt-1.5 w-full rounded border border-notion-hairline px-2 py-1 text-left text-xs text-slate-500 focus:border-notion-accent focus:outline-none"
        />
        {editState.error && <p className="mt-1 text-xs text-red-600">{editState.error}</p>}
      </form>
    );
  }

  if (mode === "delete") {
    return (
      <div className="flex items-center justify-between gap-1 text-sm">
        <span className="text-slate-600">Delete this reminder?</span>
        <div className="flex shrink-0 items-center gap-1">
          <form action={deleteReminder}>
            <input type="hidden" name="id" value={reminder.id} />
            <SubmitButton
              title="Confirm delete"
              aria-label="Confirm delete"
              className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
              spinnerClassName="h-3.5 w-3.5"
            >
              <CheckIcon className="h-3.5 w-3.5" />
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => setMode("view")}
            title="Cancel"
            aria-label="Cancel"
            className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (reminder.completed) {
    return (
      <div className="flex items-start justify-between gap-2 text-sm">
        <div className="min-w-0 flex-1">
          <span className="break-words text-slate-400 line-through">{reminder.text}</span>
          {reminder.due_date && (
            <span className="mt-0.5 block text-xs text-slate-400">{formatFullDate(reminder.due_date)}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <form action={setReminderCompleted}>
            <input type="hidden" name="id" value={reminder.id} />
            <input type="hidden" name="completed" value="false" />
            <SubmitButton
              title="Restore reminder"
              aria-label="Restore reminder"
              className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text disabled:opacity-50"
              spinnerClassName="h-3.5 w-3.5"
            >
              <RestoreIcon className="h-3.5 w-3.5" />
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => setMode("delete")}
            title="Delete reminder"
            aria-label="Delete reminder"
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <DeleteIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <span className="break-words text-notion-text">{reminder.text}</span>
        {reminder.due_date && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-600">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            {formatFullDate(reminder.due_date)}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <form action={setReminderCompleted}>
          <input type="hidden" name="id" value={reminder.id} />
          <input type="hidden" name="completed" value="true" />
          <SubmitButton
            title="Mark complete"
            aria-label="Mark complete"
            className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text disabled:opacity-50"
            spinnerClassName="h-3.5 w-3.5"
          >
            <CheckIcon className="h-3.5 w-3.5" />
          </SubmitButton>
        </form>
        <button
          type="button"
          onClick={() => setMode("edit")}
          title="Edit reminder"
          aria-label="Edit reminder"
          className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
        >
          <EditIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setMode("delete")}
          title="Delete reminder"
          aria-label="Delete reminder"
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <DeleteIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const COLLAPSED_STORAGE_KEY = "orium.remindersCollapsed";

// The panel body shared between the desktop collapsible panel and the
// mobile slide-over (T89): header + add form + active/completed lists.
// T164: exported so the Calendar page can reuse the actual reminders
// CRUD/rendering without RemindersPanel's own outer chrome (a full-height
// `sticky` sidebar plus a floating mobile bell button) - that chrome is
// built specifically for the Forecast page's own right-rail layout and
// would render broken or duplicated inside a different page's flex layout.
export function RemindersContent({
  activeReminders,
  completedReminders,
  showCompleted,
  setShowCompleted,
  readOnly,
}: {
  activeReminders: ReminderRow[];
  completedReminders: ReminderRow[];
  showCompleted: boolean;
  setShowCompleted: (updater: (prev: boolean) => boolean) => void;
  readOnly?: boolean;
}) {
  // T177: order is a client-only display preference (same as every other
  // list's useOrderedList, T145) - reordering never touches the DB, so
  // there's nothing to sync across devices, matching that established
  // precedent. Drag is only offered for the active list; reordering
  // completed reminders has no real use.
  const { orderedItems: orderedActive, moveToIndex } = useOrderedList(
    "orium.remindersOrder",
    activeReminders,
    (r) => r.id,
  );
  const orderedIds = orderedActive.map((r) => r.id);
  const drag = useDragReorder(orderedIds, moveToIndex);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <h2 className="mb-3 text-sm font-semibold text-notion-text">Reminders</h2>
      {!readOnly && <AddReminderForm />}
      {orderedActive.length === 0 ? (
        <p className="text-sm text-slate-400">No reminders yet.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ul className="divide-y divide-notion-hairline">
            {orderedActive.map((reminder) => (
              <li
                key={reminder.id}
                ref={(el) => drag.registerRow(reminder.id, el)}
                className={`flex items-start gap-1 py-2 first:pt-0 ${
                  drag.draggingId === reminder.id ? "opacity-50" : ""
                }`}
              >
                {!readOnly && (
                  <button
                    type="button"
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    onPointerDown={(e) => drag.handlePointerDown(reminder.id, e)}
                    onPointerMove={(e) => drag.handlePointerMove(reminder.id, e)}
                    onPointerUp={drag.handlePointerUp}
                    onPointerCancel={drag.handlePointerUp}
                    style={{ touchAction: "none" }}
                    className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-slate-300 hover:bg-notion-hover hover:text-slate-500 active:cursor-grabbing"
                  >
                    <GripIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <ReminderItem reminder={reminder} readOnly={readOnly} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {completedReminders.length > 0 && (
        <div className="mt-3 shrink-0 border-t border-notion-hairline pt-3">
          <button
            type="button"
            onClick={() => setShowCompleted((prev) => !prev)}
            className="text-xs font-medium text-slate-400 hover:text-notion-text"
          >
            {showCompleted ? "Hide" : "Show"} completed ({completedReminders.length})
          </button>
          {showCompleted && (
            <ul className="mt-2 max-h-40 divide-y divide-notion-hairline overflow-y-auto pr-1">
              {completedReminders.map((reminder) => (
                <li key={reminder.id} className="py-2 first:pt-0">
                  <ReminderItem reminder={reminder} readOnly={readOnly} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Full-height collapsible right panel, mirroring AppShell's left sidebar
// (user request 2026-07-23: "occupy the entire right panel, like the menu
// in the left, also collapsible"). Same hydration-safe localStorage pattern
// as AppShell: `collapsed` starts `false` on both server and first client
// render, then a post-mount effect applies the stored preference, avoiding
// a server/client markup mismatch.
//
// Mobile (SPEC.md T89): the panel above is `lg`-only (it was already
// `hidden` below `lg` with no mobile access at all). Below `lg`, a small
// floating trigger - badged with the active reminder count - opens the same
// content as a right-edge MobileDrawer.
export function RemindersPanel({
  reminders,
  readOnly,
}: {
  reminders: ReminderRow[];
  readOnly?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeReminders = reminders.filter((r) => !r.completed);
  const completedReminders = reminders.filter((r) => r.completed);

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

  return (
    <>
      <aside
        data-tour="forecast-reminders"
        className={`sticky top-0 relative hidden h-screen shrink-0 flex-col border-l border-notion-hairline bg-white transition-all duration-200 lg:flex ${
          collapsed ? "w-16" : "w-72"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          title={
            collapsed
              ? `Expand reminders${activeReminders.length > 0 ? ` (${activeReminders.length})` : ""}`
              : "Collapse reminders"
          }
          aria-label={collapsed ? "Expand reminders" : "Collapse reminders"}
          className="absolute -left-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-notion-hairline bg-white text-slate-400 shadow-sm hover:bg-notion-hover hover:text-notion-text"
        >
          <ChevronIcon direction={collapsed ? "left" : "right"} className="h-3.5 w-3.5" />
        </button>
        {!collapsed && (
          <RemindersContent
            activeReminders={activeReminders}
            completedReminders={completedReminders}
            showCompleted={showCompleted}
            setShowCompleted={setShowCompleted}
            readOnly={readOnly}
          />
        )}
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={`Open reminders${activeReminders.length > 0 ? ` (${activeReminders.length})` : ""}`}
        data-tour="forecast-reminders"
        className="fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-notion-hairline bg-white text-slate-500 shadow-lg hover:text-notion-text lg:hidden"
      >
        <BellIcon className="h-5 w-5" />
        {activeReminders.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-notion-accent px-1 text-xs font-medium text-white">
            {activeReminders.length}
          </span>
        )}
      </button>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="right" widthClassName="w-80">
        <div className="flex items-center justify-end border-b border-notion-hairline p-2">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close reminders"
            className="rounded p-1.5 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <RemindersContent
          activeReminders={activeReminders}
          completedReminders={completedReminders}
          showCompleted={showCompleted}
          setShowCompleted={setShowCompleted}
          readOnly={readOnly}
        />
      </MobileDrawer>
    </>
  );
}
