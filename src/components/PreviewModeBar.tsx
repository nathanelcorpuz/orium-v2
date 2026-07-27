import Link from "next/link";

// T103: shown on Dashboard/Forecast whenever `?preview=1` is active - the
// one visible, persistent signal that the numbers on screen are a sample
// fixture, not the user's real account, plus the documented way out. Exits
// to a plain `/` (no query param), which drops straight back to real data.
export function PreviewModeBar() {
  return (
    // T124: `data-preview-bar` lets SpotlightTour measure this bar's height,
    // so a tour step's card is never positioned underneath it. User
    // correction (2026-07-26): this bar is deliberately *not* exempted from
    // the tour's dim overlay - it greys out with everything else the tour
    // isn't currently pointing at, same as any other page content.
    <div
      data-preview-bar
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-notion-text px-4 py-2 text-sm text-white"
    >
      <span>You&apos;re previewing sample data - nothing here is saved to your real account.</span>
      <Link
        href="/"
        className="shrink-0 rounded border border-white/40 px-3 py-1 hover:bg-white/10"
      >
        Exit preview
      </Link>
    </div>
  );
}
