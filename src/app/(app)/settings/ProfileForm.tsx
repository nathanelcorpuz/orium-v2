"use client";

import { useActionState } from "react";
import { updateProfile, type SettingsActionState } from "./actions";

const initialState: SettingsActionState = { error: null };

export function ProfileForm({ email, name }: { email: string; name: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <div className="rounded-lg border border-notion-hairline bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-notion-text">Profile</h2>
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
            className="mt-1 w-full rounded border border-notion-hairline bg-notion-hover p-2 text-slate-500"
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
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && !state.error && <p className="text-sm text-green-700">{state.message}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}
