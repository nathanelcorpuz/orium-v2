import { LogoMark } from "./navIcons";

// T95: the same mark + "Orium" lockup AppShell.tsx uses (T94), sitting above
// the card rather than inside it - a light branded touch on an otherwise
// plain auth flow, not a redesign of the card itself.
export function AuthCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-8">
      <div className="flex items-center gap-2">
        <LogoMark className="h-6 w-6 text-notion-text" />
        <span className="text-lg font-semibold text-notion-text">Orium</span>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-notion-hairline bg-white p-8">
        <h1 className="mb-6 text-xl font-semibold text-notion-text">{title}</h1>
        {children}
      </div>
    </main>
  );
}
