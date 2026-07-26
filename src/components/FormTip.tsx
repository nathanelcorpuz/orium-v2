"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { dismissFormTip } from "@/lib/formTipActions";
import { CloseIcon } from "./navIcons";

// T120 follow-up (user request 2026-07-26): every explainer tip in an
// add/edit form can be dismissed for good, one at a time - useful the first
// few times, clutter once you know the app.
//
// The dismissed set is fetched once in `(app)/layout.tsx` and shared through
// this context rather than threaded as props: these tips live inside modals
// (BillModal, BudgetModal, ...) that are opened from a dozen different
// pages, and several of those modals are also embedded in the onboarding
// wizard - prop-drilling the set to all of them would touch every page for
// no benefit.
const DismissedTipsContext = createContext<string[]>([]);

export function FormTipsProvider({
  dismissed,
  children,
}: {
  dismissed: string[];
  children: React.ReactNode;
}) {
  return <DismissedTipsContext value={dismissed}>{children}</DismissedTipsContext>;
}

export function FormTip({
  tipKey,
  variant = "hint",
  children,
}: {
  // Stable identifier stored in `preferences.dismissed_form_tips`. Renaming
  // one just makes that tip show again; it can't break anything.
  tipKey: string;
  // "panel" is the boxed intro at the top of a form ("A bill is money going
  // out..."); "hint" is the quiet line under a single field.
  variant?: "panel" | "hint";
  children: React.ReactNode;
}) {
  const dismissed = useContext(DismissedTipsContext);
  const [confirming, setConfirming] = useState(false);
  // Optimistic: the server action revalidates the layout, but hiding
  // immediately keeps the form from visibly reflowing a beat later.
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  if (hidden || dismissed.includes(tipKey)) return null;

  const isPanel = variant === "panel";
  const wrapperClass = isPanel
    ? "relative rounded border border-notion-hairline bg-notion-hover p-3 pr-8 text-sm text-slate-600"
    : "relative mt-1 pr-8 text-sm text-slate-400";

  if (confirming) {
    return (
      <div className={wrapperClass}>
        <p>Don&rsquo;t show this tip next time?</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setHidden(true);
              startTransition(() => dismissFormTip(tipKey));
            }}
            className="rounded border border-notion-hairline bg-white px-2 py-1 text-xs text-notion-text hover:bg-notion-hover disabled:opacity-50"
          >
            Don&rsquo;t show again
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="text-xs text-slate-400 hover:text-notion-text disabled:opacity-50"
          >
            Keep showing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {children}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Hide this tip"
        title="Hide this tip"
        className="absolute right-1 top-1 rounded p-1 text-slate-400 hover:bg-white hover:text-notion-text"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </div>
  );
}
