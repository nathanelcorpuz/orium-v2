export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {/* User request (2026-07-26): a tall form (Add bill's recurrence
          picker, for one) had no way to scroll, pushing Cancel/Save off the
          bottom of the screen with no way to reach them. `max-h-[90vh]` plus
          `overflow-y-auto` here fixes every modal in the app at once, since
          they all render through this one component. */}
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-notion-hairline bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-notion-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
