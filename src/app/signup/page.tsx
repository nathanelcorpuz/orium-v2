"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup, resendSignupEmail, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

// Reverted 2026-08-04 from T132's typed-code flow: Supabase won't save an
// Email Templates edit without custom SMTP configured first (Bug #24/
// BUGS.md), so the confirmation email has always kept its working link
// regardless of what this page asked the user to do with it. Simpler to
// point people at the link that's guaranteed to be there than to keep
// maintaining a code-entry step alongside it. The form still tracks the
// submitted email in local state, now only so "Resend confirmation email"
// has it to send along.
export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [signupState, signupAction, signupPending] = useActionState(signup, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendSignupEmail, initialState);

  const awaitingConfirmation = signupState.message !== undefined;

  return (
    <AuthCard title="Sign up">
      {awaitingConfirmation ? (
        <div className="space-y-4">
          <p className="text-sm text-green-700">{resendState.message ?? signupState.message}</p>
          <form action={resendAction}>
            <input type="hidden" name="email" value={email} />
            {resendState.error && <p className="mb-2 text-sm text-red-600">{resendState.error}</p>}
            <button
              type="submit"
              disabled={resendPending}
              className="text-sm text-notion-accent underline hover:opacity-80 disabled:opacity-50"
            >
              {resendPending ? "Resending..." : "Resend confirmation email"}
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
