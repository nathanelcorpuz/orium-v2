"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type TourStep = {
  target: string; // CSS selector, e.g. `[data-tour="dashboard-stats"]`
  title: string;
  body: string;
  // T110 bugfix (user report 2026-07-26): a single-step tour whose target
  // is the whole page (Dashboard/Forecast) has no real nav link to spotlight
  // and click - clicking "Done" on that step needs to actually take the
  // user there itself. Only used on the last step; ignored otherwise.
  href?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  // `offsetParent === null` is the usual "not display:none" check, but it's
  // also null for `position: fixed` elements (e.g. RemindersPanel's mobile
  // bell button) even when they're fully visible - checking computed style
  // directly avoids incorrectly skipping those.
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

// A step's selector may match more than one element (e.g. the same
// `data-tour` value on both the desktop and mobile versions of a panel, only
// one of which is ever visible at a given breakpoint) - the first visible
// match wins, and a step with no visible match at all gets skipped rather
// than spotlighting nothing.
function findTarget(step: TourStep): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(step.target);
  for (const el of candidates) {
    if (isVisible(el)) return el;
  }
  return null;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 12;
const TOOLTIP_MARGIN = 16;

// Hand-built spotlight tour (T98) - no tour library, per CLAUDE.md's "no new
// dependencies" rule. Dims the page behind a single small "cutout" div sized
// to the current step's target: its own oversized box-shadow paints
// everything else dark, so the target reads as highlighted without needing
// four separate dimming rectangles. Auto-shows once per `tourId` (a plain
// localStorage flag, same pattern AppShell/RemindersPanel already use for
// UI preferences - no DB column, nothing to sync across devices for a v1
// walkthrough) and steps forward/back through `steps`, silently skipping any
// step whose target isn't currently visible (e.g. a panel that only renders
// above a breakpoint) instead of getting stuck on it.
export function SpotlightTour({
  tourId,
  steps,
  onFinish,
  forceActive = false,
}: {
  tourId: string;
  steps: TourStep[];
  // Called every time the tour ends (Skip, Escape, or Done on the last
  // step) - `wasFirstCompletion` tells the caller whether this was the
  // tour's very first-ever completion (the localStorage flag hadn't been
  // set yet) versus a later replay, so a caller can react just once (e.g.
  // T102's end-of-tour "keep or reset sample data?" prompt).
  onFinish?: (wasFirstCompletion: boolean) => void;
  // T103: preview mode always replays the tour from the start, regardless
  // of whether the real account already marked it "done" - and never
  // touches that real flag while doing so, so exiting preview leaves the
  // account's actual tour-seen state exactly as it was.
  forceActive?: boolean;
}) {
  const router = useRouter();
  const storageKey = `orium.tour.${tourId}.done`;
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (forceActive || localStorage.getItem(storageKey) !== "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceActive]);

  // Read via a ref rather than a `useCallback` dependency so `finish`'s own
  // identity stays stable across parent re-renders (it feeds several other
  // effects below) even when the caller passes a fresh inline `onFinish`
  // function on every render.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const finish = useCallback(() => {
    if (forceActive) {
      setActive(false);
      onFinishRef.current?.(false);
      return;
    }
    const wasFirstCompletion = localStorage.getItem(storageKey) !== "1";
    localStorage.setItem(storageKey, "1");
    setActive(false);
    onFinishRef.current?.(wasFirstCompletion);
  }, [storageKey, forceActive]);

  useEffect(() => {
    if (!active) return;

    let index = stepIndex;
    let target = index < steps.length ? findTarget(steps[index]) : null;
    while (!target && index < steps.length - 1) {
      index += 1;
      target = findTarget(steps[index]);
    }
    if (!target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      finish();
      return;
    }
    if (index !== stepIndex) {
      setStepIndex(index);
      return; // this effect re-runs once the corrected index lands
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });

    const current = target;
    function updateRect() {
      const box = current.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    }
    updateRect();
    const raf = requestAnimationFrame(updateRect); // once more after scrollIntoView settles
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    // T110: when a step's target is itself something the user is meant to
    // click (e.g. a "click X to continue" step spotlighting a real nav
    // link), the tooltip must get out of the way the instant they do -
    // otherwise, on mobile, tapping the hamburger opens a drawer whose top
    // links land directly under this still-visible tooltip (both render
    // near the top-left corner), silently blocking the very tap the step
    // just asked for. Hiding the overlay (not finishing the tour) on the
    // target's own click, capture-phase so it fires before the target's own
    // handler navigates away, fixes that without touching "done" state.
    //
    // Bugfix (user report 2026-07-26): a whole-page target (e.g. Dashboard's
    // single-step tour, `data-tour="dashboard-content"`) has this tour's own
    // tooltip/buttons rendered *inside* it in the DOM (fixed positioning
    // only changes layout, not tree position) - so clicking "Done" itself
    // was triggering this same capture-phase handler first, hiding the
    // tooltip (unmounting the very button being clicked) before its own
    // onClick ever ran. Ignoring clicks that originate inside the tooltip
    // fixes that without weakening the mobile-drawer case above, since the
    // real nav link/hamburger there is never inside the tooltip.
    function hideOnTargetClick(e: MouseEvent) {
      if (tooltipRef.current?.contains(e.target as Node)) return;
      setRect(null);
    }
    current.addEventListener("click", hideOnTargetClick, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      current.removeEventListener("click", hideOnTargetClick, true);
    };
  }, [active, stepIndex, steps, finish]);

  useEffect(() => {
    if (!active) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [active, finish]);

  if (!active || !rect) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const tooltipWidth = Math.min(TOOLTIP_WIDTH, viewportW - TOOLTIP_MARGIN * 2);
  const spaceBelow = viewportH - (rect.top + rect.height);
  const placeAbove = spaceBelow < 180 && rect.top > 180;
  const tooltipLeft = Math.min(
    Math.max(rect.left, TOOLTIP_MARGIN),
    viewportW - tooltipWidth - TOOLTIP_MARGIN,
  );
  // A target that spans (near) the full viewport height - e.g. the
  // Reminders panel's full-height sticky aside - leaves neither "below" nor
  // "above" with real room, so the plain above/below formula below can land
  // the tooltip off-screen entirely. Clamping the final top into the
  // viewport (minus a rough height estimate, since the box's real height
  // isn't known until it's painted) keeps it visible in that case without
  // needing a fully separate layout branch for tall targets.
  const ESTIMATED_TOOLTIP_HEIGHT = 190;
  const preferredTop = placeAbove
    ? rect.top - TOOLTIP_GAP - ESTIMATED_TOOLTIP_HEIGHT
    : rect.top + rect.height + TOOLTIP_GAP;
  const tooltipTop = Math.min(
    Math.max(preferredTop, TOOLTIP_MARGIN),
    viewportH - TOOLTIP_MARGIN - ESTIMATED_TOOLTIP_HEIGHT,
  );

  return (
    // T110: `pointer-events-none` on the full-screen wrapper (with
    // `pointer-events-auto` restored just on the tooltip card below) lets
    // clicks reach the real page underneath - needed so a "click the
    // highlighted nav link to continue" step actually works, since that
    // link lives under the spotlighted area, not inside the tour's own UI.
    // Skip/Back/Next/Done still work because the tooltip card opts back in.
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <div
        className="pointer-events-none absolute rounded-lg ring-2 ring-white transition-all duration-200"
        style={{
          top: rect.top - SPOTLIGHT_PADDING,
          left: rect.left - SPOTLIGHT_PADDING,
          width: rect.width + SPOTLIGHT_PADDING * 2,
          height: rect.height + SPOTLIGHT_PADDING * 2,
          boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65)",
        }}
      />
      <div
        ref={tooltipRef}
        className="pointer-events-auto absolute rounded-lg border border-notion-hairline bg-white p-4 shadow-xl"
        style={{
          width: tooltipWidth,
          left: tooltipLeft,
          top: tooltipTop,
        }}
      >
        <p className="text-xs font-medium text-slate-400">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-notion-text">{step.title}</h3>
        <p className="mt-1 text-sm text-slate-500">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={finish} className="text-xs text-slate-400 hover:text-notion-text">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className="rounded border border-notion-hairline px-3 py-1.5 text-xs text-notion-text hover:bg-notion-hover"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!isLast) {
                  setStepIndex((i) => i + 1);
                  return;
                }
                finish();
                if (step.href) router.push(step.href);
              }}
              className="rounded bg-notion-text px-3 py-1.5 text-xs text-white hover:opacity-90"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
