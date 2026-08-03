import { describe, expect, it } from "vitest";
import { isActive } from "./isActive";

describe("isActive", () => {
  it("treats undefined active as active (matches the DB default)", () => {
    expect(isActive({})).toBe(true);
  });

  it("treats active: true as active", () => {
    expect(isActive({ active: true })).toBe(true);
  });

  it("treats active: false as not active", () => {
    expect(isActive({ active: false })).toBe(false);
  });
});
