"use client";

import { DeleteIcon, EditIcon } from "@/components/navIcons";

// T231: Edit and Delete as icon buttons rather than text pills, on every
// finance list row (Bills, Income, Debt, Savings, Misc). Same treatment the
// Accounts page already applies to its own less-frequent management actions
// (T189), for the same reason given there: several equally-loud text buttons
// per row read as clutter, and at 375px they left the name and amount
// fighting for what was left of the row.
//
// The Switch off/on control deliberately stays a text button beside these -
// it reports state as much as it offers an action, and no icon says
// "included in the forecast" unambiguously.
export function RowIconActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onEdit}
        title="Edit"
        aria-label="Edit"
        className="rounded p-1.5 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
      >
        <EditIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Delete"
        aria-label="Delete"
        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
      >
        <DeleteIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
