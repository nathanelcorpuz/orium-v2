"use client";

import { useActionState } from "react";
import { centavosToPesosString } from "@/lib/money";
import { updatePreferences, type SettingsActionState } from "./actions";

const initialState: SettingsActionState = { error: null };

const THRESHOLDS: { key: string; label: string }[] = [
  { key: "danger", label: "Danger (at or below)" },
  { key: "low", label: "Low (at or below)" },
  { key: "medium", label: "Medium (at or below)" },
  { key: "high", label: "High (at or below)" },
  { key: "higher", label: "Higher (at or below, above = highest)" },
];

export function PreferencesForm({
  currency,
  balanceRanges,
}: {
  currency: string;
  balanceRanges: number[];
}) {
  const [state, formAction, pending] = useActionState(updatePreferences, initialState);

  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Preferences</h2>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-600" htmlFor="currency">
            Currency symbol
          </label>
          <input
            id="currency"
            name="currency"
            type="text"
            required
            maxLength={5}
            defaultValue={currency}
            className="mt-1 w-24 rounded border border-slate-300 p-2"
          />
        </div>

        <div>
          <p className="mb-2 text-sm text-slate-600">
            Balance color thresholds ({currency}) &mdash; each must be greater than or equal to
            the one before it.
          </p>
          <div className="space-y-2">
            {THRESHOLDS.map((threshold, index) => (
              <div key={threshold.key} className="flex items-center gap-2">
                <label className="w-64 text-sm text-slate-600" htmlFor={threshold.key}>
                  {threshold.label}
                </label>
                <input
                  id={threshold.key}
                  name={threshold.key}
                  type="number"
                  step="0.01"
                  required
                  defaultValue={centavosToPesosString(balanceRanges[index] ?? 0)}
                  className="w-32 rounded border border-slate-300 p-2"
                />
              </div>
            ))}
          </div>
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && !state.error && <p className="text-sm text-green-700">{state.message}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save preferences"}
        </button>
      </form>
    </div>
  );
}
