"use client";

// Feature (user request 2026-08-08): the one persistent, unmissable signal
// that a hypothetical fund move/add/take is currently shaping every number
// on the Forecast page - same "sticky top bar" convention PreviewModeBar/
// ScenarioModeBar already use, blue rather than amber/black so it reads as
// its own distinct state at a glance.
export function PreviewChangeBar({
  description,
  applying,
  error,
  onDiscard,
  onApply,
}: {
  description: string;
  applying: boolean;
  error: string | null;
  onDiscard: () => void;
  onApply: () => void;
}) {
  return (
    <div className="sticky top-0 z-40 bg-blue-600 px-4 py-1.5 text-sm text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{description} - nothing is saved yet.</span>
        <div className="flex shrink-0 items-center gap-2">
          {error && <span className="text-xs text-red-100">{error}</span>}
          <button
            type="button"
            onClick={onDiscard}
            disabled={applying}
            className="rounded border border-white/40 px-2 py-0.5 text-xs hover:bg-white/10 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            className="rounded bg-white px-2 py-0.5 text-xs font-medium text-blue-700 hover:opacity-90 disabled:opacity-50"
          >
            {applying ? "Applying..." : "Apply for real"}
          </button>
        </div>
      </div>
    </div>
  );
}
