import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureUserPreferences } from "@/lib/supabase/preferences";

// T121 (user request 2026-07-26): testing onboarding properly means starting
// from a genuinely new account, but real signups send a confirmation email
// and Supabase's free tier answers "email rate limit exceeded" after a
// handful per hour - which had blocked onboarding testing entirely.
//
// T120's `/api/dev-reset-onboarding` resets the *existing* account's
// onboarding columns, which is quicker but not a faithful new user: currency,
// balance thresholds, tier labels, dismissed form tips and the sample-data
// stamp all survive it. This route instead creates a real, already-confirmed
// account through the admin API - no email is ever sent, because
// `email_confirm: true` marks it confirmed at creation - and signs into it.
//
// Dev-only twice over, exactly like `/api/dev-login`: refuses unless
// NODE_ENV is development AND the secret key is present. Neither is true on
// Vercel, so this cannot exist in production.
//
// Throwaway accounts are all `orium-dev+<timestamp>@example.com`. `example.com`
// is reserved by RFC 2606 and can never receive mail, so even a misconfigured
// Supabase project can't email a real person. The shared prefix is what makes
// `?cleanup=1` safe: it can only ever match accounts this route created, never
// the real test account or the user's own.
const THROWAWAY_PREFIX = "orium-dev+";
const THROWAWAY_DOMAIN = "@example.com";

export async function GET(request: Request) {
  // Reuses the existing dev-login password so a throwaway account can be
  // logged back into by hand - which is the only way to test T119's
  // "onboarding progress survives a logout" behaviour.
  const password = process.env.DEV_LOGIN_PASSWORD;
  const admin = createAdminClient();

  if (process.env.NODE_ENV !== "development" || !admin || !password) {
    return new Response("Not found", { status: 404 });
  }

  if (new URL(request.url).searchParams.get("cleanup") === "1") {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      return new Response(`Cleanup failed listing users: ${error.message}`, { status: 500 });
    }

    const throwaways = data.users.filter(
      (user) => user.email?.startsWith(THROWAWAY_PREFIX) && user.email.endsWith(THROWAWAY_DOMAIN),
    );

    const deleted: string[] = [];
    for (const user of throwaways) {
      // Every table's `user_id` is `references auth.users(id) on delete
      // cascade` (migrations 0001/0002/0003/0008/0011), so deleting the auth
      // user removes its financial rows and preferences with it - no separate
      // wipe pass needed here.
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) {
        return new Response(`Cleanup failed deleting ${user.email}: ${deleteError.message}`, {
          status: 500,
        });
      }
      deleted.push(user.email!);
    }

    return new Response(
      deleted.length === 0
        ? "No throwaway accounts to clean up."
        : `Deleted ${deleted.length} throwaway account(s):\n${deleted.join("\n")}`,
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const email = `${THROWAWAY_PREFIX}${Date.now()}${THROWAWAY_DOMAIN}`;

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) {
    return new Response(`Create failed: ${createError.message}`, { status: 500 });
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return new Response(`Sign-in failed: ${signInError.message}`, { status: 500 });
  }

  // The real signup path creates the preferences row here, not in the
  // database (`login()` in auth/actions.ts and /auth/callback both call this).
  // Matching it means the new account lands in exactly the state a genuine
  // first login produces, rather than an approximation of one.
  await ensureUserPreferences(supabase);

  // The created address rides along in the URL so it's visible without
  // digging through server logs - needed to log back in later, since the
  // sidebar only shows the local part.
  redirect(`/?devAccount=${encodeURIComponent(email)}`);
}
