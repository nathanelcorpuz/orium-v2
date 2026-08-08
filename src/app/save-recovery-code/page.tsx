import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acknowledgeRecoveryCode } from "@/app/auth/actions";
import { RECOVERY_CODE_COOKIE } from "@/lib/auth/recoveryCode";
import { AuthCard } from "@/components/AuthCard";

// T269: reached right after signupWithUsername()/resetPasswordWithRecoveryCode()
// redirect here (both set the short-lived HttpOnly reveal cookie first) -
// middleware.ts also redirects here for as long as
// `preferences.pending_recovery_code_ack` stays true, the same gate shape
// `/verify-email` already established for `pending_email_verification`.
export default async function SaveRecoveryCodePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const code = cookieStore.get(RECOVERY_CODE_COOKIE)?.value ?? null;

  // Cookie expired or was already consumed (e.g. the page was reloaded well
  // after signup) - nothing left to reveal. Rather than get stuck (the
  // pending flag would otherwise keep redirecting back here with nothing to
  // show), acknowledge it silently and move on; the user just won't see
  // this exact code again, which is the same risk as not saving it in time
  // regardless.
  if (!code) {
    await supabase.from("preferences").update({ pending_recovery_code_ack: false }).eq("user_id", user.id);
    redirect("/");
  }

  return (
    <AuthCard title="Save your recovery code">
      <p className="mb-4 text-sm text-slate-600">
        Since this account has no email on file, this code is the only way to reset your password
        if you ever forget it. <strong>It&apos;s shown only this once</strong> - save it somewhere
        safe (a password manager, or written down) before continuing.
      </p>
      <p className="mb-4 rounded border border-notion-hairline bg-notion-hover/40 p-3 text-center font-mono text-lg tracking-wider text-notion-text">
        {code}
      </p>
      <form action={acknowledgeRecoveryCode}>
        <button type="submit" className="w-full rounded bg-notion-text py-2 text-white hover:opacity-90">
          I&apos;ve saved it - continue
        </button>
      </form>
    </AuthCard>
  );
}
