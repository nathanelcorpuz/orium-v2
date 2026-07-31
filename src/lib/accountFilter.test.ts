import { describe, expect, it } from "vitest";
import {
  NO_ACCOUNT_FILTER_VALUE,
  accountFilterOptions,
  matchesAccountFilter,
} from "./accountFilter";

// T159 (SPEC.md Phase 20): the connected-account filter now lives on five
// pages (Bills, Income, Debt, Savings, Misc). Testing the shared predicate is
// what keeps those five honest - the alternative was five copies of this
// logic, which is exactly how Bug #12 happened.
describe("matchesAccountFilter", () => {
  it("shows everything when nothing is selected", () => {
    // An empty selection means "filter not applied", matching how every other
    // multi-select filter on these pages behaves - it must not mean
    // "exclude everything".
    expect(matchesAccountFilter("acct-1", new Set())).toBe(true);
    expect(matchesAccountFilter(null, new Set())).toBe(true);
  });

  it("matches an item against its own account", () => {
    const selected = new Set(["acct-1"]);
    expect(matchesAccountFilter("acct-1", selected)).toBe(true);
    expect(matchesAccountFilter("acct-2", selected)).toBe(false);
  });

  it("treats unconnected items as their own selectable bucket", () => {
    const selected = new Set([NO_ACCOUNT_FILTER_VALUE]);
    expect(matchesAccountFilter(null, selected)).toBe(true);
    // An item WITH an account must not match the "no account" bucket.
    expect(matchesAccountFilter("acct-1", selected)).toBe(false);
  });

  it("supports selecting an account and 'no account' together", () => {
    const selected = new Set(["acct-1", NO_ACCOUNT_FILTER_VALUE]);
    expect(matchesAccountFilter("acct-1", selected)).toBe(true);
    expect(matchesAccountFilter(null, selected)).toBe(true);
    expect(matchesAccountFilter("acct-2", selected)).toBe(false);
  });
});

describe("accountFilterOptions", () => {
  it("lists each account, then the 'no account' bucket last", () => {
    const options = accountFilterOptions([
      { id: "acct-1", name: "BDO" },
      { id: "acct-2", name: "GCash" },
    ]);

    expect(options).toEqual([
      { value: "acct-1", label: "BDO" },
      { value: "acct-2", label: "GCash" },
      { value: NO_ACCOUNT_FILTER_VALUE, label: "No account" },
    ]);
  });

  it("still offers the 'no account' bucket when there are no accounts", () => {
    expect(accountFilterOptions([])).toEqual([
      { value: NO_ACCOUNT_FILTER_VALUE, label: "No account" },
    ]);
  });
});
