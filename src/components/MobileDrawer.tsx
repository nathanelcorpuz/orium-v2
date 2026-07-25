"use client";

import { useEffect } from "react";

// Shared off-canvas drawer for mobile nav (T89): a backdrop + slide-in panel
// pinned to either edge, used by AppShell (left, main nav) and
// RemindersPanel (right, Forecast reminders) - both need identical open/
// close behavior, just mirrored. Always inert at `lg` and up (the `lg:hidden`
// wrapper) since both callers render their own always-visible desktop layout
// at that breakpoint.
export function MobileDrawer({
  open,
  onClose,
  side,
  widthClassName = "w-72",
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  widthClassName?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-40 lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute top-0 flex h-full ${widthClassName} max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 ${
          side === "left" ? "left-0" : "right-0"
        } ${open ? "translate-x-0" : side === "left" ? "-translate-x-full" : "translate-x-full"}`}
      >
        {children}
      </div>
    </div>
  );
}
