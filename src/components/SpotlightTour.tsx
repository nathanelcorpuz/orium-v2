"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export type TourStep = {
  // T117 (user request 2026-07-26): a step with no `target` is a "center"
  // step - full-screen dim, no spotlighted cutout, message centered on
  // screen. Used for the tour's opening line, which isn't about any one
  // element.
  target?: string; // CSS selector, e.g. `[data-tour="nav-accounts"]`
  // T117: when true, `target` may match several elements at once (e.g. all
  // six finance-page nav links) - the spotlight becomes the union of every
  // visible match's bounding box instead of just the first one found.
  multi?: boolean;
  title: string;
  body: string;
  // A step whose target is a real link the user should click (e.g. a nav
  // item) can also navigate there itself when its button is clicked, not
  // just when the user clicks the real link directly.
  href?: string;
  // The generic "Next"/"Done" label doesn't say where a "continue to X"
  // step actually goes - set this to override the button text on that step.
  nextLabel?: string;
  // T117: an optional secondary link shown next to "Skip tour", for a step
  // that wants to offer an alternate path (e.g. the opening step's "prefer
  // step-by-step setup?" offer into the guided-setup wizard).
  secondaryAction?: { label: string; onClick: () => void };
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
// one of which is ever visible at a given breakpoint, or T117's multi-target
// finance-group step) - every visible match is returned; callers that want
// just one (non-`multi` steps) use the first.
function findVisibleTargets(selector: string): HTMLElement[] {
  const candidates = document.querySelectorAll<HTMLElement>(selector);
  const visible: HTMLElement[] = [];
  for (const el of candidates) {
    if (isVisible(el)) visible.push(el);
  }
  return visible;
}

function unionRect(elements: HTMLElement[]): Rect {
  const boxes = elements.map((el) => el.getBoundingClientRect());
  const top = Math.min(...boxes.map((b) => b.top));
  const left = Math.min(...boxes.map((b) => b.left));
  const right = Math.max(...boxes.map((b) => b.right));
  const bottom = Math.max(...boxes.map((b) => b.bottom));
  return { top, left, width: right - left, height: bottom - top };
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 12;
const TOOLTIP_MARGIN = 16;

// Hand-built spotlight tour (T98) - no tour library, per CLAUDE.md's "no new
// dependencies" rule. Dims the page behind a single "cutout" div sized to
// the current step's target (or, for a `multi` step, the union of every
// matched target): its own oversized box-shadow paints everything else
// dark, so the target reads as highlighted without needing several separate
// dimming rectangles.
//
// T117 (user request 2026-07-26, replacing the old T110/T116 per-page tour
// chain): this is a single tour meant to be mounted once, persistently,
// across the whole app (AppShell) rather than per-page - a step whose
// target isn't on the current page (e.g. the closing "your forecast table"
// step while the user is still on Accounts) goes dormant (renders nothing)
// instead of skipping ahead or ending the tour, and re-checks every time the
// route changes, so the tour quietly resumes wherever/whenever the user
// navigates there themselves.
//
// T119 (user request 2026-07-26): progress is now the caller's
// responsibility to persist (server-side, so it survives logout/closing the
// browser) - this component is simply "active" for as long as it's mounted,
// starting at `initialStepIndex` and reporting every step change via
// `onStepChange`, rather than managing its own done/not-done flag in
// localStorage the way it used to.
export function SpotlightTour({
  steps,
  initialStepIndex = 0,
  onStepChange,
  onFinish,
}: {
  steps: TourStep[];
  initialStepIndex?: number;
  onStepChange?: (index: number) => void;
  // Called every time the tour ends (Skip, Escape, or Done on the last
  // step). Returning `true` suppresses the last step's automatic `href`
  // navigation - needed when the caller is about to show its own modal
  // that should navigate on its own close instead of racing the tour's own
  // redirect.
  onFinish?: () => boolean | void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [stepIndex, setStepIndexState] = useState(initialStepIndex);
  const [rect, setRect] = useState<Rect | null>(null);
  const [active, setActive] = useState(true);
  const tooltipRef = useRef<HTMLDivElement>(null);

  function setStepIndex(index: number) {
    setStepIndexState(index);
    onStepChange?.(index);
  }

  // Read via a ref rather than a `useCallback` dependency so `finish`'s own
  // identity stays stable across parent re-renders (it feeds several other
  // effects below) even when the caller passes a fresh inline `onFinish`
  // function on every render.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  const finish = useCallback(() => {
    setActive(false);
    return onFinishRef.current?.();
  }, []);

  useEffect(() => {
    if (!active) return;
    const step = steps[stepIndex];
    if (!step) return;

    // A "center" step has no element to find at all - always show it.
    if (!step.target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect({ top: 0, left: 0, width: 0, height: 0 });
      return;
    }
    const target = step.target;

    let cleanup: (() => void) | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    // Tries to find and spotlight the step's target; returns whether it
    // succeeded. A client-side route change updates `pathname` (this
    // effect's own trigger) before the new page's content has necessarily
    // painted into the DOM yet - a single lookup right on that trigger can
    // miss a target that's genuinely there a beat later, so a miss here
    // falls back to polling (below) instead of declaring the step dormant
    // for good.
    function tryResolve(): boolean {
      const targets = findVisibleTargets(target);
      const matches = step!.multi ? targets : targets.slice(0, 1);
      if (matches.length === 0) return false;

      matches[0].scrollIntoView({ behavior: "smooth", block: "start" });

      function updateRect() {
        setRect(unionRect(matches));
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
      // target's own click, capture-phase so it fires before the target's
      // own handler navigates away, fixes that without touching "done"
      // state. Clicks that originate inside the tooltip itself are ignored,
      // so the tour's own Next/Done button (which can render inside its own
      // spotlit target, e.g. a whole-page step) doesn't hide itself before
      // its own onClick runs.
      function hideOnTargetClick(e: MouseEvent) {
        if (tooltipRef.current?.contains(e.target as Node)) return;
        setRect(null);
      }
      for (const el of matches) el.addEventListener("click", hideOnTargetClick, true);
      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("scroll", updateRect, true);
        window.removeEventListener("resize", updateRect);
        for (const el of matches) el.removeEventListener("click", hideOnTargetClick, true);
      };
      return true;
    }

    if (!tryResolve()) {
      // Dormant: stay hidden (not finished, not skipped) and keep checking
      // every 400ms - either the target never shows up here (the user is
      // still elsewhere and this poll harmlessly no-ops until the step's
      // dependencies change again) or it appears a moment after the route
      // transition settles.
      setRect(null);
      pollId = setInterval(() => {
        if (tryResolve() && pollId) {
          clearInterval(pollId);
          pollId = null;
        }
      }, 400);
    }

    return () => {
      if (pollId) clearInterval(pollId);
      cleanup?.();
    };
  }, [active, stepIndex, steps, pathname]);

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
  const isCenter = !step.target;
  const isLast = stepIndex === steps.length - 1;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const tooltipWidth = Math.min(TOOLTIP_WIDTH, viewportW - TOOLTIP_MARGIN * 2);

  let tooltipLeft: number;
  let tooltipTop: number;
  if (isCenter) {
    tooltipLeft = (viewportW - tooltipWidth) / 2;
    tooltipTop = viewportH / 2 - 100;
  } else {
    const spaceBelow = viewportH - (rect.top + rect.height);
    const placeAbove = spaceBelow < 180 && rect.top > 180;
    tooltipLeft = Math.min(Math.max(rect.left, TOOLTIP_MARGIN), viewportW - tooltipWidth - TOOLTIP_MARGIN);
    // A target that spans (near) the full viewport height leaves neither
    // "below" nor "above" with real room, so the plain above/below formula
    // can land the tooltip off-screen entirely. Clamping the final top into
    // the viewport (minus a rough height estimate, since the box's real
    // height isn't known until it's painted) keeps it visible in that case
    // without needing a fully separate layout branch for tall targets.
    const ESTIMATED_TOOLTIP_HEIGHT = 190;
    const preferredTop = placeAbove
      ? rect.top - TOOLTIP_GAP - ESTIMATED_TOOLTIP_HEIGHT
      : rect.top + rect.height + TOOLTIP_GAP;
    tooltipTop = Math.min(Math.max(preferredTop, TOOLTIP_MARGIN), viewportH - TOOLTIP_MARGIN - ESTIMATED_TOOLTIP_HEIGHT);
  }

  return (
    // T110: `pointer-events-none` on the full-screen wrapper (with
    // `pointer-events-auto` restored just on the tooltip card below) lets
    // clicks reach the real page underneath - needed so a "click the
    // highlighted nav link to continue" step actually works, since that
    // link lives under the spotlighted area, not inside the tour's own UI.
    // Skip/Back/Next/Done still work because the tooltip card opts back in.
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {!isCenter && (
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
      )}
      {isCenter && (
        <div className="pointer-events-none absolute inset-0" style={{ background: "rgba(15, 23, 42, 0.65)" }} />
      )}
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
          <div className="flex items-center gap-3">
            <button type="button" onClick={finish} className="text-xs text-slate-400 hover:text-notion-text">
              Skip tour
            </button>
            {step.secondaryAction && (
              <button
                type="button"
                onClick={step.secondaryAction.onClick}
                className="text-xs text-notion-accent hover:underline"
              >
                {step.secondaryAction.label}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex(stepIndex - 1)}
                className="rounded border border-notion-hairline px-3 py-1.5 text-xs text-notion-text hover:bg-notion-hover"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!isLast) {
                  setStepIndex(stepIndex + 1);
                  if (step.href) router.push(step.href);
                  return;
                }
                const suppressNav = finish();
                if (step.href && suppressNav !== true) router.push(step.href);
              }}
              className="rounded bg-notion-text px-3 py-1.5 text-xs text-white hover:opacity-90"
            >
              {step.nextLabel ?? (isLast ? "Done" : "Next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
