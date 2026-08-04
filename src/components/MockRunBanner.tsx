"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useMockRun } from "@/components/MockRunContext";

// Mock run v1 (2026-08-04): shown on every page that participates (Accounts,
// Forecast) whenever mock mode is active, so it's never ambiguous which
// numbers on screen are real. "Exit" is a single click - nothing real ever
// happened, so there's nothing to confirm. "Make this real" replays the
// queued actions through the real server actions and does move real money,
// so it gets a confirmation step listing exactly what will happen.
export function MockRunBanner() {
  const mockRun = useMockRun();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!mockRun.active) return null;

  async function handleMakeReal() {
    setError(null);
    const result = await mockRun.makeReal();
    if (result.error) {
      setError(result.error);
    } else {
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>You are in a mock run.</strong> Actions here are hypothetical and not saved
          {mockRun.intents.length > 0 && ` (${mockRun.intents.length} queued)`}.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={mockRun.discard}
            className="rounded border border-orange-300 px-3 py-1 text-orange-900 hover:bg-orange-100"
          >
            Exit
          </button>
          <button
            type="button"
            disabled={mockRun.intents.length === 0}
            onClick={() => setConfirming(true)}
            className="rounded bg-orange-600 px-3 py-1 text-white hover:opacity-90 disabled:opacity-50"
          >
            Make this real
          </button>
        </div>
      </div>

      {confirming && (
        <Modal title="Make this mock run real?" onClose={() => (mockRun.makingReal ? null : setConfirming(false))}>
          <p className="mb-3 text-sm text-slate-600">
            This applies these {mockRun.intents.length} action{mockRun.intents.length === 1 ? "" : "s"} for real,
            in order:
          </p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-notion-text">
            {mockRun.intentSummaries.map((summary, i) => (
              <li key={i}>{summary}</li>
            ))}
          </ul>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={mockRun.makingReal}
              className="rounded border border-notion-hairline px-4 py-2 text-notion-text hover:bg-notion-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMakeReal}
              disabled={mockRun.makingReal}
              className="rounded bg-orange-600 px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
            >
              {mockRun.makingReal ? "Applying..." : "Yes, apply these"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
