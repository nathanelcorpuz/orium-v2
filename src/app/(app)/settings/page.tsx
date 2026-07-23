import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { ProfileForm } from "./ProfileForm";
import { PreferencesForm } from "./PreferencesForm";
import { DeleteAccountButton } from "./DeleteAccountModal";

const DEFAULT_BALANCE_RANGES = [0, 500000, 2000000, 5000000, 10000000];

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: userData }, preferencesRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("preferences").select("currency, balance_ranges").single(),
  ]);

  const user = userData.user;
  const name = (user?.user_metadata?.name as string | undefined) ?? "";
  const currency = preferencesRes.data?.currency ?? "₱";
  const balanceRanges = preferencesRes.data?.balance_ranges ?? DEFAULT_BALANCE_RANGES;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 text-xl font-semibold text-notion-text">Settings</h1>

        <div className="space-y-6">
          <ProfileForm email={user?.email ?? ""} name={name} />
          <PreferencesForm currency={currency} balanceRanges={balanceRanges} />

          <div className="rounded-lg border border-notion-hairline bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-notion-text">Account</h2>
            <div className="flex flex-wrap items-center gap-3">
              <form action={logout}>
                <button type="submit" className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90">
                  Log out
                </button>
              </form>
              <DeleteAccountButton />
            </div>
          </div>

          <div className="flex gap-4 text-sm text-slate-500">
            <Link href="/terms" className="underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
