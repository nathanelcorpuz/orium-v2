"use client";

import { Modal } from "./Modal";
import { restartRequiredOnboarding } from "@/lib/onboardingActions";

// T119 (user request 2026-07-26): the very first thing a brand-new signup
// sees - offers a choice between the short tour and the step-by-step
// guided setup, rather than the tour just auto-starting. Skippable ("Maybe
// later") per the user's explicit answer - nothing here hard-blocks the
// app the way T115's wizard gate can.
export function OnboardingWelcomeModal({
  onChooseTour,
  onSkip,
}: {
  onChooseTour: () => void;
  onSkip: () => void;
}) {
  return (
    <Modal title="Welcome to Orium" onClose={onSkip}>
      <p className="mb-3 text-sm text-slate-600">
        Orium shows you how much money you&rsquo;ll have at any point in the future.
      </p>
      <p className="mb-4 text-sm text-slate-600">
        Would you like a short tour of the app, or a step-by-step guided setup to add your real
        accounts, bills, and income? You can always do the other one later from Settings.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onChooseTour}
          className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
        >
          Take the short tour
        </button>
        <form action={restartRequiredOnboarding}>
          <button
            type="submit"
            className="w-full rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
          >
            Start guided setup
          </button>
        </form>
        <button type="button" onClick={onSkip} className="text-xs text-slate-400 hover:text-notion-text">
          Maybe later
        </button>
      </div>
    </Modal>
  );
}
