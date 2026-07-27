"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronIcon, CloseIcon, EyeIcon, EyeOffIcon, SlidersIcon } from "./navIcons";
import { MobileDrawer } from "./MobileDrawer";

export type DashboardWidget = { key: string; label: string; node: ReactNode };

type LayoutState = { order: string[]; hidden: string[] };

const STORAGE_KEY = "orium.dashboardWidgets";
const PANEL_COLLAPSED_KEY = "orium.dashboardWidgetsCollapsed";

function defaultLayout(widgets: DashboardWidget[]): LayoutState {
  return { order: widgets.map((w) => w.key), hidden: [] };
}

// A stored layout can predate a widget the app has since added, or omit one
// that's been removed - reconciling against the current widget list keeps
// both cases harmless instead of silently dropping a widget or crashing on
// a stale key. New widgets land at the end, visible by default.
function reconcile(stored: LayoutState, widgets: DashboardWidget[]): LayoutState {
  const validKeys = new Set(widgets.map((w) => w.key));
  const order = stored.order.filter((k) => validKeys.has(k));
  for (const w of widgets) {
    if (!order.includes(w.key)) order.push(w.key);
  }
  const hidden = stored.hidden.filter((k) => validKeys.has(k));
  return { order, hidden };
}

// T117+T118 (user request 2026-07-26): a right-side panel on the Dashboard
// controlling which widgets show and in what order, in the same position/
// style as the Forecast page's Reminders panel (T65's full-height
// collapsible `<aside>`) - same collapse behavior, same mobile floating-
// button-plus-slide-over treatment, for visual consistency between the
// app's two customizable panels.
//
// Reordering is up/down buttons, not drag-and-drop: native HTML5 drag has no
// touch support at all, and a drag *library* would violate CLAUDE.md's "no
// new dependencies" rule - up/down buttons work on mobile, desktop, and
// keyboard alike with zero new code weight.
//
// Layout (order + which widgets are hidden) is a `localStorage` value, the
// same "client-only preference, no DB column" pattern already used for the
// sidebar's own collapsed state and this Reminders panel's collapsed state -
// a display preference, not a decision that needs to follow the user across
// devices.
export function DashboardWidgetsPanel({
  widgets,
  children,
}: {
  widgets: DashboardWidget[];
  children?: ReactNode;
}) {
  const [layout, setLayout] = useState<LayoutState>(() => defaultLayout(widgets));
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hydration-safe: both server and first client render use the default
  // layout (every widget visible, server order), then a post-mount effect
  // applies whatever's actually stored - avoids a markup mismatch the same
  // way AppShell's sidebar-collapsed state does.
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LayoutState;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLayout(reconcile(parsed, widgets));
      } catch {
        // Malformed stored value - fall back to the default layout already
        // in state rather than throwing.
      }
    }
    if (localStorage.getItem(PANEL_COLLAPSED_KEY) === "true") {
      setCollapsed(true);
    }
    // Only ever needs to run once, on mount - `widgets` is effectively
    // static (the Dashboard doesn't remount with a different widget set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: LayoutState) {
    setLayout(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function toggleVisible(key: string) {
    const hidden = layout.hidden.includes(key)
      ? layout.hidden.filter((k) => k !== key)
      : [...layout.hidden, key];
    persist({ ...layout, hidden });
  }

  function move(key: string, delta: number) {
    const index = layout.order.indexOf(key);
    const target = index + delta;
    if (target < 0 || target >= layout.order.length) return;
    const order = [...layout.order];
    [order[index], order[target]] = [order[target], order[index]];
    persist({ ...layout, order });
  }

  function restoreDefaults() {
    persist(defaultLayout(widgets));
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(PANEL_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  const byKey = new Map(widgets.map((w) => [w.key, w]));
  const orderedWidgets = layout.order.map((k) => byKey.get(k)).filter((w): w is DashboardWidget => !!w);
  const visibleWidgets = orderedWidgets.filter((w) => !layout.hidden.includes(w.key));

  const panelContent = (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-notion-text">Customize dashboard</h2>
        <button
          type="button"
          onClick={restoreDefaults}
          className="text-xs text-slate-400 underline hover:text-notion-text"
        >
          Restore defaults
        </button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {orderedWidgets.map((widget, index) => {
          const visible = !layout.hidden.includes(widget.key);
          return (
            <li
              key={widget.key}
              className="flex items-center justify-between gap-2 rounded border border-notion-hairline px-2 py-1.5"
            >
              <button
                type="button"
                onClick={() => toggleVisible(widget.key)}
                title={visible ? "Hide widget" : "Show widget"}
                aria-label={`${visible ? "Hide" : "Show"} ${widget.label}`}
                aria-pressed={visible}
                className={`flex items-center gap-2 rounded p-1 text-left text-sm ${
                  visible ? "text-notion-text" : "text-slate-400"
                } hover:bg-notion-hover`}
              >
                {visible ? <EyeIcon className="h-4 w-4 shrink-0" /> : <EyeOffIcon className="h-4 w-4 shrink-0" />}
                <span className={visible ? "" : "line-through"}>{widget.label}</span>
              </button>
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(widget.key, -1)}
                  disabled={index === 0}
                  title="Move up"
                  aria-label={`Move ${widget.label} up`}
                  className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text disabled:opacity-30"
                >
                  <ChevronIcon direction="up" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(widget.key, 1)}
                  disabled={index === orderedWidgets.length - 1}
                  title="Move down"
                  aria-label={`Move ${widget.label} down`}
                  className="rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text disabled:opacity-30"
                >
                  <ChevronIcon direction="down" className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          {children}
          {visibleWidgets.map((widget) => (
            <div key={widget.key}>{widget.node}</div>
          ))}
        </div>
      </div>

      <aside
        className={`sticky top-0 relative hidden h-screen shrink-0 flex-col border-l border-notion-hairline bg-white transition-all duration-200 lg:flex ${
          collapsed ? "w-16" : "w-72"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand customize panel" : "Collapse customize panel"}
          aria-label={collapsed ? "Expand customize panel" : "Collapse customize panel"}
          className="absolute -left-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-notion-hairline bg-white text-slate-400 shadow-sm hover:bg-notion-hover hover:text-notion-text"
        >
          <ChevronIcon direction={collapsed ? "left" : "right"} className="h-3.5 w-3.5" />
        </button>
        {!collapsed && panelContent}
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Customize dashboard"
        className="fixed bottom-4 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-notion-hairline bg-white text-slate-500 shadow-lg hover:text-notion-text lg:hidden"
      >
        <SlidersIcon className="h-5 w-5" />
      </button>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} side="right" widthClassName="w-80">
        <div className="flex items-center justify-end border-b border-notion-hairline p-2">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close customize panel"
            className="rounded p-1.5 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {panelContent}
      </MobileDrawer>
    </div>
  );
}
