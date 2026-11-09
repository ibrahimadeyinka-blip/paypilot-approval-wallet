import { describe, expect, it } from "vitest";
import { centsToYocto, formatNear, isNearAccountId } from "./units";

describe("NEAR units", () => {
  it("converts 1.50 NEAR to yocto", () => {
    expect(centsToYocto(150)).toBe(1_500_000_000_000_000_000_000_000n);
  });
  it("rejects zero amounts", () => {
    expect(() => centsToYocto(0)).toThrow();
  });
  it("formats amounts as NEAR", () => {
    expect(formatNear(500)).toBe("5.00 NEAR");
  });
  it("accepts testnet accounts and rejects domains with uppercase or emails", () => {
    expect(isNearAccountId("designer.testnet")).toBe(true);
    expect(isNearAccountId("Designer.testnet")).toBe(false);
    expect(isNearAccountId("jane@example.com")).toBe(false);
    expect(isNearAccountId("a")).toBe(false);
  });
});
