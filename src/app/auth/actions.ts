"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUserPreferences } from "@/lib/supabase/preferences";
import { codeExpiryFromNow, generateSignupCode, sendSignupVerificationEmail } from "@/lib/auth/signupVerification";
import { generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode, RECOVERY_CODE_COOKIE } from "@/lib/auth/recoveryCode";
import { isValidUsername, normalizeUsername, usernameToSyntheticEmail } from "@/lib/auth/username";

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

// T269: the "Email" field doubles as "Email or username" now - an "@"
// means it's a real email (used as-is); anything else is resolved to a
// username-only account's synthetic identity email
// (usernameToSyntheticEmail). Supabase itself never sees the distinction -
// it's always just signing in with some email + password.
export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const rawInput = ((formData.get("email") as string) || "").trim();
  const password = formData.get("password") as string;
  const email = rawInput.includes("@") ? rawInput : usernameToSyntheticEmail(normalizeUsername(rawInput));

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

// T269 (SPEC.md, user priority 2026-08-08): "make it so a user can sign up
// using just a username. no emails for now, for privacy purposes." An
// alternative to signup() above, not a replacement - both stay reachable
// from /signup. Supabase Auth has no native "username only" identity, so
// this uses a synthetic identity email (usernameToSyntheticEmail) that's
// never actually emailed to and never shown to the user - same admin-API
// creation pattern signup()/`/api/dev-new-account` already use, already
// confirmed since there's nothing real to confirm. No code-verification step
// either, for the same reason. In its place: a one-time recovery code (the
// account's *only* password-reset path, since there's no real email for
// Supabase's own link-based reset to go to) - generated here, hashed+salted
// into `preferences` (never stored in plaintext), and handed to the client
// via a short-lived HttpOnly cookie so exactly one page
// (/save-recovery-code) can reveal it once.
export async function signupWithUsername(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const username = normalizeUsername((formData.get("username") as string) || "");
  const password = formData.get("password") as string;

  if (!isValidUsername(username)) {
    return {
      error:
        "Username must be 3-20 characters, starting with a letter, using only lowercase letters, numbers, and underscores.",
    };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Signup isn't configured yet - missing the service role key." };

  const email = usernameToSyntheticEmail(username);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    // Supabase's own "already registered" error is keyed off the synthetic
    // email, which would otherwise leak the users.orium.internal mechanism
    // in the UI - reworded, since a duplicate email at this call site can
    // only ever mean a duplicate username.
    if (/already|exists|registered/i.test(createError.message)) {
      return { error: "That username is already taken." };
    }
    return { error: createError.message };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: signInError.message };

  await ensureUserPreferences(supabase);

  const recoveryCode = generateRecoveryCode();
  const { hash, salt } = hashRecoveryCode(recoveryCode);
  const { error: prefsError } = await supabase
    .from("preferences")
    .update({
      username,
      recovery_code_hash: hash,
      recovery_code_salt: salt,
      pending_recovery_code_ack: true,
    })
    .eq("user_id", created.user.id);
  if (prefsError) return { error: prefsError.message };

  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_CODE_COOKIE, recoveryCode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  redirect("/save-recovery-code");
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

// T269: the recovery path for a username-only account - there's no email
// for Supabase's own resetPasswordForEmail (above) to send a link to, so
// this verifies the one-time code issued at signup (or by a previous
// recovery) directly against its stored hash, then sets the new password via
// the admin API - no session, no email link, no "current password" needed
// (the code itself proves ownership). Uses the service-role client
// throughout: there's no signed-in session at this point (that's the whole
// reason this flow exists), so a normal RLS-scoped client couldn't see this
// user's own `preferences` row to check the code against.
export async function resetPasswordWithRecoveryCode(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const username = normalizeUsername((formData.get("username") as string) || "");
  const code = ((formData.get("code") as string) || "").trim();
  const newPassword = (formData.get("newPassword") as string) || "";

  if (!username || !code || !newPassword) return { error: "Fill in every field." };
  if (newPassword.length < 6) return { error: "Password must be at least 6 characters." };

  const admin = createAdminClient();
  if (!admin) return { error: "Account recovery isn't configured yet - missing the service role key." };

  const { data: prefs, error: fetchError } = await admin
    .from("preferences")
    .select("user_id, recovery_code_hash, recovery_code_salt")
    .eq("username", username)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  // Same generic message either way (unknown username vs. wrong code) - a
  // more specific one would let an attacker enumerate real usernames.
  if (!prefs || !prefs.recovery_code_hash || !prefs.recovery_code_salt) {
    return { error: "That username and recovery code don't match." };
  }
  if (!verifyRecoveryCode(code, prefs.recovery_code_salt, prefs.recovery_code_hash)) {
    return { error: "That username and recovery code don't match." };
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(prefs.user_id, { password: newPassword });
  if (updateError) return { error: updateError.message };

  // The code just used is spent - a fresh one is issued immediately, same
  // reveal-once flow signup used, since proving the old code is exactly as
  // strong an identity check as signing up fresh.
  const newCode = generateRecoveryCode();
  const { hash, salt } = hashRecoveryCode(newCode);
  const { error: prefsUpdateError } = await admin
    .from("preferences")
    .update({ recovery_code_hash: hash, recovery_code_salt: salt, pending_recovery_code_ack: true })
    .eq("user_id", prefs.user_id);
  if (prefsUpdateError) return { error: prefsUpdateError.message };

  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_CODE_COOKIE, newCode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });

  // Signs in with the new password so the user lands on /save-recovery-code
  // already authenticated, matching signupWithUsername's own flow.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: usernameToSyntheticEmail(username),
    password: newPassword,
  });
  if (signInError) return { error: signInError.message };

  redirect("/save-recovery-code");
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

// T269: the /save-recovery-code page's own submit - clears the
// `pending_recovery_code_ack` gate (middleware.ts, mirrors
// `pending_email_verification`'s own shape) and the reveal cookie, since the
// code has now been shown and there's no reason for either to linger.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by <form action> signature
export async function acknowledgeRecoveryCode(_formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("preferences").update({ pending_recovery_code_ack: false }).eq("user_id", user.id);

  const cookieStore = await cookies();
  cookieStore.delete(RECOVERY_CODE_COOKIE);

  redirect("/");
}
