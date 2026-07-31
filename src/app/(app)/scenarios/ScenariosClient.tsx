"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/SubmitButton";
import {
  activateScenarioPermanently,
  createScenario,
  deleteScenario,
  toggleScenarioActive,
  type ScenarioActionState,
} from "./actions";

type ScenarioRow = { id: string; name: string; created_at: string; is_active: boolean };

const initialState: ScenarioActionState = { error: null };

function CreateScenarioForm() {
  const [state, formAction, pending] = useActionState(createScenario, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  // The standard close/reset-on-success pattern this app uses everywhere -
  // resets the form only once the create has genuinely succeeded, not
  // synchronously on submit (a failed create should leave the typed name in
  // place, not clear it).
  useEffect(() => {
    if (submitted.current && !pending && !state.error) {
      formRef.current?.reset();
      submitted.current = false;
    }
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        submitted.current = true;
      }}
      className="mb-6 flex items-end gap-2 rounded-lg border border-notion-hairline bg-white p-4"
    >
      <div className="flex-1">
        <label className="block text-sm text-slate-600" htmlFor="name">
          New scenario
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="e.g. What if we buy a car"
          className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
        />
      </div>
      <SubmitButton className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50">
        Create
      </SubmitButton>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

function ActivatePermanentlyForm({ scenario, onDone }: { scenario: ScenarioRow; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(activateScenarioPermanently, initialState);
  const submitted = useRef(false);

  // Same close-on-genuine-success pattern every other action form in this
  // app uses (e.g. BalanceModal.tsx) - only closes once the action has
  // actually finished with no error, not synchronously on submit.
  useEffect(() => {
    if (submitted.current && !pending && !state.error) onDone();
  }, [pending, state, onDone]);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        submitted.current = true;
      }}
      className="mt-2 space-y-2 rounded border border-amber-300 bg-amber-50 p-3"
    >
      <input type="hidden" name="id" value={scenario.id} />
      <p className="text-sm text-amber-900">
        This copies every item in &ldquo;{scenario.name}&rdquo; into your real bills, income,
        debt, savings, and misc - permanently, and the scenario itself is then deleted. This
        cannot be undone. Type <strong>ACTIVATE</strong> to confirm.
      </p>
      <input
        name="confirmation"
        type="text"
        required
        className="w-full rounded border border-amber-300 p-2 text-notion-text focus:border-notion-accent focus:outline-none"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover"
        >
          Cancel
        </button>
        <SubmitButton className="rounded bg-amber-700 px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50">
          Activate permanently
        </SubmitButton>
      </div>
    </form>
  );
}

function ScenarioRowItem({
  scenario,
  isActive,
}: {
  scenario: ScenarioRow;
  isActive: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingActivatePermanently, setConfirmingActivatePermanently] = useState(false);

  return (
    <li className="rounded-lg border border-notion-hairline bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-notion-text">
            {scenario.name}
            {isActive && (
              <span className="ml-1.5 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
                Active - merged into Forecast &amp; Dashboard
              </span>
            )}
          </p>
          <Link href={`/scenarios/${scenario.id}`} className="text-sm text-notion-accent hover:underline">
            Manage items
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form action={toggleScenarioActive}>
            <input type="hidden" name="scenarioId" value={scenario.id} />
            <input type="hidden" name="active" value={isActive ? "false" : "true"} />
            <SubmitButton
              className={`rounded border px-3 py-1.5 text-sm ${
                isActive
                  ? "border-notion-hairline text-slate-500 hover:bg-notion-hover"
                  : "border-notion-accent text-notion-accent hover:bg-notion-hover"
              }`}
            >
              {isActive ? "Turn off" : "Turn on"}
            </SubmitButton>
          </form>
          {confirmingDelete ? (
            <>
              <span className="text-sm text-slate-600">Delete?</span>
              <form action={deleteScenario}>
                <input type="hidden" name="id" value={scenario.id} />
                <SubmitButton className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  Yes
                </SubmitButton>
              </form>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded border border-notion-hairline px-3 py-1.5 text-sm text-notion-text hover:bg-notion-hover"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
          {!confirmingActivatePermanently && (
            <button
              type="button"
              onClick={() => setConfirmingActivatePermanently(true)}
              className="rounded border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50"
            >
              Activate permanently
            </button>
          )}
        </div>
      </div>
      {confirmingActivatePermanently && (
        <ActivatePermanentlyForm scenario={scenario} onDone={() => setConfirmingActivatePermanently(false)} />
      )}
    </li>
  );
}

export function ScenariosClient({ scenarios }: { scenarios: ScenarioRow[] }) {
  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-notion-text">Scenarios</h1>
          <p className="text-slate-500">
            Try out a &ldquo;what if&rdquo; without touching your real numbers. Turn any number of
            them on and the Forecast and Dashboard include all of them at once; turn one off and
            it drops back out.
          </p>
        </div>

        <CreateScenarioForm />

        {scenarios.length === 0 ? (
          <p className="text-slate-500">No scenarios yet. Create one above.</p>
        ) : (
          <ul className="space-y-2">
            {scenarios.map((scenario) => (
              <ScenarioRowItem key={scenario.id} scenario={scenario} isActive={scenario.is_active} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
