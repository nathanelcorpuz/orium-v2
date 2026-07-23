export function AuthCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-sm rounded-lg border border-notion-hairline bg-white p-8">
        <h1 className="mb-6 text-xl font-semibold text-notion-text">{title}</h1>
        {children}
      </div>
    </main>
  );
}
