"use client";

// Generic multi-select toggle chips (SPEC.md T50, reused by T52) - same pill
// visual language as SegmentedControl.tsx, but any number of options can be
// active at once instead of exactly one.
export function MultiSelectChips<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: Set<T>;
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onToggle(option.value)}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            selected.has(option.value)
              ? "border-notion-text bg-notion-text text-white"
              : "border-notion-hairline text-slate-600 hover:bg-notion-hover"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
