import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/api/dev-login", // the route itself 404s outside development
  // T121 fix (found in T124's testing): creating a fresh account is
  // inherently something you do while logged *out*, so without this the
  // route was only reachable when a session already existed - the exact
  // situation it exists to escape. Also 404s outside development.
  "/api/dev-new-account",
  // User request 2026-08-03: the daily due-today email digest. Triggered by
  // Vercel Cron (vercel.json), never by a logged-in browser session - the
  // route protects itself with its own bearer-token check
  // (src/app/api/cron/daily-notifications/route.ts), not this middleware.
  "/api/cron",
  "/health",
  "/privacy",
  "/terms",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // T271 (2026-08-04): a signed-in-but-unverified account (just created,
  // code not yet confirmed - see auth/actions.ts) can't reach anywhere else
  // until it clears verify-email. A plain query rather than mirroring the
  // flag into the JWT's user_metadata - simpler to reason about with one
  // source of truth (`preferences`), and this app's real scale doesn't need
  // the saved round-trip yet. Excludes /verify-email itself - logout isn't
  // its own route (a server action bound to a form, redirecting to /login,
  // already public), so nothing else needs excluding here.
  if (user && !isPublicPath && pathname !== "/verify-email") {
    const { data: prefs } = await supabase
      .from("preferences")
      .select("pending_email_verification")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prefs?.pending_email_verification) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify-email";
      return NextResponse.redirect(url);
    }
  }

  if (user && pathname === "/verify-email") {
    const { data: prefs } = await supabase
      .from("preferences")
      .select("pending_email_verification")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!prefs?.pending_email_verification) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
