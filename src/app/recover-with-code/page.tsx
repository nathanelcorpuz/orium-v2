"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordWithRecoveryCode, type AuthActionState } from "@/app/auth/actions";
import { AuthCard } from "@/components/AuthCard";

const initialState: AuthActionState = { error: null };

// T269: the recovery path for a username-only account (no email, so no
// email-link reset - requestPasswordReset/forgot-password stays the path for
// email accounts). A correct username+code pair sets the new password
// directly and redirects to /save-recovery-code with a freshly-issued code,
// since the old one is now spent.
export default function RecoverWithCodePage() {
  const [state, formAction, pending] = useActionState(resetPasswordWithRecoveryCode, initialState);

  return (
    <AuthCard title="Reset with recovery code">
      <p className="mb-4 text-sm text-slate-600">
        For accounts signed up with just a username - no email involved. You&apos;ll need the
        recovery code you saved when you signed up.
      </p>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-600" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="code">
            Recovery code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            className="mt-1 w-full rounded border border-notion-hairline p-2 font-mono text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-notion-text py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Resetting..." : "Reset password"}
        </button>
      </form>
      <div className="mt-4 text-sm text-slate-600">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </div>
    </AuthCard>
  );
}
