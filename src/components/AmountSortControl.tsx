"use client";

// T143 (user request): ascending/descending amount sort for finance lists,
// reusing AmountRangeFilter's exact select styling so it reads as part of
// the same filter bar rather than a bolted-on control. Sorts by magnitude
// (Math.abs), not raw signed value - bills/debt are always stored negative,
// so a signed sort would put the *largest* bill first under "ascending",
// which doesn't match what's shown on screen (every row displays its
// amount as a positive number).
export type SortOrder = "none" | "asc" | "desc";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "none", label: "Default" },
  { value: "asc", label: "Low to high" },
  { value: "desc", label: "High to low" },
];

export function AmountSortControl({
  label = "Sort by amount",
  value,
  onChange,
}: {
  label?: string;
  value: SortOrder;
  onChange: (value: SortOrder) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as SortOrder)}
        className="rounded border border-notion-hairline bg-white px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function sortByAmount<T>(items: T[], order: SortOrder, getAmount: (item: T) => number): T[] {
  if (order === "none") return items;
  return [...items].sort((a, b) => {
    const diff = Math.abs(getAmount(a)) - Math.abs(getAmount(b));
    return order === "asc" ? diff : -diff;
  });
}
