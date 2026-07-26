"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export type TourStep = {
  // A step with no `target` is a "center" step - full-screen dim, no
  // spotlighted cutout, message centered on screen. Used for the tour's
  // opening line, which isn't about any one element.
  target?: string; // CSS selector, e.g. `[data-tour="accounts-header"]`
  // When true, `target` may match several elements at once - each visible
  // match gets its own spotlight hole.
  multi?: boolean;
  // T124 (user request 2026-07-26): the page's own left-nav item should read
  // as highlighted alongside the content being described, so it's obvious
  // *where* in the app you are. Give the nav item's key here (matching
  // AppShell's `data-tour="nav-<key>"`) and it gets its own spotlight hole
  // next to the content's.
  navKey?: string;
  title: string;
  body: string;
  // A step whose target is a real link the user should click can also
  // navigate there itself when its button is clicked.
  href?: string;
  // The generic "Next"/"Done" label doesn't say where a "continue to X" step
  // actually goes - set this to override the button text on that step.
  nextLabel?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  // `offsetParent === null` is the usual "not display:none" check, but it's
  // also null for `position: fixed` elements even when they're fully visible
  // - checking computed style directly avoids incorrectly skipping those.
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

// A step's selector may match more than one element (e.g. the same
// `data-tour` value on both the desktop and mobile versions of a panel, only
// one of which is ever visible at a given breakpoint).
function findVisibleTargets(selector: string): HTMLElement[] {
  const candidates = document.querySelectorAll<HTMLElement>(selector);
  const visible: HTMLElement[] = [];
  for (const el of candidates) {
    if (isVisible(el)) visible.push(el);
  }
  return visible;
}

function toRect(el: HTMLElement): Rect {
  const b = el.getBoundingClientRect();
  return { top: b.top, left: b.left, width: b.width, height: b.height };
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 12;
const TOOLTIP_MARGIN = 16;
const ESTIMATED_TOOLTIP_HEIGHT = 190;

// T124: the preview bar (`sticky top-0`) sits across the top of the page
// during the tour, and both the spotlight and the tooltip used to be able to
// land underneath it - the user reported it "blocking some of the tour's
// main content". Measuring it means the tooltip is never placed behind it,
// and targets are scrolled to centre rather than to the very top (which put
// them straight under the bar).
function topInset(): number {
  const bar = document.querySelector<HTMLElement>("[data-preview-bar]");
  if (!bar || !isVisible(bar)) return TOOLTIP_MARGIN;
  return bar.getBoundingClientRect().bottom + TOOLTIP_GAP;
}

// Hand-built spotlight tour (T98) - no tour library, per CLAUDE.md's "no new
// dependencies" rule.
//
// T124: the dimming used to be one div whose oversized `box-shadow` painted
// everything outside it dark. That only ever supports a single hole, so it
// couldn't satisfy "highlight the page's nav item *and* its content" - two
// overlapping shadows would double-dim the gap between them. It's now an SVG
// mask: one dark rect covering the viewport, masked by a white fill with a
// black (i.e. punched-out) rect per spotlighted element, which supports any
// number of holes at no extra cost.
//
// A step whose target isn't on the current page goes dormant (renders
// nothing, not finished, not skipped) and re-checks on every route change
// plus a short poll, so the tour resumes wherever the user navigates.
//
// T119: progress is the caller's to persist (server-side, so it survives a
// logout) - this component is simply "active" while mounted, starting at
// `initialStepIndex` and reporting changes via `onStepChange`.
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
  // navigation.
  onFinish?: () => boolean | void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [stepIndex, setStepIndexState] = useState(initialStepIndex);
  // Every hole to punch, plus which one the tooltip should anchor to (the
  // content target, never the nav item).
  const [spotlight, setSpotlight] = useState<{ holes: Rect[]; anchor: Rect | null } | null>(null);
  const [active, setActive] = useState(true);
  // T124: a step whose Next both advances and navigates used to leave the
  // tour blank for the whole page transition - the card vanished, so a click
  // read as "nothing happened" (the user's report). This keeps the overlay up
  // with a pending button until the next step's target actually resolves.
  const [navigating, setNavigating] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  function setStepIndex(index: number) {
    setStepIndexState(index);
    onStepChange?.(index);
  }

  // Read via a ref rather than a `useCallback` dependency so `finish`'s own
  // identity stays stable across parent re-renders even when the caller
  // passes a fresh inline `onFinish` on every render.
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
      setSpotlight({ holes: [], anchor: null });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNavigating(false);
      return;
    }
    const target = step.target;
    const navKey = step.navKey;

    let cleanup: (() => void) | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    // A client-side route change updates `pathname` (this effect's trigger)
    // before the new page's content has necessarily painted, so a single
    // lookup can miss a target that's genuinely there a beat later - a miss
    // falls back to polling rather than declaring the step dormant for good.
    function tryResolve(): boolean {
      const found = findVisibleTargets(target);
      const contentEls = step!.multi ? found : found.slice(0, 1);
      if (contentEls.length === 0) return false;

      const navEls = navKey ? findVisibleTargets(`[data-tour="nav-${navKey}"]`) : [];
      const all = [...contentEls, ...navEls];

      // Centre rather than top: `block: "start"` parks the target directly
      // under the sticky preview bar during a preview-mode tour.
      contentEls[0].scrollIntoView({ behavior: "smooth", block: "center" });

      function updateRect() {
        setSpotlight({ holes: all.map(toRect), anchor: toRect(contentEls[0]) });
      }
      updateRect();
      setNavigating(false);
      const raf = requestAnimationFrame(updateRect); // once more after the scroll settles
      window.addEventListener("scroll", updateRect, true);
      window.addEventListener("resize", updateRect);
      // When a step's target is itself something the user is meant to click,
      // the tooltip must get out of the way the instant they do - otherwise
      // on mobile it can sit directly over the very control just asked for.
      // Capture-phase so it fires before the target's own handler navigates.
      // Clicks originating inside the tooltip are ignored, so the tour's own
      // Next button (which can render inside its own spotlit target) doesn't
      // hide itself before its onClick runs.
      function hideOnTargetClick(e: MouseEvent) {
        if (tooltipRef.current?.contains(e.target as Node)) return;
        setSpotlight(null);
      }
      for (const el of all) el.addEventListener("click", hideOnTargetClick, true);
      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("scroll", updateRect, true);
        window.removeEventListener("resize", updateRect);
        for (const el of all) el.removeEventListener("click", hideOnTargetClick, true);
      };
      return true;
    }

    if (!tryResolve()) {
      setSpotlight(null);
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

  if (!active) return null;
  // Keep the overlay up through a navigation even though the next step's
  // target hasn't resolved yet - that gap is what used to read as a dead
  // click.
  if (!spotlight && !navigating) return null;

  const step = steps[stepIndex];
  const holes = spotlight?.holes ?? [];
  const anchor = spotlight?.anchor ?? null;
  const isLast = stepIndex === steps.length - 1;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const tooltipWidth = Math.min(TOOLTIP_WIDTH, viewportW - TOOLTIP_MARGIN * 2);
  const minTop = topInset();

  let tooltipLeft: number;
  let tooltipTop: number;
  if (!anchor) {
    tooltipLeft = (viewportW - tooltipWidth) / 2;
    tooltipTop = Math.max(viewportH / 2 - 100, minTop);
  } else {
    const spaceBelow = viewportH - (anchor.top + anchor.height);
    const placeAbove = spaceBelow < 180 && anchor.top > 180;
    tooltipLeft = Math.min(
      Math.max(anchor.left, TOOLTIP_MARGIN),
      viewportW - tooltipWidth - TOOLTIP_MARGIN,
    );
    // A target spanning (near) the full viewport height leaves neither above
    // nor below with real room, so clamp the result into the visible area -
    // below the preview bar when one is present.
    const preferredTop = placeAbove
      ? anchor.top - TOOLTIP_GAP - ESTIMATED_TOOLTIP_HEIGHT
      : anchor.top + anchor.height + TOOLTIP_GAP;
    tooltipTop = Math.min(
      Math.max(preferredTop, minTop),
      Math.max(viewportH - TOOLTIP_MARGIN - ESTIMATED_TOOLTIP_HEIGHT, minTop),
    );
  }

  return (
    // `pointer-events-none` on the wrapper (with `pointer-events-auto`
    // restored on the tooltip) lets clicks reach the real page underneath -
    // needed so a "click the highlighted thing" step actually works.
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <mask id="orium-tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {holes.map((r, i) => (
              <rect
                key={i}
                x={r.left - SPOTLIGHT_PADDING}
                y={r.top - SPOTLIGHT_PADDING}
                width={r.width + SPOTLIGHT_PADDING * 2}
                height={r.height + SPOTLIGHT_PADDING * 2}
                rx="8"
                fill="black"
              />
            ))}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.65)"
          mask="url(#orium-tour-mask)"
        />
        {holes.map((r, i) => (
          <rect
            key={i}
            x={r.left - SPOTLIGHT_PADDING}
            y={r.top - SPOTLIGHT_PADDING}
            width={r.width + SPOTLIGHT_PADDING * 2}
            height={r.height + SPOTLIGHT_PADDING * 2}
            rx="8"
            fill="none"
            stroke="white"
            strokeWidth="2"
          />
        ))}
      </svg>
      {/* T124: the card was plain white, the same as every card on the page
          behind it, so it didn't read as a separate layer. A soft purple
          tint plus a purple border makes it obviously the tour talking
          rather than part of the page. */}
      <div
        ref={tooltipRef}
        className="pointer-events-auto absolute rounded-lg border border-purple-200 bg-purple-50 p-4 shadow-xl"
        style={{
          width: tooltipWidth,
          left: tooltipLeft,
          top: tooltipTop,
        }}
      >
        <p className="text-xs font-medium text-purple-400">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <h3 className="mt-1 text-sm font-semibold text-notion-text">{step.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-slate-400 hover:text-notion-text"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && !navigating && (
              <button
                type="button"
                onClick={() => setStepIndex(stepIndex - 1)}
                className="rounded border border-purple-200 bg-white px-3 py-1.5 text-xs text-notion-text hover:bg-notion-hover"
              >
                Back
              </button>
            )}
            <button
              type="button"
              disabled={navigating}
              onClick={() => {
                if (!isLast) {
                  if (step.href) setNavigating(true);
                  setStepIndex(stepIndex + 1);
                  if (step.href) router.push(step.href);
                  return;
                }
                const suppressNav = finish();
                if (step.href && suppressNav !== true) router.push(step.href);
              }}
              className="rounded bg-notion-text px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-60"
            >
              {navigating ? "Loading…" : (step.nextLabel ?? (isLast ? "Done" : "Next"))}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
