// Shared pill-style segmented control (SPEC.md T28 base components) - was
// ad-hoc buttons duplicated across BudgetModal.tsx's replenish-source
// toggle and EditSettleModal.tsx's Edit/Settle toggle before T28.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-full border px-3 py-1.5 text-center text-sm ${
            value === option.value
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
