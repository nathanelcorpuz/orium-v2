"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-sm rounded-lg border border-notion-hairline bg-white p-8 text-center">
        <h1 className="mb-2 text-lg font-semibold text-notion-text">Something went wrong</h1>
        <p className="mb-4 text-sm text-slate-600">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded bg-notion-text px-4 py-2 text-white hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
