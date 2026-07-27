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
  // `emailRedirectTo` is kept even though the signup page now asks for a
  // typed code rather than a click - see the "Confirm signup" email
  // template note in SPEC.md. If that template still includes
  // `{{ .ConfirmationURL }}` (e.g. before it's been edited, or for an email
  // already sent), the link keeps working via /auth/callback regardless.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };

  return { error: null, message: "Check your email to confirm your account." };
}

// User request (2026-07-27): a typed 6-digit code instead of a confirmation
// link - a code can be entered on this same page rather than needing to
// leave it, and Supabase's own `{{ .Token }}` email-template variable
// supports exactly this without a separate link/redirect flow. Uses the same
// SSR client + `ensureUserPreferences` + redirect pattern as `login` above,
// since `verifyOtp` establishes the session the same way a password sign-in
// does.
export async function verifySignupOtp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const token = formData.get("token") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) return { error: error.message };

  await ensureUserPreferences(supabase);
  redirect("/");
}

// Supabase enforces its own per-user cooldown between resend requests
// (`auth.rate_limits.signup_confirmation.period`) - a too-soon resend
// surfaces as a normal `error.message` here, same as every other action in
// this file.
export async function resendSignupOtp(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) return { error: error.message };

  return { error: null, message: "Code resent - check your email." };
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
