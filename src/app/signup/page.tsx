"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

// T271 (2026-08-04): signup() now redirects straight to /verify-email on
// success (via the admin-API + nodemailer flow, see auth/actions.ts) rather
// than returning a "check your email" message here - this page only ever
// needs to handle the plain email/password form and its own error state.
export default function SignupPage() {
  const [signupState, signupAction, signupPending] = useActionState(signup, initialState);

  return (
    <AuthCard title="Sign up">
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
      <div className="mt-4 text-sm text-slate-600">
        <Link href="/login" className="underline">
          Already have an account? Log in
        </Link>
      </div>
    </AuthCard>
  );
}
