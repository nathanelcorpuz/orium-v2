import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// T121: a service-role Supabase client. It bypasses RLS completely, so per
// CLAUDE.md's hard rule it must never be reachable from the browser - every
// caller is a server-only route that gates itself before ever creating one:
// the dev-only throwaway account route (`/api/dev-new-account`, 404s
// outside `next dev`) and the daily-notifications cron route (2026-08-03,
// its own bearer-secret check), which also needs it to query/email across
// every user rather than just the one signed-in caller a normal RLS-scoped
// client is limited to. Returning null (rather than throwing) when the key
// is absent lets each caller fall through to its own error response, so a
// missing key behaves like the feature not existing rather than crashing.
//
// The value in `SUPABASE_SERVICE_ROLE_KEY` is Supabase's newer secret key
// (`sb_secret_...`), not the legacy `service_role` JWT that Supabase has
// deprecated (confirmed with the user 2026-07-26). supabase-js treats both
// identically, and the env var name is our own choice, so it kept the
// original name rather than churning `.env.local`.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return null;

  return createSupabaseClient(url, secretKey, {
    // No cookies, no refresh loop - this client is used for one-shot admin
    // calls inside a single request, never to hold a user session.
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
