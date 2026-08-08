"use client";

import { useActionState } from "react";
import { centavosToPesosString } from "@/lib/money";
import { updatePreferences, type SettingsActionState } from "./actions";

const initialState: SettingsActionState = { error: null };

const THRESHOLDS: { key: string; label: string }[] = [
  { key: "danger", label: "Danger (at or below)" },
  { key: "low", label: "Low (at or below)" },
  { key: "medium", label: "Medium (at or below)" },
  { key: "high", label: "High (at or below)" },
  { key: "higher", label: "Higher (at or below, above = highest)" },
];

// T80: one label per tier the "Lowest balance ahead" stat can land in - all
// 6 tiers here (unlike THRESHOLDS above, which only has 5 boundary values
// for 6 tiers - "highest" has no threshold of its own). Field names are
// prefixed to avoid colliding with THRESHOLDS' own bare tier-name fields in
// this same form.
const TIER_LABEL_FIELDS: { key: string; label: string }[] = [
  { key: "danger", label: "Danger" },
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "higher", label: "Higher" },
  { key: "highest", label: "Highest" },
];

// User request 2026-08-03: the daily due-today email needs a timezone per
// user, not the server's own. `Intl.supportedValuesOf` is the browser's own
// authoritative IANA list - no new dependency, no hand-maintained list to
// go stale. Falls back to the browser's current zone (a sensible default,
// not a guess) when the user has never set one.
function timezoneOptions(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }
  return [Intl.DateTimeFormat().resolvedOptions().timeZone];
}

export function PreferencesForm({
  currency,
  balanceRanges,
  tierLabels,
  emailNotificationsEnabled,
  notificationTime,
  notificationTimezone,
  isUsernameOnlyAccount,
}: {
  currency: string;
  balanceRanges: number[];
  tierLabels: string[];
  emailNotificationsEnabled: boolean;
  notificationTime: string;
  notificationTimezone: string | null;
  // T269: a username-only account has no real email, so there's nowhere for
  // notifications to be sent - the whole section is disabled rather than
  // just hidden, so it's clear *why* rather than looking like a missing
  // feature.
  isUsernameOnlyAccount: boolean;
}) {
  const [state, formAction, pending] = useActionState(updatePreferences, initialState);
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // T96: three previously crammed-together concerns (currency, balance
  // color thresholds, lowest-balance tier labels) now get their own
  // clearly-separated cards, matching the visual rhythm of the Profile/
  // Account cards elsewhere on this page - still one combined submit
  // (`updatePreferences` reads and saves all three together in one write;
  // splitting that into independent per-card actions would need it to
  // support partial updates, out of scope here). Each card carries an `id`
  // so a future onboarding flow (T97+) can deep-link straight to one
  // section instead of the whole page.
  return (
    <form action={formAction} className="space-y-6">
      <div id="currency" className="rounded-lg border border-notion-hairline bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-notion-text">Currency</h2>
        <div>
          <label className="block text-sm text-slate-600" htmlFor="currency-input">
            Currency symbol
          </label>
          <input
            id="currency-input"
            name="currency"
            type="text"
            required
            maxLength={5}
            defaultValue={currency}
            className="mt-1 w-24 rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
          />
        </div>
      </div>

      <div id="balance-thresholds" className="rounded-lg border border-notion-hairline bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-notion-text">Balance color thresholds</h2>
        <p className="mb-2 text-sm text-slate-600">
          In {currency} - each must be greater than or equal to the one before it.
        </p>
        <div className="space-y-2">
          {THRESHOLDS.map((threshold, index) => (
            <div key={threshold.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <label className="text-sm text-slate-600 sm:w-64" htmlFor={threshold.key}>
                {threshold.label}
              </label>
              <input
                id={threshold.key}
                name={threshold.key}
                type="number"
                step="0.01"
                required
                defaultValue={centavosToPesosString(balanceRanges[index] ?? 0)}
                className="w-32 rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      <div id="lowest-balance-labels" className="rounded-lg border border-notion-hairline bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-notion-text">Lowest-balance labels</h2>
        <p className="mb-2 text-sm text-slate-600">
          The wording shown for each risk tier on the Dashboard and Forecast pages, before the
          amount.
        </p>
        <div className="space-y-2">
          {TIER_LABEL_FIELDS.map((tier, index) => (
            <div key={tier.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <label className="text-sm text-slate-600 sm:w-64" htmlFor={`label-${tier.key}`}>
                {tier.label}
              </label>
              <input
                id={`label-${tier.key}`}
                name={`label_${tier.key}`}
                type="text"
                required
                maxLength={40}
                defaultValue={tierLabels[index]}
                className="w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none sm:w-64"
              />
            </div>
          ))}
        </div>
      </div>

      {/* User request 2026-08-03: "notifies me when a forecasted
          transaction is detected for the day... I should be able to set
          the time... and it should ask for a timezone." A background check
          (every 15 minutes, see vercel.json) compares each user's chosen
          time against the current time in their chosen zone. */}
      <div id="email-notifications" className="rounded-lg border border-notion-hairline bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-notion-text">Email notifications</h2>
        {/* T269: a username-only account has no real email on file - the
            whole section is disabled rather than hidden, so it reads as
            "not available for this account" rather than a missing feature. */}
        {isUsernameOnlyAccount ? (
          <p className="text-sm text-slate-500">
            Not available - this account was created with just a username, so there&apos;s no
            email to send to.
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm text-notion-text">
              <input
                type="checkbox"
                name="emailNotificationsEnabled"
                defaultChecked={emailNotificationsEnabled}
                className="h-4 w-4 rounded border-notion-hairline"
              />
              Email me a list of transactions due that day
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <div>
                <label className="block text-sm text-slate-600" htmlFor="notificationTime">
                  Time of day
                </label>
                <input
                  id="notificationTime"
                  name="notificationTime"
                  type="time"
                  required
                  defaultValue={notificationTime}
                  className="mt-1 rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-slate-600" htmlFor="notificationTimezone">
                  Timezone
                </label>
                <select
                  id="notificationTimezone"
                  name="notificationTimezone"
                  defaultValue={notificationTimezone ?? browserTimezone}
                  className="mt-1 w-full rounded border border-notion-hairline p-2 text-notion-text focus:border-notion-accent focus:outline-none"
                >
                  {timezoneOptions().map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && !state.error && <p className="text-sm text-green-700">{state.message}</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded bg-notion-text px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save preferences"}
        </button>
      </div>
    </form>
  );
}
