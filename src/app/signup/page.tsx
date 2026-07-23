"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <AuthCard title="Sign up">
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
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
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
            disabled={pending}
            className="w-full rounded bg-notion-text py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Signing up..." : "Sign up"}
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
