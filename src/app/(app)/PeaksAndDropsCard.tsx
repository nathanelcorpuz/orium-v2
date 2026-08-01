"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { formatCentavos } from "@/lib/money";
import { formatMonthYear } from "@/lib/date";
import { balanceRangeColorClass } from "@/lib/balanceColor";

type MonthEntry = { month: string; peak: number; drop: number };
type YearGroup = { year: number; months: MonthEntry[] };

const MAX_BAR_HEIGHT = 96;

// Lazy loading (user request 2026-08-01): with T171's 50-year tracking
// horizon, this card could otherwise render up to 50 year-groups (600
// month-cards) into the DOM at once for a card that only ever shows a
// ~260-420px scrollable window. Same incremental-reveal shape the Forecast
// table already established (ForecastClient.tsx's INITIAL_VISIBLE_ROWS/
// ROWS_PER_BATCH/IntersectionObserver) - batched by year here rather than
// by row, since a year-group is this card's own natural unit.
const INITIAL_VISIBLE_YEARS = 3;
const YEARS_PER_BATCH = 3;

// T117 (user request 2026-07-26): a second, toggleable view of the same
// peaks-and-drops data as a bar chart, alongside the existing T63 month-card
// grid - a Grid/Graph switch on the card itself rather than a second entry in
// the Dashboard widget panel, since it's one widget's view mode, not a
// separate widget. No chart library (none in package.json, and CLAUDE.md's
// "no new dependencies" rule rules one out) - plain CSS bars, matching
// ProgressBar.tsx's existing hand-rolled precedent.
//
// Bar height is magnitude only (`Math.abs`), scaled against the largest
// value anywhere in view so every month is comparable on one shared axis;
// which tier a value falls in (danger/low/.../highest) is carried by color,
// the same `balanceRangeColorClass` the grid view and every other balance
// figure in the app already use - keeping one meaning for color everywhere
// rather than introducing a second, conflicting palette for "Peak vs Drop"
// identity. Peak/Drop identity itself is carried by position (always left/
// right) plus the legend line, not color, so it's never color-alone.
export function PeaksAndDropsCard({
  peaksAndDropsByYear,
  balanceRanges,
  currency,
  hasAnyFinancialData,
}: {
  peaksAndDropsByYear: YearGroup[];
  balanceRanges: number[];
  currency: string;
  hasAnyFinancialData: boolean;
}) {
  const [view, setView] = useState<"grid" | "graph">("grid");
  const [visibleYearCount, setVisibleYearCount] = useState(INITIAL_VISIBLE_YEARS);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const visibleYears = useMemo(
    () => peaksAndDropsByYear.slice(0, visibleYearCount),
    [peaksAndDropsByYear, visibleYearCount],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleYearCount((count) => Math.min(count + YEARS_PER_BATCH, peaksAndDropsByYear.length));
        }
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // Re-attaches on `view` too - switching Grid/Graph mounts a new
    // scrollable container (a different DOM node), so the observer has to
    // re-bind to whichever one is current.
  }, [peaksAndDropsByYear.length, view]);

  return (
    <div className="mb-6 rounded-lg border border-notion-hairline bg-white" data-tour="dashboard-peaks-drops">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
        <h2 className="text-sm font-semibold text-notion-text">Peaks and Drops</h2>
        {hasAnyFinancialData && (
          <div className="w-32">
            <SegmentedControl
              options={[
                { value: "grid" as const, label: "Grid" },
                { value: "graph" as const, label: "Graph" },
              ]}
              value={view}
              onChange={setView}
            />
          </div>
        )}
      </div>
      {!hasAnyFinancialData ? (
        // The grid itself is hidden, not just captioned: every month would
        // render a ₱0.00 peak and drop, and ₱0 is the danger tier, so an
        // empty account produced a wall of black "danger" pills.
        <p className="px-4 pb-4 text-sm text-slate-500">
          Nothing to chart yet. Once you have money coming in and going out, this shows your
          highest and lowest balance for every month ahead.
        </p>
      ) : view === "grid" ? (
        <div ref={scrollContainerRef} className="max-h-64 space-y-4 overflow-y-auto p-4 pt-2 md:max-h-[420px]">
          {visibleYears.map(({ year, months }) => (
            <div key={year}>
              <p className="mb-2 text-sm font-medium text-notion-text">{year}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {months.map((entry) => (
                  <div key={entry.month} className="rounded border border-notion-hairline p-2 text-right text-xs">
                    <p className="mb-1 text-slate-400">{formatMonthYear(entry.month)}</p>
                    <p>
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 ${balanceRangeColorClass(entry.peak, balanceRanges)}`}
                      >
                        {formatCentavos(entry.peak, currency)}
                      </span>
                    </p>
                    <p className="mt-1">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 ${balanceRangeColorClass(entry.drop, balanceRanges)}`}
                      >
                        {formatCentavos(entry.drop, currency)}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {visibleYearCount < peaksAndDropsByYear.length && (
            <div ref={sentinelRef} className="text-center text-xs text-slate-400">
              Loading more…
            </div>
          )}
        </div>
      ) : (
        <div ref={scrollContainerRef} className="max-h-64 space-y-4 overflow-y-auto p-4 pt-2 md:max-h-[420px]">
          <p className="text-xs text-slate-400">Each month: peak on the left, drop on the right.</p>
          {visibleYears.map(({ year, months }) => {
            // Scaled per year, not against the whole horizon: a household's
            // balance typically trends upward over a multi-year forecast, so
            // a single shared scale would shrink an early, more troubled
            // year's bars down to slivers next to a much larger later year -
            // exactly the "spot trouble early" moments this view exists for.
            // Each year block is still internally one axis (no dual-scale
            // chart), just not the same axis as its neighbors.
            const yearMaxAbs = Math.max(
              1,
              ...months.flatMap((m) => [Math.abs(m.peak), Math.abs(m.drop)]),
            );
            return (
              <div key={year}>
                <p className="mb-2 text-sm font-medium text-notion-text">{year}</p>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {months.map((entry) => (
                    <div key={entry.month} className="flex w-10 shrink-0 flex-col items-center gap-1">
                      <div className="flex items-end gap-0.5" style={{ height: MAX_BAR_HEIGHT }}>
                        <div
                          title={`Peak: ${formatCentavos(entry.peak, currency)}`}
                          className={`w-3.5 rounded-t border border-notion-hairline ${balanceRangeColorClass(entry.peak, balanceRanges)}`}
                          style={{ height: Math.max(2, (Math.abs(entry.peak) / yearMaxAbs) * MAX_BAR_HEIGHT) }}
                        />
                        <div
                          title={`Drop: ${formatCentavos(entry.drop, currency)}`}
                          className={`w-3.5 rounded-t border border-notion-hairline ${balanceRangeColorClass(entry.drop, balanceRanges)}`}
                          style={{ height: Math.max(2, (Math.abs(entry.drop) / yearMaxAbs) * MAX_BAR_HEIGHT) }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">{formatMonthYear(entry.month).split(" ")[0]}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {visibleYearCount < peaksAndDropsByYear.length && (
            <div ref={sentinelRef} className="text-center text-xs text-slate-400">
              Loading more…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
