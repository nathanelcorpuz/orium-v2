import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureUserPreferences } from "@/lib/supabase/preferences";

// Dev-only auto-login for automated browser verification (see project
// memory / SPEC.md Operations). Signs in the test account whose
// credentials live in .env.local — never committed, never present on
// Vercel — so local tooling can reach a logged-in state without a
// password ever appearing in a form or transcript. Hard-refuses outside
// `next dev`: in production NODE_ENV is "production" AND the env vars
// don't exist, so this responds 404 no matter what.
export async function GET() {
  const email = process.env.DEV_LOGIN_EMAIL;
  const password = process.env.DEV_LOGIN_PASSWORD;

  if (process.env.NODE_ENV !== "development" || !email || !password) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return new Response(`Dev login failed: ${error.message}`, { status: 500 });
  }

  await ensureUserPreferences(supabase);
  redirect("/");
}
