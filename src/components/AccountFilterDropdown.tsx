"use client";

import { useEffect, useRef, useState } from "react";
import { accountFilterOptions, type BalanceOptionLike } from "@/lib/accountFilter";

// T206 (user request): the account filter on Bills/Income/Debt/Savings/Misc
// was an always-expanded row of chips (MultiSelectChips) - fine for a
// handful of accounts, but it grows with the account list and stands out
// next to the compact `<select>` dropdowns the rest of the filter bar
// already uses (AmountRangeFilter's operator, AmountSortControl). This
// keeps the same multi-select behavior (more than one account at once is a
// real thing to want) but behind a closed-by-default dropdown, styled to
// match those selects rather than the chip row.
export function AccountFilterDropdown({
  balances,
  selected,
  onToggle,
}: {
  balances: BalanceOptionLike[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const options = accountFilterOptions(balances);
  const label =
    selected.size === 0
      ? "All accounts"
      : selected.size === 1
        ? (options.find((option) => selected.has(option.value))?.label ?? "1 account")
        : `${selected.size} accounts`;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label className="text-xs text-slate-500">Account</label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="rounded border border-notion-hairline bg-white px-1.5 py-1 text-left text-xs text-notion-text focus:border-notion-accent focus:outline-none"
      >
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 max-h-48 min-w-[10rem] overflow-auto rounded border border-notion-hairline bg-white p-1.5 shadow-md">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-1.5 rounded px-1 py-1 text-xs text-notion-text hover:bg-notion-hover"
            >
              <input
                type="checkbox"
                checked={selected.has(option.value)}
                onChange={() => onToggle(option.value)}
                className="h-3.5 w-3.5"
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
