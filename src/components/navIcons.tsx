// Small hand-drawn line icons for the collapsible sidebar (SPEC.md T44) - no
// new icon library per CLAUDE.md's "no new dependencies" rule. One icon per
// nav item plus Log out and the collapse/expand toggle. All share the same
// 20x20 viewBox / stroke style so they read as one consistent set at a
// glance, and all use `stroke="currentColor"` so they automatically pick up
// the active/inactive nav-item text color with no extra prop.

type IconProps = { className?: string };

const BASE = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <polyline points="3 10 10 3 17 10" />
      <path d="M5 9 V17 H15 V9" />
    </svg>
  );
}

export function BalancesIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="2" y="5" width="16" height="11" rx="2" />
      <path d="M2 9 H18" />
      <circle cx="14" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BillsIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M5 2 H15 V18 L12.5 16 L10 18 L7.5 16 L5 18 Z" />
      <line x1="7" y1="6" x2="13" y2="6" />
      <line x1="7" y1="9" x2="13" y2="9" />
      <line x1="7" y1="12" x2="11" y2="12" />
    </svg>
  );
}

export function IncomeIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M10 3 V13" />
      <polyline points="6 9 10 13 14 9" />
      <path d="M3 14 v2 a1 1 0 0 0 1 1 h12 a1 1 0 0 0 1 -1 v-2" />
    </svg>
  );
}

export function DebtIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M10 17 V7" />
      <polyline points="6 11 10 7 14 11" />
      <path d="M3 14 v2 a1 1 0 0 0 1 1 h12 a1 1 0 0 0 1 -1 v-2" />
    </svg>
  );
}

export function SavingsIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="4" y="8" width="12" height="9" rx="2" />
      <line x1="7" y1="8" x2="13" y2="8" />
      <circle cx="10" cy="4" r="1.5" />
      <line x1="10" y1="5.5" x2="10" y2="8" />
    </svg>
  );
}

export function BudgetsIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 10 L10 3 A7 7 0 0 1 15.6 13.5 Z" />
    </svg>
  );
}

export function ExtrasIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="3" y="8" width="14" height="9" rx="1" />
      <rect x="3" y="5" width="14" height="3" rx="1" />
      <line x1="10" y1="5" x2="10" y2="17" />
    </svg>
  );
}

export function ForecastIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <polyline points="3 15 8 9 11.5 12 17 5" />
      <polyline points="13 5 17 5 17 9" />
    </svg>
  );
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="10" cy="10" r="7" />
      <polyline points="10 6 10 10 13 12" />
    </svg>
  );
}

// T174: a branching-path glyph for "what if" scenarios - distinct from
// every other nav icon here, none of which suggest a fork/alternative path.
export function ScenariosIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="5" cy="10" r="2" />
      <circle cx="15" cy="4" r="2" />
      <circle cx="15" cy="16" r="2" />
      <path d="M7 10 L13 5" />
      <path d="M7 10 L13 15" />
    </svg>
  );
}

// T164: a plain month-grid glyph for the Calendar nav item.
export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="3" y="4" width="14" height="13" rx="1" />
      <line x1="3" y1="8" x2="17" y2="8" />
      <line x1="7" y1="2" x2="7" y2="6" />
      <line x1="13" y1="2" x2="13" y2="6" />
    </svg>
  );
}

// T163: a bell would collide visually with RemindersPanel's own BellIcon
// (a different surface, but the same glyph reused for "Updates" in the
// sidebar could read as if it were about reminders) - a simple pulse/
// activity line instead, distinct from every other nav icon here.
export function UpdatesIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <polyline points="2 11 6 11 8 6 12 16 14 11 18 11" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="7" strokeDasharray="1.5 2.3" />
    </svg>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M8 3 H5 a1 1 0 0 0 -1 1 v12 a1 1 0 0 0 1 1 h3" />
      <line x1="8" y1="10" x2="17" y2="10" />
      <polyline points="14 6.5 17.5 10 14 13.5" />
    </svg>
  );
}

export function EditIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M12.5 3.5 L16.5 7.5 L7 17 H3 V13 Z" />
      <line x1="11" y1="5" x2="15" y2="9" />
    </svg>
  );
}

export function DeleteIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M4 6 H16" />
      <path d="M8 6 V4 a1 1 0 0 1 1 -1 h2 a1 1 0 0 1 1 1 V6" />
      <path d="M5.5 6 L6.3 17 a1 1 0 0 0 1 0.9 h5.4 a1 1 0 0 0 1 -0.9 L14.5 6" />
      <line x1="8.5" y1="9" x2="8.5" y2="14" />
      <line x1="11.5" y1="9" x2="11.5" y2="14" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <polyline points="4 10.5 8 14.5 16 5.5" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  );
}

const CHEVRON_POINTS: Record<"left" | "right" | "up" | "down", string> = {
  left: "12 5 7 10 12 15",
  right: "8 5 13 10 8 15",
  up: "5 12 10 7 15 12",
  down: "5 8 10 13 15 8",
};

export function ChevronIcon({
  className,
  direction,
}: IconProps & { direction: "left" | "right" | "up" | "down" }) {
  return (
    <svg {...BASE} className={className}>
      <polyline points={CHEVRON_POINTS[direction]} />
    </svg>
  );
}

// T94: the Orium mark itself ("Trendline" - a ring standing in for the "O"
// of Orium, with a forecast line crossing through its middle).
//
// User feedback (2026-07-25, round 2): the mark looked clipped and pushed
// toward the bottom-right of its own box. Root cause - this component spreads
// `{...BASE}`, which sets `viewBox="0 0 20 20"` (shared by every icon in this
// file), but the circle below was drawn assuming a 24x24 canvas (`cx=12
// cy=12 r=8`). Its right/bottom edge landed exactly on the 20x20 boundary
// and got clipped by the SVG's default `overflow: hidden` - not a design
// problem, a coordinate-space mismatch. Redrawn to actually fit BASE's
// 20x20 viewBox with even margins on every side. Also switched the ring
// from a perfect circle to a taller ellipse ("a slim vertical circle, but
// not too slim") so it reads more like the letterform O and less like a
// generic ring; the trend line's points were rescaled to stay inside the
// new ellipse the same way the previous round contained it inside the
// circle. Ring stroke stays heavier than the line so the O reads as the
// primary letterform. Also re-drawn as a standalone `src/app/icon.svg` for
// the favicon, where `currentColor` isn't available.
export function LogoMark({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <ellipse cx="10" cy="10" rx="6" ry="7" strokeWidth="1.75" />
      <polyline points="6.6 12.3 8.9 9.1 10.8 10.5 13.8 5.3" strokeWidth="1.4" />
    </svg>
  );
}

export function RestoreIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M4 8a6.5 6.5 0 1 1 1.2 6" />
      <polyline points="3 4.5 4 8 7.5 7" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M10 3 a4 4 0 0 0 -4 4 v2 c0 2 -1 3 -1.5 3.5 h11 C15 12 14 11 14 9 V7 a4 4 0 0 0 -4 -4 Z" />
      <path d="M8.3 15.5 a1.8 1.8 0 0 0 3.4 0" />
    </svg>
  );
}

// T114: the sidebar's "How to use" entry, which starts the guided tour.
// Not in NAV_ICONS below - that map is keyed by route href, and this one
// runs an action instead of going anywhere, so AppShell references it
// directly.
export function LightbulbIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M7.7 12.4 A4.4 4.4 0 1 1 12.3 12.4 L12 15 H8 Z" />
      <line x1="8.6" y1="17.2" x2="11.4" y2="17.2" />
    </svg>
  );
}

// T126 follow-up (user request 2026-07-26): the sidebar's "Guided setup"
// entry, matching LightbulbIcon's "not in NAV_ICONS" note above - AppShell
// references this one directly too, since it isn't keyed by a route.
export function ChecklistIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <rect x="3.5" y="3" width="13" height="14" rx="1.5" />
      <polyline points="6 8 7.3 9.3 9.5 6.8" />
      <line x1="11" y1="8" x2="13.5" y2="8" />
      <polyline points="6 13 7.3 14.3 9.5 11.8" />
      <line x1="11" y1="13" x2="13.5" y2="13" />
    </svg>
  );
}

// T117: the Dashboard widget panel's per-row show/hide toggle.
export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M2 10 C4.5 5.5 7 4 10 4 C13 4 15.5 5.5 18 10 C15.5 14.5 13 16 10 16 C7 16 4.5 14.5 2 10 Z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <path d="M2 10 C4.5 5.5 7 4 10 4 C13 4 15.5 5.5 18 10 C15.5 14.5 13 16 10 16 C7 16 4.5 14.5 2 10 Z" />
      <circle cx="10" cy="10" r="2.5" />
      <line x1="3" y1="17" x2="17" y2="3" />
    </svg>
  );
}

// T117: the Dashboard's "Customize" trigger, both the panel's own collapse
// state and its mobile floating button - three adjustable sliders rather
// than a generic gear, since this panel's whole job is toggling/reordering
// rows, not settings in general (SettingsIcon already covers that meaning
// elsewhere).
export function SlidersIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className}>
      <line x1="3" y1="6" x2="17" y2="6" />
      <circle cx="8" cy="6" r="2" fill="white" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <circle cx="13" cy="10" r="2" fill="white" />
      <line x1="3" y1="14" x2="17" y2="14" />
      <circle cx="6.5" cy="14" r="2" fill="white" />
    </svg>
  );
}

// T177: drag handle grip - six dots, the universal "drag me" affordance.
export function GripIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <circle cx="7" cy="5" r="1.3" />
      <circle cx="13" cy="5" r="1.3" />
      <circle cx="7" cy="10" r="1.3" />
      <circle cx="13" cy="10" r="1.3" />
      <circle cx="7" cy="15" r="1.3" />
      <circle cx="13" cy="15" r="1.3" />
    </svg>
  );
}

// T133: the spin animation itself is a plain Tailwind utility (`animate-spin`
// on the caller's className) - this is just the ring shape. A partial-arc
// stroke rather than a full circle so the rotation actually reads as motion
// instead of a static ring.
export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// Keyed by nav href (see AppShell.tsx's NAV_ITEMS) so the sidebar can look
// up each item's icon without a big switch statement.
export const NAV_ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  "/": DashboardIcon,
  "/accounts": BalancesIcon,
  "/bills": BillsIcon,
  "/income": IncomeIcon,
  "/debt": DebtIcon,
  "/savings": SavingsIcon,
  "/budgets": BudgetsIcon,
  "/misc": ExtrasIcon,
  "/scenarios": ScenariosIcon,
  "/forecast": ForecastIcon,
  "/history": HistoryIcon,
  "/calendar": CalendarIcon,
  "/updates": UpdatesIcon,
  "/settings": SettingsIcon,
};
