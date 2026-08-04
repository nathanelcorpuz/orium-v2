"use client";

import { useActionState } from "react";
import { verifySignupCode, resendSignupVerificationCode, logout, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

// T271 (2026-08-04): the code-entry step, now its own page rather than a
// second view baked into /signup - signup() redirects here right after
// creating the account, and middleware.ts redirects back here on every
// other route for as long as `preferences.pending_email_verification` stays
// true (cleared by verifySignupCode() on a match).
export default function VerifyEmailPage() {
  const [verifyState, verifyAction, verifyPending] = useActionState(verifySignupCode, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendSignupVerificationCode, initialState);

  return (
    <AuthCard title="Confirm your email">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          We emailed you a 6-digit code. Enter it below to finish setting up your account.
        </p>
        <form action={verifyAction} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="code">
              6-digit code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              pattern="[0-9]{6}"
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-center text-lg tracking-[0.5em] text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          {verifyState.error && <p className="text-sm text-red-600">{verifyState.error}</p>}
          <button
            type="submit"
            disabled={verifyPending}
            className="w-full rounded bg-notion-text py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            {verifyPending ? "Confirming..." : "Confirm"}
          </button>
        </form>
        <form action={resendAction}>
          {resendState.message && <p className="mb-2 text-sm text-green-700">{resendState.message}</p>}
          {resendState.error && <p className="mb-2 text-sm text-red-600">{resendState.error}</p>}
          <button
            type="submit"
            disabled={resendPending}
            className="text-sm text-notion-accent underline hover:opacity-80 disabled:opacity-50"
          >
            {resendPending ? "Resending..." : "Resend code"}
          </button>
        </form>
        <form action={logout}>
          <button type="submit" className="text-sm text-slate-500 underline hover:opacity-80">
            Wrong email? Log out and start over
          </button>
        </form>
      </div>
    </AuthCard>
  );
}
