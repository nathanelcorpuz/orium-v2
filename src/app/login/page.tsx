"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <AuthCard title="Log in">
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
        <div>
          <label className="block text-sm text-slate-600" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
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
          {pending ? "Logging in..." : "Log in"}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm text-slate-600">
        <Link href="/signup" className="underline">
          Sign up
        </Link>
        <Link href="/forgot-password" className="underline">
          Forgot password?
        </Link>
      </div>
    </AuthCard>
  );
}
