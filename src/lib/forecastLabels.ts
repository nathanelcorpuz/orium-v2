import type { ForecastRow } from "./engine/types";

// Display labels and colors for a forecast row's type.
//
// T158 moved these out of `forecast/ForecastClient.tsx`, where they lived as
// file-local constants, so `EditSettleModal.tsx` can show the same type label
// in its detail panel. Importing them from `ForecastClient` directly would be
// circular - that file imports the modal - and copying them is what caused
// Bug #12 (two implementations of the same thing, one silently left behind).
//
// T106: user-facing display only. The underlying `type: "extra"` value
// (schema, engine, filter state) is unchanged; this is the single place that
// maps it to "misc" for display.
export const TYPE_LABEL: Record<ForecastRow["type"], string> = {
  income: "income",
  debt: "debt",
  savings: "savings",
  extra: "misc",
  bill: "bill",
  budget: "budget",
};

export const TYPE_COLOR: Record<ForecastRow["type"], string> = {
  income: "text-green-700",
  debt: "text-orange-700",
  savings: "text-blue-700",
  extra: "text-purple-700",
  bill: "text-notion-text",
  budget: "text-notion-budget",
};
