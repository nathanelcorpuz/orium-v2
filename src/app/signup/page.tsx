"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup, signupWithUsername, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";
import { SegmentedControl } from "@/components/SegmentedControl";

const initialState: AuthActionState = { error: null };

// T271 (2026-08-04): signup() now redirects straight to /verify-email on
// success (via the admin-API + nodemailer flow, see auth/actions.ts) rather
// than returning a "check your email" message here - this page only ever
// needs to handle the plain email/password form and its own error state.
//
// T269 (2026-08-08, user priority): a second path, signupWithUsername(), for
// privacy-conscious users who'd rather not give an email at all - toggled
// here rather than living on a separate route, so "how do I sign up" stays
// one page with one obvious choice up top.
export default function SignupPage() {
  const [mode, setMode] = useState<"email" | "username">("email");
  const [signupState, signupAction, signupPending] = useActionState(signup, initialState);
  const [usernameState, usernameAction, usernamePending] = useActionState(signupWithUsername, initialState);

  return (
    <AuthCard title="Sign up">
      <div className="mb-4">
        <SegmentedControl
          options={[
            { value: "email" as const, label: "Email" },
            { value: "username" as const, label: "Username only" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      {mode === "email" ? (
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
      ) : (
        <form action={usernameAction} className="space-y-4">
          <p className="text-xs text-slate-500">
            No email needed - just a username and password. You&apos;ll get a one-time recovery
            code afterward, since there&apos;s no email to reset your password with if you forget
            it.
          </p>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z][a-zA-Z0-9_]{2,19}"
              autoComplete="username"
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              3-20 characters, starting with a letter - lowercase letters, numbers, and underscores
              only.
            </p>
          </div>
          <div>
            <label className="block text-sm text-slate-600" htmlFor="username-password">
              Password
            </label>
            <input
              id="username-password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
            />
          </div>
          {usernameState.error && <p className="text-sm text-red-600">{usernameState.error}</p>}
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
            disabled={usernamePending}
            className="w-full rounded bg-notion-text py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            {usernamePending ? "Signing up..." : "Sign up"}
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
