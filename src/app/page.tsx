import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="rounded-xl bg-white p-8 text-center shadow">
        <p className="mb-4 text-slate-700">Welcome, {user?.email}</p>
        <Link href="/balances" className="mb-4 block underline">
          Balances
        </Link>
        <Link href="/bills" className="mb-4 block underline">
          Bills
        </Link>
        <Link href="/income" className="mb-4 block underline">
          Income
        </Link>
        <Link href="/debt" className="mb-4 block underline">
          Debt
        </Link>
        <Link href="/savings" className="mb-4 block underline">
          Savings
        </Link>
        <Link href="/extra" className="mb-4 block underline">
          Extras
        </Link>
        <Link href="/forecast" className="mb-4 block underline">
          Forecast
        </Link>
        <Link href="/history" className="mb-4 block underline">
          History
        </Link>
        <form action={logout}>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}
