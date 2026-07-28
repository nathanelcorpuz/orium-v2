"use client";

import { ChevronIcon } from "@/components/navIcons";

// T145: small up/down pair for reordering a row within useOrderedList's
// persisted order. isFirst/isLast disable the edge case instead of hiding
// it, so the row's action-button layout doesn't shift width depending on
// position in the list.
export function ReorderButtons({
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={isFirst}
        aria-label="Move up"
        title="Move up"
        className="rounded p-0.5 text-slate-400 hover:bg-notion-hover hover:text-notion-text disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronIcon direction="up" className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={isLast}
        aria-label="Move down"
        title="Move down"
        className="rounded p-0.5 text-slate-400 hover:bg-notion-hover hover:text-notion-text disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <ChevronIcon direction="down" className="h-3 w-3" />
      </button>
    </div>
  );
}
