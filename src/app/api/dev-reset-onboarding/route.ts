import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { wipeFinancialData } from "@/lib/wipeFinancialData";

// T120 (user report 2026-07-26): re-testing onboarding previously meant
// signing up a brand-new account each time, and Supabase's free-tier auth
// email quota ("email rate limit exceeded") cuts that off after a handful
// of signups per hour - which blocked testing the flow entirely.
//
// This resets the *existing* logged-in account back to a brand-new
// onboarding state instead, so the whole flow (welcome choice -> tour, or
// welcome choice -> guided setup) can be replayed as many times as needed
// without a single new signup or confirmation email.
//
// Dev-only, exactly like /api/dev-login: refuses outright unless
// NODE_ENV === "development", so it can never be reached on Vercel.
//
// `?wipe=1` additionally clears the account's financial rows, for testing
// the genuinely-empty new-user experience (the tour's placeholder data, the
// wizard's required steps). Left opt-in rather than the default since it's
// destructive and most onboarding re-tests don't need it.
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("preferences")
    .update({
      // Back to "never been asked" - the welcome modal is the entry point.
      onboarding_choice: null,
      onboarding_tour_step: null,
      onboarding_tour_completed_at: null,
      // T126: `onboarding_required_completed`, `onboarding_dismissed_at` and
      // `onboarding_post_tour_choice` used to be reset here too. All three
      // were dropped once the hard gate and the post-tour prompt they drove
      // were removed (T123), so there is nothing left to reset.
      onboarding_wizard_state: null,
      onboarding_skipped_steps: [],
    })
    .eq("user_id", user.id);
  if (error) {
    return new Response(`Reset failed: ${error.message}`, { status: 500 });
  }

  if (new URL(request.url).searchParams.get("wipe") === "1") {
    const wipeError = await wipeFinancialData(supabase, user.id);
    if (wipeError) {
      return new Response(`Wipe failed: ${wipeError}`, { status: 500 });
    }
    const { error: stampError } = await supabase
      .from("preferences")
      .update({ sample_data_seeded_at: null })
      .eq("user_id", user.id);
    if (stampError) {
      return new Response(`Wipe failed clearing seed stamp: ${stampError.message}`, { status: 500 });
    }
  }

  redirect("/");
}
