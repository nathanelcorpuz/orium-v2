"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <AuthCard title="Forgot password">
      {state.message ? (
        <p className="text-sm text-green-700">{state.message}</p>
      ) : (
        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded border border-slate-300 p-2"
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-50"
          >
            {pending ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
      <div className="mt-4 text-sm text-slate-600">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </div>
    </AuthCard>
  );
}
