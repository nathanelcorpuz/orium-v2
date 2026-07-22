import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/displayName";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profileName = (user?.user_metadata?.name as string | undefined) ?? "";
  const greetingName = displayName(profileName, user?.email);

  return <AppShell greetingName={greetingName}>{children}</AppShell>;
}
