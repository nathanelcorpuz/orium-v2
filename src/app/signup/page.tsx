"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup, verifySignupOtp, resendSignupOtp, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

// User request (2026-07-27): a typed 6-digit code instead of "click the link
// in your email" - the signup form itself tracks the submitted email in
// local state so the second step (code entry) has it to send along, since
// the server action's own state doesn't carry it back.
export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [signupState, signupAction, signupPending] = useActionState(signup, initialState);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifySignupOtp, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendSignupOtp, initialState);

  const awaitingCode = signupState.message !== undefined;

  return (
    <AuthCard title="Sign up">
      {awaitingCode ? (
        <div className="space-y-4">
          <p className="text-sm text-green-700">{resendState.message ?? signupState.message}</p>
          <form action={verifyAction} className="space-y-4">
            <input type="hidden" name="email" value={email} />
            <div>
              <label className="block text-sm text-slate-600" htmlFor="token">
                6-digit code
              </label>
              <input
                id="token"
                name="token"
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
            <input type="hidden" name="email" value={email} />
            {resendState.error && <p className="mb-2 text-sm text-red-600">{resendState.error}</p>}
            <button
              type="submit"
              disabled={resendPending}
              className="text-sm text-notion-accent underline hover:opacity-80 disabled:opacity-50"
            >
              {resendPending ? "Resending..." : "Resend code"}
            </button>
          </form>
        </div>
      ) : (
        <form action={signupAction} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="password">
              Password
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
          {signupState.error && <p className="text-sm text-red-600">{signupState.error}</p>}
          <p className="text-xs text-slate-500">
            By signing up, you agree to our{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
          <button
            type="submit"
            disabled={signupPending}
            className="w-full rounded bg-notion-text py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            {signupPending ? "Signing up..." : "Sign up"}
          </button>
        </form>
      )}
      <div className="mt-4 text-sm text-slate-600">
        <Link href="/login" className="underline">
          Already have an account? Log in
        </Link>
      </div>
    </AuthCard>
  );
}
