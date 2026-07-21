import { describe, expect, it } from "vitest";
import { displayName } from "./displayName";

describe("displayName", () => {
  it("uses the profile name when set", () => {
    expect(displayName("Juan Lopez", "juan.lopez@gmail.com")).toBe("Juan Lopez");
  });

  it("falls back to the email's local part when name is empty", () => {
    expect(displayName("", "juan.lopez@gmail.com")).toBe("juan.lopez");
  });

  it("falls back to the email's local part when name is null", () => {
    expect(displayName(null, "juan.lopez@gmail.com")).toBe("juan.lopez");
  });

  it("falls back to the email's local part when name is undefined", () => {
    expect(displayName(undefined, "juan.lopez@gmail.com")).toBe("juan.lopez");
  });

  it("falls back to the email's local part when name is whitespace-only", () => {
    expect(displayName("   ", "juan.lopez@gmail.com")).toBe("juan.lopez");
  });

  it("trims surrounding whitespace from a real name", () => {
    expect(displayName("  Juan Lopez  ", "juan.lopez@gmail.com")).toBe("Juan Lopez");
  });

  it("never returns blank or undefined when neither name nor email is present", () => {
    expect(displayName(null, null)).toBe("");
    expect(displayName(undefined, undefined)).toBe("");
  });
});
