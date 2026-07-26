"use client";

import { Modal } from "./Modal";
import { restartRequiredOnboarding } from "@/lib/onboardingActions";

// T117 (user request 2026-07-26): guided setup (the step-by-step wizard that
// walks a user through adding real accounts/bills/income, previously a hard
// block for every new signup) is now fully opt-in - this is the end-of-tour
// offer into it. `restartRequiredOnboarding` is the exact same server action
// Settings' "Start guided setup" button already uses, so accepting here and
// starting it later from Settings both land in the identical flow.
export function GuidedSetupOfferModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Want help getting set up?" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-600">
        Orium can walk you through adding your real accounts, bills, and income step by step - or
        you can explore on your own and add them whenever you&rsquo;re ready. You can always start this
        later from Settings too.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover"
        >
          I&rsquo;ll explore on my own
        </button>
        <form action={restartRequiredOnboarding}>
          <button
            type="submit"
            className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
          >
            Start guided setup
          </button>
        </form>
      </div>
    </Modal>
  );
}
