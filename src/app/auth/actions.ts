"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPreferences } from "@/lib/supabase/preferences";

export type AuthActionState = { error: string | null; message?: string };

export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  await ensureUserPreferences(supabase);
  redirect("/");
}

export async function signup(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const origin = (await headers()).get("origin");

  const supabase = await createClient();
  // T132 (2026-07-27) moved this to a typed 6-digit code, on the assumption
  // the "Confirm signup" email template could be edited to show only the
  // code, not a link. Reverted 2026-08-04: Supabase now refuses to save any
  // Email Templates edit at all without custom SMTP configured first (Bug
  // #24/BUGS.md), which isn't set up yet - so the email has always kept
  // showing a working confirmation link regardless of what the app's own UI
  // asked for. Rather than fight a link that can't be removed, the app now
  // leans on it as the primary path - simpler for the user than a code that
  // was never actually the only thing in the email.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };

  return {
    error: null,
    message: "Check your email and click the confirmation link to activate your account.",
  };
}

// Supabase enforces its own per-user cooldown between resend requests
// (`auth.rate_limits.signup_confirmation.period`) - a too-soon resend
// surfaces as a normal `error.message` here, same as every other action in
// this file. Renamed from `resendSignupOtp` 2026-08-04 when the code-entry
// step was removed - this always just re-triggers the same confirmation
// email regardless, so only the name (and the copy below) needed to change.
export async function resendSignupEmail(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) return { error: error.message };

  return { error: null, message: "Confirmation email resent - check your inbox (and spam folder)." };
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const origin = (await headers()).get("origin");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error) return { error: error.message };

  return { error: null, message: "Check your email for a password reset link." };
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by <form action> signature
export async function logout(_formData: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
