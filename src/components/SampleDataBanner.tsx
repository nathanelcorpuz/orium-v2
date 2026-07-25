"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/navIcons";
import { SampleDataActions } from "@/app/(app)/settings/SampleDataActions";

const DISMISSED_KEY = "orium.sampleDataBannerDismissed";

// T97: shown on the Dashboard whenever the account currently holds the
// sample dataset (auto-seeded at signup or brought back via Settings'
// "Restore sample data") - the parent only renders this at all when
// `sampleDataSeededAt` is set, so the one thing left to check client-side
// is a per-browser dismiss, same hydration-safe localStorage pattern
// AppShell.tsx's sidebar-collapse already uses: starts `false` (shown) on
// both server and first client render, then a post-mount effect hides it
// if previously dismissed.
export function SampleDataBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY) === "true") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(true);
    }
  }, []);

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="mb-6 rounded-lg border border-notion-accent/30 bg-blue-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-notion-text">You&apos;re viewing sample data</p>
          <p className="mt-1 text-sm text-slate-600">
            Explore freely, then reset when you&apos;re ready to enter your own numbers.
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
      <div className="mt-3">
        <SampleDataActions />
      </div>
    </div>
  );
}
