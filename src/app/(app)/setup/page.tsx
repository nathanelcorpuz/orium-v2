import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/OnboardingWizard";

// T123 (SPEC.md Phase 18, "The agreed flow"): guided setup used to render
// *instead of* the entire app from `(app)/layout.tsx` - that gate is what
// made it a block. It's now an ordinary page inside the normal shell, so
// "onboarding never blocks a route" holds structurally rather than by way
// of an escape hatch: the nav is right there, and leaving is just clicking
// something else.
//
// The queries below moved here verbatim from that gate. They fetch full
// editable rows (not just counts) using the same column lists each real
// page selects, because the wizard embeds those pages' own modals for both
// adding and editing.
export default async function SetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [prefsRes, recurringRes, balancesRes, budgetsRes, extrasRes] = await Promise.all([
    supabase.from("preferences").select("onboarding_skipped_steps, onboarding_wizard_state").single(),
    supabase
      .from("recurring_items")
      .select(
        "id, name, type, amount, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count, comments, balance_id",
      )
      .order("start_date", { ascending: true }),
    supabase
      .from("balances")
      .select("id, name, amount, comments, transaction_fee_centavos")
      .order("name", { ascending: true }),
    supabase
      .from("budgets")
      .select(
        "id, name, monthly_allocation, allocation, created_at, linked_income_id, start_date, interval, unit, weekdays, days_of_month, ordinal, ordinal_weekday, ends_type, end_date, occurrence_count",
      )
      .order("name", { ascending: true }),
    supabase
      .from("one_off_items")
      .select("id, name, amount, due_date, comments, balance_id")
      .order("due_date", { ascending: true }),
  ]);

  const recurring = recurringRes.data ?? [];
  const bills = recurring.filter((r) => r.type === "bill");
  const income = recurring.filter((r) => r.type === "income");
  const debt = recurring.filter((r) => r.type === "debt");
  const savings = recurring.filter((r) => r.type === "savings");
  const balances = balancesRes.data ?? [];
  const budgets = budgetsRes.data ?? [];
  const extras = extrasRes.data ?? [];

  return (
    <OnboardingWizard
      hasAccounts={balances.length > 0}
      hasBills={bills.length > 0}
      hasIncome={income.length > 0}
      hasDebt={debt.length > 0}
      hasSavings={savings.length > 0}
      hasBudgets={budgets.length > 0}
      hasExtras={extras.length > 0}
      skippedSteps={prefsRes.data?.onboarding_skipped_steps ?? []}
      wizardState={prefsRes.data?.onboarding_wizard_state ?? null}
      balances={balances}
      bills={bills}
      income={income}
      debt={debt}
      savings={savings}
      budgets={budgets}
      extras={extras}
      incomeOptions={income.map((i) => ({ id: i.id, name: i.name }))}
    />
  );
}
