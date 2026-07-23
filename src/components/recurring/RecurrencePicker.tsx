"use client";

import { useMemo, useState } from "react";
import type { RecurrenceEndsType, RecurrenceUnit } from "@/lib/engine/types";
import { computeRecurrencePresets, type RecurrenceShape } from "@/lib/recurrencePresets";

export type RecurrenceValue = RecurrenceShape & {
  endsType: RecurrenceEndsType;
  endDate: string | null;
  occurrenceCount: number | null;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDINAL_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: -1, label: "Last" },
];
const UNIT_OPTIONS: { value: RecurrenceUnit; label: string }[] = [
  { value: "day", label: "day(s)" },
  { value: "week", label: "week(s)" },
  { value: "month", label: "month(s)" },
  { value: "year", label: "year(s)" },
];
const ENDS_OPTIONS: { value: RecurrenceEndsType; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "on_date", label: "On date" },
  { value: "after_count", label: "After N times" },
];

const PILL_BASE = "rounded-full border px-3 py-1 text-sm";
const PILL_ON = `${PILL_BASE} border-notion-text bg-notion-text text-white`;
const PILL_OFF = `${PILL_BASE} border-notion-hairline text-slate-600 hover:bg-notion-hover`;
const CHIP_BASE = "rounded border px-2 py-1 text-sm";
const CHIP_ON = `${CHIP_BASE} border-notion-text bg-notion-text text-white`;
const CHIP_OFF = `${CHIP_BASE} border-notion-hairline text-slate-600 hover:bg-notion-hover`;
const INPUT = "rounded border border-notion-hairline p-1 text-notion-text focus:border-notion-accent focus:outline-none";

/**
 * Shared recurrence rule editor (SPEC.md T35), used by Bills/Income/Debt/
 * Savings (and eventually Budgets, T38). Renders preset buttons + a custom
 * panel + an always-visible Ends control, then mirrors the current value
 * into hidden inputs so it works with the app's plain Server Action forms
 * with no client-side submit handler of its own - readRecurrenceRuleForm
 * (recurrenceForm.ts) reads these same field names on the server.
 *
 * `startDate` is owned by the parent form (its own visible Start Date
 * field) and passed in here just to compute contextual preset labels.
 */
export function RecurrencePicker({
  startDate,
  initialValue,
}: {
  startDate: string;
  initialValue?: RecurrenceValue | null;
}) {
  const presets = useMemo(() => computeRecurrencePresets(startDate), [startDate]);

  const [value, setValue] = useState<RecurrenceValue>(() =>
    initialValue ?? { ...presets[0].rule, endsType: "on_date", endDate: null, occurrenceCount: null },
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    if (!initialValue) return presets[0].id;
    const match = presets.find(
      (p) =>
        p.rule.interval === initialValue.interval &&
        p.rule.unit === initialValue.unit &&
        p.rule.ordinal === initialValue.ordinal &&
        p.rule.ordinalWeekday === initialValue.ordinalWeekday &&
        JSON.stringify([...(p.rule.weekdays ?? [])].sort()) ===
          JSON.stringify([...(initialValue.weekdays ?? [])].sort()) &&
        JSON.stringify([...(p.rule.daysOfMonth ?? [])].sort((a, b) => a - b)) ===
          JSON.stringify([...(initialValue.daysOfMonth ?? [])].sort((a, b) => a - b)),
    );
    return match ? match.id : "custom";
  });

  const monthMode = value.ordinal !== null ? "ordinal" : "days";

  function selectPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(presetId);
    setValue((v) => ({ ...v, ...preset.rule }));
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 block text-sm text-slate-600">Repeats</p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              type="button"
              key={preset.id}
              onClick={() => selectPreset(preset.id)}
              className={selectedPresetId === preset.id ? PILL_ON : PILL_OFF}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedPresetId("custom")}
            className={selectedPresetId === "custom" ? PILL_ON : PILL_OFF}
          >
            Custom…
          </button>
        </div>
      </div>

      {selectedPresetId === "custom" && (
        <div className="space-y-3 rounded border border-notion-hairline p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Repeat every</span>
            <input
              type="number"
              min={1}
              value={value.interval}
              onChange={(e) =>
                setValue((v) => ({ ...v, interval: Math.max(1, Number(e.target.value) || 1) }))
              }
              className={`w-16 ${INPUT}`}
            />
            <select
              value={value.unit}
              onChange={(e) =>
                setValue((v) => ({
                  ...v,
                  unit: e.target.value as RecurrenceUnit,
                  weekdays: null,
                  daysOfMonth: null,
                  ordinal: null,
                  ordinalWeekday: null,
                }))
              }
              className={INPUT}
            >
              {UNIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {value.unit === "week" && (
            <div>
              <p className="mb-1 text-sm text-slate-600">On</p>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_LABELS.map((label, weekday) => {
                  const selected = value.weekdays?.includes(weekday) ?? false;
                  return (
                    <button
                      type="button"
                      key={weekday}
                      onClick={() =>
                        setValue((v) => {
                          const current = v.weekdays ?? [];
                          return {
                            ...v,
                            weekdays: selected
                              ? current.filter((d) => d !== weekday)
                              : [...current, weekday],
                          };
                        })
                      }
                      className={selected ? CHIP_ON : CHIP_OFF}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.unit === "month" && (
            <div className="space-y-2">
              <div className="flex gap-3 text-sm">
                <button
                  type="button"
                  onClick={() =>
                    setValue((v) => ({ ...v, daysOfMonth: v.daysOfMonth ?? [1], ordinal: null, ordinalWeekday: null }))
                  }
                  className={monthMode === "days" ? "font-semibold text-notion-text underline" : "text-slate-500"}
                >
                  On day(s)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setValue((v) => ({ ...v, daysOfMonth: null, ordinal: v.ordinal ?? 1, ordinalWeekday: v.ordinalWeekday ?? 0 }))
                  }
                  className={monthMode === "ordinal" ? "font-semibold text-notion-text underline" : "text-slate-500"}
                >
                  On a weekday pattern
                </button>
              </div>

              {monthMode === "days" ? (
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const selected = value.daysOfMonth?.includes(day) ?? false;
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() =>
                          setValue((v) => {
                            const current = v.daysOfMonth ?? [];
                            return {
                              ...v,
                              daysOfMonth: selected ? current.filter((d) => d !== day) : [...current, day],
                            };
                          })
                        }
                        className={`${selected ? CHIP_ON : CHIP_OFF} px-1 py-1 text-xs`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={value.ordinal ?? 1}
                    onChange={(e) => setValue((v) => ({ ...v, ordinal: Number(e.target.value) }))}
                    className={INPUT}
                  >
                    {ORDINAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={value.ordinalWeekday ?? 0}
                    onChange={(e) => setValue((v) => ({ ...v, ordinalWeekday: Number(e.target.value) }))}
                    className={INPUT}
                  >
                    {WEEKDAY_LABELS.map((label, weekday) => (
                      <option key={weekday} value={weekday}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-1 text-sm text-slate-600">Ends</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-3 text-sm">
            {ENDS_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setValue((v) => ({ ...v, endsType: opt.value }))}
                className={value.endsType === opt.value ? "font-semibold text-notion-text underline" : "text-slate-500"}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {value.endsType === "on_date" && (
            <input
              type="date"
              value={value.endDate ?? ""}
              onChange={(e) => setValue((v) => ({ ...v, endDate: e.target.value || null }))}
              className={INPUT}
            />
          )}
          {value.endsType === "after_count" && (
            <input
              type="number"
              min={1}
              placeholder="Number of times"
              value={value.occurrenceCount ?? ""}
              onChange={(e) =>
                setValue((v) => ({ ...v, occurrenceCount: e.target.value ? Number(e.target.value) : null }))
              }
              className={`w-40 ${INPUT}`}
            />
          )}
        </div>
      </div>

      <input type="hidden" name="interval" value={value.interval} />
      <input type="hidden" name="unit" value={value.unit} />
      {(value.weekdays ?? []).map((w) => (
        <input key={w} type="hidden" name="weekdays" value={w} />
      ))}
      {(value.daysOfMonth ?? []).map((d) => (
        <input key={d} type="hidden" name="daysOfMonth" value={d} />
      ))}
      <input type="hidden" name="ordinal" value={value.ordinal ?? ""} />
      <input type="hidden" name="ordinalWeekday" value={value.ordinalWeekday ?? ""} />
      <input type="hidden" name="endsType" value={value.endsType} />
      <input type="hidden" name="endDate" value={value.endDate ?? ""} />
      <input type="hidden" name="occurrenceCount" value={value.occurrenceCount ?? ""} />
    </div>
  );
}
