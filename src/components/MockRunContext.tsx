"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addAccountFunds, moveAccountFunds, takeAccountFunds } from "@/app/(app)/accounts/actions";

// Mock run v1 (2026-08-04, user request): "actually let's implement the mock
// run... I want the option to activate that mock run permanently... I don't
// want to do all those steps again." Deliberately scoped to exactly the
// motivating example - Add/Take/Move funds on real accounts - not tied to
// Scenarios at all (the user's own instruction: "no relation to scenarios").
// Forecast-table actions (edit/settle) are a v2 candidate once this pattern
// is proven; wiring those in now would mean branching two much more
// complex, deeply-tested components (EditSettleModal, forecast.ts's own
// consumers) in one pass, which is a bigger risk than this session should
// take on for a first cut.
//
// Mechanism: while active, this context holds a *cloned* copy of the real
// balances, mutated locally as Add/Take/Move funds are used - nothing is
// written to the database. Every accepted action is also recorded as an
// "intent" (the same field shape the real server actions themselves read
// from FormData), so "make real" can replay them through the real actions
// unchanged, in order - reusing the exact same logged/fee-aware code path
// real usage already goes through, rather than re-implementing it.

export type MockBalance = { id: string; name: string; amount: number };

type MockIntent =
  | { kind: "add"; balanceId: string; balanceName: string; amountPesos: string; entryDate: string; note: string }
  | { kind: "take"; balanceId: string; balanceName: string; amountPesos: string; entryDate: string; note: string }
  | {
      kind: "move";
      fromBalanceId: string;
      fromBalanceName: string;
      toBalanceId: string;
      toBalanceName: string;
      amountPesos: string;
      entryDate: string;
      note: string;
    };

// Human-readable summary for the "make real" confirmation list.
function describeIntent(intent: MockIntent): string {
  const amount = `₱${intent.amountPesos}`;
  if (intent.kind === "add") return `Add ${amount} to ${intent.balanceName}`;
  if (intent.kind === "take") return `Take ${amount} from ${intent.balanceName}`;
  return `Move ${amount} from ${intent.fromBalanceName} to ${intent.toBalanceName}`;
}

type MockRunContextValue = {
  active: boolean;
  balances: MockBalance[];
  intents: MockIntent[];
  intentSummaries: string[];
  start: (realBalances: MockBalance[]) => void;
  discard: () => void;
  applyAdd: (balanceId: string, balanceName: string, amountPesos: string, entryDate: string, note: string) => void;
  applyTake: (balanceId: string, balanceName: string, amountPesos: string, entryDate: string, note: string) => void;
  applyMove: (
    fromBalanceId: string,
    fromBalanceName: string,
    toBalanceId: string,
    toBalanceName: string,
    amountPesos: string,
    entryDate: string,
    note: string,
  ) => void;
  makeReal: () => Promise<{ error: string | null }>;
  makingReal: boolean;
};

const MockRunContext = createContext<MockRunContextValue | null>(null);

// Mirrors src/lib/money.ts's parseCentavos exactly (string-split, no
// floating-point multiplication) - only affects the local preview number,
// since "make real" always re-validates the original string through the
// real action's own parseCentavos, but there's no reason for the preview to
// be any less precise. The modal already validated this string before
// calling apply*, so a null here (malformed input) can't actually happen -
// falls back to 0 rather than throwing, purely as cheap insurance.
function pesosToCentavos(pesos: string): number {
  const trimmed = pesos.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 0;
  const [wholePart, decimalPart = ""] = trimmed.split(".");
  const cents = (decimalPart + "00").slice(0, 2);
  return Number(wholePart) * 100 + Number(cents);
}

function toFormData(intent: MockIntent): FormData {
  const fd = new FormData();
  if (intent.kind === "move") {
    fd.set("fromBalanceId", intent.fromBalanceId);
    fd.set("fromBalanceName", intent.fromBalanceName);
    fd.set("toBalanceId", intent.toBalanceId);
    fd.set("toBalanceName", intent.toBalanceName);
  } else {
    fd.set("balanceId", intent.balanceId);
    fd.set("balanceName", intent.balanceName);
  }
  fd.set("amountPesos", intent.amountPesos);
  fd.set("entryDate", intent.entryDate);
  fd.set("note", intent.note);
  return fd;
}

export function MockRunProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [balances, setBalances] = useState<MockBalance[]>([]);
  const [intents, setIntents] = useState<MockIntent[]>([]);
  const [makingReal, setMakingReal] = useState(false);

  const start = useCallback((realBalances: MockBalance[]) => {
    setBalances(realBalances.map((b) => ({ ...b })));
    setIntents([]);
    setActive(true);
  }, []);

  const discard = useCallback(() => {
    setActive(false);
    setBalances([]);
    setIntents([]);
  }, []);

  const applyAdd = useCallback(
    (balanceId: string, balanceName: string, amountPesos: string, entryDate: string, note: string) => {
      const amount = pesosToCentavos(amountPesos);
      setBalances((prev) => prev.map((b) => (b.id === balanceId ? { ...b, amount: b.amount + amount } : b)));
      setIntents((prev) => [...prev, { kind: "add", balanceId, balanceName, amountPesos, entryDate, note }]);
    },
    [],
  );

  const applyTake = useCallback(
    (balanceId: string, balanceName: string, amountPesos: string, entryDate: string, note: string) => {
      const amount = pesosToCentavos(amountPesos);
      setBalances((prev) => prev.map((b) => (b.id === balanceId ? { ...b, amount: b.amount - amount } : b)));
      setIntents((prev) => [...prev, { kind: "take", balanceId, balanceName, amountPesos, entryDate, note }]);
    },
    [],
  );

  const applyMove = useCallback(
    (
      fromBalanceId: string,
      fromBalanceName: string,
      toBalanceId: string,
      toBalanceName: string,
      amountPesos: string,
      entryDate: string,
      note: string,
    ) => {
      const amount = pesosToCentavos(amountPesos);
      setBalances((prev) =>
        prev.map((b) => {
          if (b.id === fromBalanceId) return { ...b, amount: b.amount - amount };
          if (b.id === toBalanceId) return { ...b, amount: b.amount + amount };
          return b;
        }),
      );
      setIntents((prev) => [
        ...prev,
        { kind: "move", fromBalanceId, fromBalanceName, toBalanceId, toBalanceName, amountPesos, entryDate, note },
      ]);
    },
    [],
  );

  // Replays every queued intent through the real server actions, in order -
  // the same code path (fees, balance_transactions rows, activity log) real
  // usage already goes through, just triggered as a batch instead of one at
  // a time. Stops at the first failure so a partial batch never applies
  // silently past an error - the queue is left intact so the user can see
  // which intents already went through (earlier ones) versus what's still
  // pending, rather than losing the whole batch on one bad entry.
  const makeReal = useCallback(async (): Promise<{ error: string | null }> => {
    setMakingReal(true);
    try {
      for (const intent of intents) {
        const action = intent.kind === "add" ? addAccountFunds : intent.kind === "take" ? takeAccountFunds : moveAccountFunds;
        const result = await action({ error: null }, toFormData(intent));
        if (result.error) {
          // Leave this intent and everything after it in the queue - only
          // the ones that already succeeded (removed below, each loop) are
          // gone, so the banner can show exactly what's still pending.
          return { error: `"${describeIntent(intent)}" failed: ${result.error}` };
        }
        setIntents((prev) => prev.filter((i) => i !== intent));
      }
      setActive(false);
      setBalances([]);
      router.refresh();
      return { error: null };
    } finally {
      setMakingReal(false);
    }
  }, [intents, router]);

  const value = useMemo<MockRunContextValue>(
    () => ({
      active,
      balances,
      intents,
      intentSummaries: intents.map(describeIntent),
      start,
      discard,
      applyAdd,
      applyTake,
      applyMove,
      makeReal,
      makingReal,
    }),
    [active, balances, intents, start, discard, applyAdd, applyTake, applyMove, makeReal, makingReal],
  );

  return <MockRunContext.Provider value={value}>{children}</MockRunContext.Provider>;
}

export function useMockRun(): MockRunContextValue {
  const ctx = useContext(MockRunContext);
  if (!ctx) throw new Error("useMockRun must be used within MockRunProvider");
  return ctx;
}
