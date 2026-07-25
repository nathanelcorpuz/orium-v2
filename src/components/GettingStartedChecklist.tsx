"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckIcon, CloseIcon } from "@/components/navIcons";

const DISMISSED_KEY = "orium.gettingStartedDismissed";

type Step = { key: string; label: string; href: string; done: boolean };

// T99: "Getting started" checklist - the add-data steps from Phase 16's
// locked order (dashboard intro -> forecast intro -> add accounts -> add
// bills -> add income -> add debt/savings -> add budgets (optional) -> add
// extras (optional)); the two intro tours are T98, this is everything after
// them. Every row's checkmark is a prop computed live by page.tsx from
// whatever data currently exists - no separate "completed" flag is
// persisted anywhere, so a Reset naturally un-checks everything again and
// adding a real bill naturally checks it, with nothing to keep in sync.
//
// Dismiss uses the same hydration-safe localStorage pattern every other
// collapsible panel in the app already uses (AppShell, RemindersPanel, the
// Forecast Insights card, SampleDataBanner): `dismissed` starts `false` on
// both the server and the first client render, then a post-mount effect
// hides it if the user dismissed it in an earlier session.
export function GettingStartedChecklist({
  hasAccounts,
  hasBills,
  hasIncome,
  hasDebtOrSavings,
  hasBudgets,
  hasExtras,
}: {
  hasAccounts: boolean;
  hasBills: boolean;
  hasIncome: boolean;
  hasDebtOrSavings: boolean;
  hasBudgets: boolean;
  hasExtras: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(true);
    }
  }, []);

  const steps: Step[] = [
    { key: "accounts", label: "Add your accounts", href: "/accounts", done: hasAccounts },
    { key: "bills", label: "Add your bills", href: "/bills", done: hasBills },
    { key: "income", label: "Add your income", href: "/income", done: hasIncome },
    { key: "debt-savings", label: "Add debt or savings goals", href: "/debt", done: hasDebtOrSavings },
    { key: "budgets", label: "Set up a budget (optional)", href: "/budgets", done: hasBudgets },
    { key: "extras", label: "Log a one-off extra (optional)", href: "/extra", done: hasExtras },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;

  // Auto-graduates once every step (including the optional ones) is
  // checked - a fully-done checklist has nothing left to nudge toward, and
  // T100 (replay/skip polish) is where a deliberate "bring this back"
  // affordance would go if that turns out to be wanted later.
  if (allDone || dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="mb-6 rounded-lg border border-notion-hairline bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-notion-text">Getting started</h2>
          <p className="text-xs text-slate-500">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-notion-hover hover:text-notion-text"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <ul>
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-notion-hover"
            >
              {step.done ? (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                  <CheckIcon className="h-2.5 w-2.5" />
                </span>
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-notion-hairline" />
              )}
              <span className={`text-sm ${step.done ? "text-slate-400 line-through" : "text-notion-text"}`}>
                {step.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-notion-hairline pt-2 text-xs text-slate-400">
        Tip: customize your balance colors and lowest-balance labels anytime in{" "}
        <Link href="/settings#balance-thresholds" className="underline hover:text-notion-text">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}
