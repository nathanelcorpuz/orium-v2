"use client";

// Shared comparison/range filter for money fields (SPEC.md T50, reused by
// T52's category-page filters). Values are plain numbers in the currency's
// major unit (pesos) as typed by the user - the caller converts to/from
// centavos via matchesAmountFilter below, keeping this component money-shape
// agnostic.
export type ComparisonOp = "any" | "lt" | "gt" | "between";

const OPERATOR_OPTIONS: { value: ComparisonOp; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "lt", label: "Less than" },
  { value: "gt", label: "Greater than" },
  { value: "between", label: "Between" },
];

export function AmountRangeFilter({
  label,
  op,
  value1,
  value2,
  onOpChange,
  onValue1Change,
  onValue2Change,
}: {
  label: string;
  op: ComparisonOp;
  value1: string;
  value2: string;
  onOpChange: (op: ComparisonOp) => void;
  onValue1Change: (value: string) => void;
  onValue2Change: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500">{label}</label>
      <div className="flex items-center gap-1">
        <select
          value={op}
          onChange={(event) => onOpChange(event.target.value as ComparisonOp)}
          className="rounded border border-notion-hairline bg-white px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
        >
          {OPERATOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {op !== "any" && (
          <input
            type="number"
            value={value1}
            onChange={(event) => onValue1Change(event.target.value)}
            placeholder="0.00"
            className="w-20 rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
          />
        )}
        {op === "between" && (
          <>
            <span className="text-xs text-slate-400">–</span>
            <input
              type="number"
              value={value2}
              onChange={(event) => onValue2Change(event.target.value)}
              placeholder="0.00"
              className="w-20 rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </>
        )}
      </div>
    </div>
  );
}

// centavos is the row's actual signed value; value1/value2 are the raw peso
// strings from the two inputs above. An empty/unparseable bound is treated
// as unbounded on that side, so "between 500 and <blank>" behaves as ">= 500".
export function matchesAmountFilter(
  centavos: number,
  op: ComparisonOp,
  value1: string,
  value2: string,
): boolean {
  if (op === "any") return true;
  const v1 = Math.round(parseFloat(value1) * 100);
  if (op === "lt") return !Number.isNaN(v1) && centavos < v1;
  if (op === "gt") return !Number.isNaN(v1) && centavos > v1;
  const v2 = Math.round(parseFloat(value2) * 100);
  const lo = Number.isNaN(v1) ? -Infinity : v1;
  const hi = Number.isNaN(v2) ? Infinity : v2;
  return centavos >= lo && centavos <= hi;
}
