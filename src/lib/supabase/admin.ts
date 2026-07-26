import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// T121: a service-role Supabase client, used only by the dev-only throwaway
// account route (`/api/dev-new-account`). It bypasses RLS completely, so
// per CLAUDE.md's hard rule it must never be reachable from the browser:
// this module is imported by that one server route and nothing else, and
// the route itself 404s outside `next dev`. Returning null (rather than
// throwing) when the key is absent lets the route fall through to its own
// 404, so a missing key behaves exactly like the feature not existing -
// which is what production is.
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
