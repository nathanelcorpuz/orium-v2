"use client";

import { useEffect, useState } from "react";

// T145 (user request): persists a user's custom row order per finance list
// in localStorage - same pattern T117/T118 established for the Dashboard
// widget panel (a client-only display preference, not synced data, so no
// DB column). Up/down buttons rather than real drag-and-drop, per that same
// task's reasoning (native HTML5 drag has no touch support; a drag library
// needs explicit sign-off per CLAUDE.md's "no new dependencies" rule).
//
// Starts with an empty order on both server and first client render (same
// hydration-safe pattern AppShell.tsx's sidebar-collapse state already
// documents), then reads the real stored order in a post-mount effect - a
// lazy initializer reading localStorage during render would produce a real
// server/client markup mismatch, not just a lint complaint.
//
// Reconciles on every render: ids no longer present are dropped, new ids
// are appended at the end - so a freshly-added item always shows up
// (forward-compatible the same way T117/T118's widget reconcile() is),
// and a deleted item's stored position doesn't leave a gap.
export function useOrderedList<T>(storageKey: string, items: T[], getId: (item: T) => string) {
  const [storedOrder, setStoredOrder] = useState<string[]>([]);

  useEffect(() => {
    // Reading localStorage during the lazy useState initializer instead
    // would avoid this effect, but its return value would then differ
    // between the server render (no `window`) and the client's first
    // render, which is a real hydration mismatch - not just a lint
    // preference. Setting state here, after hydration, is the correct fix
    // for this specific SSR-plus-localStorage case, matching AppShell.tsx's
    // own sidebar-collapse state.
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(parsed)) setStoredOrder(parsed);
    } catch {
      // Malformed/stale value - fall through to the natural order.
    }
  }, [storageKey]);

  const currentIds = items.map(getId);
  const currentIdSet = new Set(currentIds);
  const known = storedOrder.filter((id) => currentIdSet.has(id));
  const knownSet = new Set(known);
  const effectiveOrder = [...known, ...currentIds.filter((id) => !knownSet.has(id))];

  function persist(next: string[]) {
    setStoredOrder(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  const byId = new Map(items.map((item) => [getId(item), item]));
  const orderedItems = effectiveOrder
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);

  function swap(id: string, direction: -1 | 1) {
    const index = effectiveOrder.indexOf(id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= effectiveOrder.length) return;
    const next = [...effectiveOrder];
    [next[index], next[target]] = [next[target], next[index]];
    persist(next);
  }

  // T177: drag-and-drop reorder (Reminders) - moves id to sit at targetIndex
  // in the current order, same persisted-order mechanism swap() already
  // uses. A no-op if id isn't found or it's already at that index, so a
  // drag hook can call this on every pointermove without guarding itself.
  function moveToIndex(id: string, targetIndex: number) {
    const index = effectiveOrder.indexOf(id);
    if (index === -1 || index === targetIndex) return;
    const next = [...effectiveOrder];
    const [moved] = next.splice(index, 1);
    next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, moved);
    persist(next);
  }

  return {
    orderedItems,
    moveUp: (id: string) => swap(id, -1),
    moveDown: (id: string) => swap(id, 1),
    moveToIndex,
  };
}
