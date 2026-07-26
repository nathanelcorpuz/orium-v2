"use client";

import { useTransition } from "react";
import {
  choosePostTourGuidedSetup,
  choosePostTourOwnData,
  choosePostTourTestData,
  dismissPostTourPrompt,
} from "@/lib/onboardingActions";

// T120 (user request 2026-07-26): shown once the short tour finishes, and
// deliberately NOT a modal - it has to "persist anywhere they go until they
// select one," so it's a small fixed card that rides along on every page
// (mounted from AppShell) while staying out of the way of actually using
// the app. Its visibility is server state (`onboarding_post_tour_choice`,
// migration 0024), so it survives navigation and reloads alike.
//
// The close button is deliberately quiet - same weight as the tour's own
// "Skip tour" link - since dismissing is the least-encouraged path; Settings
// > Help brings the same three options back, which the closing line says.
export function OnboardingNextStepPrompt() {
  const [pending, startTransition] = useTransition();

  return (
    // z-40 deliberately sits *below* Modal's z-50 (and the tour's z-100):
    // this card is long-lived, so at a higher z-index it would sit on top of
    // any add/edit dialog the user opens and cover its Save button. Below
    // them, it simply dims behind the modal backdrop until they're done.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 sm:inset-x-auto sm:right-4 sm:justify-end">
      <div className="pointer-events-auto w-full max-w-sm rounded-lg border border-notion-hairline bg-white p-4 shadow-xl">
        <p className="text-sm font-semibold text-notion-text">What would you like to do next?</p>
        <p className="mt-1 text-sm text-slate-500">
          That was a preview - none of it was saved. Pick how you&rsquo;d like to start.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => choosePostTourTestData())}
            className="rounded border border-notion-hairline px-3 py-2 text-left text-sm text-notion-text hover:bg-notion-hover disabled:opacity-50"
          >
            <span className="font-medium">Explore with test data</span>
            <span className="block text-xs text-slate-500">
              Fills your account with a sample household you can click around and change.
            </span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => choosePostTourGuidedSetup())}
            className="rounded border border-notion-hairline px-3 py-2 text-left text-sm text-notion-text hover:bg-notion-hover disabled:opacity-50"
          >
            <span className="font-medium">Walk me through setup</span>
            <span className="block text-xs text-slate-500">
              Step-by-step prompts for your real accounts, bills, and income.
            </span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => choosePostTourOwnData())}
            className="rounded bg-notion-text px-3 py-2 text-left text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            <span className="font-medium">I&rsquo;ll enter my own data</span>
            <span className="block text-xs text-white/70">Start from an empty account.</span>
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-400">Find these again in Settings &gt; Help.</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => dismissPostTourPrompt())}
            className="shrink-0 text-xs text-slate-400 hover:text-notion-text disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
