import { createClient } from "@/lib/supabase/server";

export default async function HealthPage() {
  const supabase = await createClient();

  const { error } = await supabase
    .from("__orium_health_check__")
    .select("*")
    .limit(1);

  // No tables exist yet (that comes in T4), so a "relation does not
  // exist" error means we successfully reached Supabase's database.
  // Any other error (bad key, network failure) means we did not.
  const connected = error?.code === "42P01" || error?.code === "PGRST205";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="rounded-xl bg-white p-8 shadow">
        <h1 className="mb-4 text-xl font-semibold">Supabase Health Check</h1>
        {connected ? (
          <p className="text-green-600">✅ Connected to Supabase.</p>
        ) : (
          <div className="text-red-600">
            <p>❌ Could not confirm connection.</p>
            {error && (
              <pre className="mt-2 max-w-md overflow-x-auto rounded bg-slate-100 p-2 text-xs text-slate-800">
                {JSON.stringify(error, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
