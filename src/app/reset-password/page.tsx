"use client";

import { useActionState } from "react";
import { updatePassword, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <AuthCard title="Set a new password">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-600" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="confirmPassword">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-notion-text py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save new password"}
        </button>
      </form>
    </AuthCard>
  );
}
