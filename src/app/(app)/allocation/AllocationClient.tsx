"use client";

import { formatCentavos } from "@/lib/money";
import { formatFullDate } from "@/lib/date";
import { balanceRangeColorClass } from "@/lib/balanceColor";
import { TYPE_LABEL, TYPE_COLOR } from "@/lib/forecastLabels";
import { reassignConnectedItem } from "./actions";

export type PayableItem = {
  sourceType: "recurring" | "one_off";
  id: string;
  name: string;
  type: "bill" | "debt" | "savings" | "extra";
  balanceId: string | null;
  autoDebited: boolean;
  // null for a one-off item - it has no recurrence to average into a
  // monthly figure, so `amount`/`dueDate` are shown instead.
  monthlyAmount: number | null;
  amount: number;
  dueDate: string | null;
};

export type AccountGroup = {
  id: string;
  name: string;
  amount: number;
  lowestPoint: { balance: number; date: string } | null;
  items: PayableItem[];
  monthlyTotal: number;
};

function ItemRow({
  item,
  balanceOptions,
  currency,
}: {
  item: PayableItem;
  balanceOptions: { id: string; name: string }[];
  currency: string;
}) {
  return (
    <li className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-notion-text">
          {item.name}{" "}
          <span className={`text-xs font-medium ${TYPE_COLOR[item.type]}`}>{TYPE_LABEL[item.type]}</span>
          {item.autoDebited && (
            <span
              className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600"
              title="Paid automatically by this account - not a reassignment candidate"
            >
              Auto-debited
            </span>
          )}
        </p>
        <p className="text-xs text-slate-400">
          {item.monthlyAmount !== null
            ? `${formatCentavos(Math.abs(item.monthlyAmount), currency)}/mo (est.)`
            : `${formatCentavos(Math.abs(item.amount), currency)}${item.dueDate ? ` due ${formatFullDate(item.dueDate)}` : ""}`}
        </p>
      </div>
      {item.autoDebited ? (
        <span className="shrink-0 text-xs text-slate-400">Pinned to this account</span>
      ) : (
        <form action={reassignConnectedItem} className="shrink-0">
          <input type="hidden" name="sourceType" value={item.sourceType} />
          <input type="hidden" name="id" value={item.id} />
          <select
            name="balanceId"
            defaultValue={item.balanceId ?? ""}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="rounded border border-notion-hairline px-1.5 py-1 text-xs text-notion-text focus:border-notion-accent focus:outline-none"
          >
            <option value="">Unassigned</option>
            {balanceOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </form>
      )}
    </li>
  );
}

export function AllocationClient({
  accounts,
  unassigned,
  balanceOptions,
  balanceRanges,
  currency,
}: {
  accounts: AccountGroup[];
  unassigned: PayableItem[];
  balanceOptions: { id: string; name: string }[];
  balanceRanges: number[];
  currency: string;
}) {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-xl font-semibold text-notion-text">Fund Distribution</h1>
      <p className="mt-1 text-slate-500">
        Every bill, debt, savings goal, and misc item, grouped by which account pays it - accounts
        most at risk of going negative are listed first. Move an item to a different account
        directly from here; auto-debited items (Bills/Debt/Savings) are pinned and can&rsquo;t be
        moved.
      </p>

      {unassigned.length > 0 && (
        <div className="mt-6 rounded-lg border border-notion-hairline bg-white p-4">
          <h2 className="text-sm font-semibold text-notion-text">Unassigned</h2>
          <p className="mt-1 text-xs text-slate-500">
            Not connected to any account yet - assign one below.
          </p>
          <ul className="mt-2 divide-y divide-notion-hairline">
            {unassigned.map((item) => (
              <ItemRow key={`${item.sourceType}-${item.id}`} item={item} balanceOptions={balanceOptions} currency={currency} />
            ))}
          </ul>
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="mt-6 text-slate-400">No accounts yet - add one on the Accounts page first.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-lg border border-notion-hairline bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-notion-text">{account.name}</h2>
                  <p className="text-xs text-slate-500">
                    Current balance: {formatCentavos(account.amount, currency)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {account.lowestPoint ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${balanceRangeColorClass(account.lowestPoint.balance, balanceRanges)}`}
                      title={`Lowest projected balance ahead, on ${formatFullDate(account.lowestPoint.date)}`}
                    >
                      Lowest ahead: {formatCentavos(account.lowestPoint.balance, currency)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">No forecast activity</span>
                  )}
                  {account.monthlyTotal > 0 && (
                    <span className="text-xs text-slate-400">
                      {formatCentavos(account.monthlyTotal, currency)}/mo assigned (est.)
                    </span>
                  )}
                </div>
              </div>
              {account.items.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">No connected payables.</p>
              ) : (
                <ul className="mt-2 divide-y divide-notion-hairline">
                  {account.items.map((item) => (
                    <ItemRow
                      key={`${item.sourceType}-${item.id}`}
                      item={item}
                      balanceOptions={balanceOptions}
                      currency={currency}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
