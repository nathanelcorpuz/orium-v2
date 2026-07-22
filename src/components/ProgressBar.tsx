// Shared budget-cycle progress bar (SPEC.md T28 base components) - was
// duplicated near-identically across BudgetCard.tsx, BudgetsPanel.tsx, and
// the Dashboard's budget card before T28.
export function ProgressBar({
  percent,
  over,
  className = "h-1.5",
}: {
  percent: number;
  over: boolean;
  className?: string;
}) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className={`h-full ${over ? "bg-red-500" : "bg-teal-600"}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
