-- T284 follow-up (SPEC.md Phase 49): replaces the binary "Exclude budgets"
-- toggle with a per-budget slider - "how much of this budget's money do you
-- assume is already spoken for." 0 = fully available cash flow, 100 = bills-
-- like (deducted the moment it's set aside), anything between is a partial
-- assumption. Defaults 100 per the user's own stated habit ("budgets are
-- considered bills as well") - a real, immediate change to every existing
-- budget's effect on the Forecast total once this ships, not just new ones.
alter table budgets
  add column assumed_spend_percent smallint not null default 100
  check (assumed_spend_percent between 0 and 100);
