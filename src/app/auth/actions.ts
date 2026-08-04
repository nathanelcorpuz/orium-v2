"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUserPreferences } from "@/lib/supabase/preferences";
import { codeExpiryFromNow, generateSignupCode, sendSignupVerificationEmail } from "@/lib/auth/signupVerification";

export type AuthActionState = { error: string | null; message?: string };

// Shared by signup() and resendSignupVerificationCode() below - generates a
// fresh code, upserts it (one row per user, a resend overwrites rather than
// accumulating), and emails it via nodemailer/Gmail. Runs with the caller's
// already-authenticated client, so the table's own `auth.uid() = user_id`
// RLS policies (migration 0053) apply normally - no admin client needed here.
async function issueAndSendCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  email: string,
): Promise<{ error: string | null }> {
  const code = generateSignupCode();
  const expiresAt = codeExpiryFromNow();
  const { error: upsertError } = await supabase
    .from("signup_verification_codes")
    .upsert({ user_id: userId, code, expires_at: expiresAt }, { onConflict: "user_id" });
  if (upsertError) return { error: upsertError.message };

  return sendSignupVerificationEmail(email, code);
}

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

// T271 (2026-08-04): "Now that we're going to use nodemailer, we can easily
// implement the code stuff don't we?" Bug #24/#25 traced Supabase's own
// "Confirm signup" email to a dead end - can't be edited or sent past
// ~2/hour without custom SMTP. This bypasses Supabase's mailer entirely:
// the account is created via the admin API already-confirmed
// (`email_confirm: true`), so Supabase never sends anything of its own: the
// app then owns the whole code generate/store/email/verify loop, backed by
// nodemailer + Gmail.
export async function signup(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const admin = createAdminClient();
  if (!admin) return { error: "Signup isn't configured yet - missing the service role key." };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) return { error: createError.message };

  // Establishes the real session/cookies immediately - same "signed in right
  // after signup" behavior the old flow had, just via the admin-created
  // account's own credentials instead of Supabase's own signUp().
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: signInError.message };

  await ensureUserPreferences(supabase);
  const { error: prefsError } = await supabase
    .from("preferences")
    .update({ pending_email_verification: true })
    .eq("user_id", created.user.id);
  if (prefsError) return { error: prefsError.message };

  const sendResult = await issueAndSendCode(supabase, created.user.id, email);
  if (sendResult.error) {
    return { error: `Account created, but the code couldn't be sent: ${sendResult.error}` };
  }

  redirect("/verify-email");
}

// The code-entry step's own submit action - checks the stored code
// (migration 0053) against what the user typed, and clears the
// `pending_email_verification` gate (middleware.ts) on a match.
export async function verifySignupCode(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const submitted = ((formData.get("code") as string) || "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: row, error: fetchError } = await supabase
    .from("signup_verification_codes")
    .select("code, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!row) return { error: "No pending code found - try resending." };
  if (new Date(row.expires_at) < new Date()) return { error: "This code has expired - resend a new one." };
  if (row.code !== submitted) return { error: "That code doesn't match. Check and try again." };

  const { error: updateError } = await supabase
    .from("preferences")
    .update({ pending_email_verification: false })
    .eq("user_id", user.id);
  if (updateError) return { error: updateError.message };

  await supabase.from("signup_verification_codes").delete().eq("user_id", user.id);

  redirect("/");
}

// Renamed from resendSignupOtp/resendSignupEmail across T132 -> Bug #24 ->
// T271's own revisions - always just re-issues a fresh code now.
export async function resendSignupVerificationCode(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's signature
  _prevState: AuthActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by <form action>'s signature; the user/email come from the session, not the form
  _formData: FormData,
): Promise<AuthActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Not signed in." };

  const result = await issueAndSendCode(supabase, user.id, user.email);
  if (result.error) return { error: result.error };

  return { error: null, message: "Code resent - check your inbox (and spam folder)." };
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
