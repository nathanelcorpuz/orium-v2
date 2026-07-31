"use client";

import { toggleRecordActive } from "@/app/(app)/toggleActive";
import { SubmitButton } from "@/components/SubmitButton";

// T175 (SPEC.md Phase 22): switch a financial record off without deleting it,
// to see what the forecast looks like without it. Shared across Bills,
// Income, Debt, Savings, Misc and Budgets - the row markup differs per page
// but the control does not.
//
// A disabled item stays visible in its list (muted, per the task's own
// scoping) rather than being hidden: an item you can't find is an item you
// can't switch back on.
export function ActiveToggle({
  kind,
  id,
  active,
}: {
  kind: "recurring" | "one_off" | "budget";
  id: string;
  active: boolean;
}) {
  return (
    <form action={toggleRecordActive}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      {/* Submits the value to apply rather than "flip it", so a double
          submit is idempotent. */}
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <SubmitButton
        className={`rounded border px-2 py-1 text-xs ${
          active
            ? "border-notion-hairline text-slate-500 hover:bg-notion-hover"
            : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
        }`}
        title={
          active
            ? "Temporarily switch off - hides it from the forecast without deleting it"
            : "Switch back on - include it in the forecast again"
        }
      >
        {active ? "Switch off" : "Switch on"}
      </SubmitButton>
    </form>
  );
}
