import type { RecurringFrequency } from "@/lib/engine/types";

const MONTHLY_MULTIPLIER: Record<RecurringFrequency, number> = {
  monthly: 1,
  semi_monthly_15_30: 2,
  weekly: 52 / 12,
  biweekly: 26 / 12,
};

// Display-only estimate for aggregating recurring amounts of different
// frequencies into a single "per month" figure (e.g. a weekly paycheck
// alongside a monthly one). Never used by the forecast engine itself.
export function monthlyEquivalentCentavos(amount: number, frequency: RecurringFrequency): number {
  return Math.round(amount * MONTHLY_MULTIPLIER[frequency]);
}

export function formatCentavos(centavos: number, currency = "₱"): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${currency}${pesos.toLocaleString("en-US")}.${cents}`;
}

export function centavosToPesosString(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${pesos}.${cents}`;
}

// Parses a decimal pesos string (e.g. "1500.5", "-20") into integer centavos
// without floating-point multiplication, which can introduce rounding errors.
export function parseCentavos(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d+(\.\d{1,2})?$/.test(unsigned)) return null;

  const [wholePart, decimalPart = ""] = unsigned.split(".");
  const cents = (decimalPart + "00").slice(0, 2);
  const centavos = Number(wholePart) * 100 + Number(cents);
  return negative ? -centavos : centavos;
}
