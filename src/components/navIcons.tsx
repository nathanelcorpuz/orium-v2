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

export function ChevronIcon({ className, direction }: IconProps & { direction: "left" | "right" }) {
  return (
    <svg {...BASE} className={className}>
      <polyline points={direction === "left" ? "12 5 7 10 12 15" : "8 5 13 10 8 15"} />
    </svg>
  );
}

// Keyed by nav href (see AppShell.tsx's NAV_ITEMS) so the sidebar can look
// up each item's icon without a big switch statement.
export const NAV_ICONS: Record<string, (props: IconProps) => React.JSX.Element> = {
  "/": DashboardIcon,
  "/balances": BalancesIcon,
  "/bills": BillsIcon,
  "/income": IncomeIcon,
  "/debt": DebtIcon,
  "/savings": SavingsIcon,
  "/budgets": BudgetsIcon,
  "/extra": ExtrasIcon,
  "/forecast": ForecastIcon,
  "/history": HistoryIcon,
  "/settings": SettingsIcon,
};
