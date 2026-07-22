"use client";

import { useActionState } from "react";
import { updateProfile, type SettingsActionState } from "./actions";

const initialState: SettingsActionState = { error: null };

export function ProfileForm({ email, name }: { email: string; name: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Profile</h2>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-600" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            disabled
            className="mt-1 w-full rounded border border-slate-200 bg-slate-100 p-2 text-slate-500"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            defaultValue={name}
            className="mt-1 w-full rounded border border-slate-300 p-2"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && !state.error && <p className="text-sm text-green-700">{state.message}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}
