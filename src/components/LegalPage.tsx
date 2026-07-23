import Link from "next/link";

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-notion-hairline bg-white p-8">
        <Link href="/" className="text-sm text-slate-500 underline">
          &larr; Home
        </Link>
        <h1 className="mb-1 mt-4 text-2xl font-semibold text-notion-text">{title}</h1>
        <p className="mb-6 text-sm text-slate-500">Last updated: {lastUpdated}</p>
        <div className="space-y-4 text-sm leading-relaxed text-slate-700">{children}</div>
      </div>
    </main>
  );
}

export function LegalHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 text-base font-semibold text-notion-text">{children}</h2>;
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5">{children}</ul>;
}
