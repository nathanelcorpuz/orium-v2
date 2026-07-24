"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatFullDate, MONTH_ABBR } from "@/lib/date";

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseDateStr(value: string): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month: month - 1, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

const YEAR_RANGE = 20; // current year +/- this many, generous enough for any real Orium date

// T79 (SPEC.md): shared date-picker replacing every native `<input
// type="date">` in the app, so the visible field can show the app's
// established human-readable format ("Jun 1, 1995" - src/lib/date.ts)
// instead of the browser's own locale format, which no native date input
// can be made to display. Deliberately pick-only, no manual typing - avoids
// needing a date-string parser, and keeps this small component simple to
// maintain (CLAUDE.md: beginner-coder-maintained codebase).
//
// Supports both usage patterns already in the codebase: controlled
// (`value`+`onChange`, for callers that react to the date - e.g.
// RecurrencePicker computing presets from a start date) and uncontrolled
// (`defaultValue` only, for plain Server Action forms that just read
// FormData on submit). When `name` is given, a hidden `<input
// type="date">` mirrors the current value under that name - same "mirror
// into a hidden input" pattern RecurrencePicker.tsx already established, so
// no server action anywhere needs to change. Hidden inputs are barred from
// HTML5 constraint validation by spec, so `required` here is a visual cue
// only (unfilled placeholder) - actual required-ness is enforced
// server-side, same as RecurrencePicker's own hidden fields already are.
export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required = false,
  placeholder = "Select date",
  className = "",
  ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const current = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const today = new Date();
  const seed = parseDateStr(current) ?? { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
  const [viewYear, setViewYear] = useState(seed.year);
  const [viewMonth, setViewMonth] = useState(seed.month);

  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const inputId = id ?? reactId;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openPicker() {
    const parsed = parseDateStr(current);
    setViewYear(parsed?.year ?? today.getFullYear());
    setViewMonth(parsed?.month ?? today.getMonth());
    setOpen(true);
  }

  function selectDay(day: number) {
    const next = toDateStr(viewYear, viewMonth, day);
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
    setOpen(false);
  }

  function changeMonth(delta: number) {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  }

  const selected = parseDateStr(current);
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const yearOptions = Array.from(
    { length: YEAR_RANGE * 2 + 1 },
    (_, i) => today.getFullYear() - YEAR_RANGE + i,
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={inputId}
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${
          className ||
          "w-full rounded border border-notion-hairline p-2 text-left focus:border-notion-accent focus:outline-none"
        } ${current ? "text-notion-text" : "text-slate-400"}`}
      >
        {current ? formatFullDate(current) : placeholder}
        {required && !current && " *"}
      </button>
      {name && <input type="hidden" name={name} value={current} />}

      {open && (
        <div
          role="dialog"
          className="absolute z-20 mt-1 w-64 rounded border border-notion-hairline bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Previous month"
              className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
            >
              ‹
            </button>
            <div className="flex gap-1">
              <select
                value={viewMonth}
                onChange={(event) => setViewMonth(Number(event.target.value))}
                className="rounded border border-notion-hairline p-1 text-sm text-notion-text"
              >
                {MONTH_ABBR.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(event) => setViewYear(Number(event.target.value))}
                className="rounded border border-notion-hairline p-1 text-sm text-notion-text"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="Next month"
              className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-slate-400">
            {WEEKDAY_HEADERS.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, index) => {
              if (day === null) return <div key={`empty-${index}`} />;
              const isSelected =
                selected?.year === viewYear && selected.month === viewMonth && selected.day === day;
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => selectDay(day)}
                  className={`rounded p-1.5 text-xs ${
                    isSelected
                      ? "bg-notion-text text-white"
                      : "text-notion-text hover:bg-notion-hover"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
