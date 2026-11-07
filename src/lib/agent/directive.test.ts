import { describe, expect, it } from "vitest";
import { normalizeDraft } from "./directive";

const base = { ready: true, question: "", vendor_name: "Ada Design", merchant_handle: "AdaDesign", amount_cents: 10_000, description: "Minimalist blue tech logo", delivery_requirements: "PNG" };

describe("normalizeDraft", () => {
  it("keeps a complete draft for an allowlisted merchant", () => {
    const d = normalizeDraft(base, ["adadesign"]);
    expect(d.ready).toBe(true);
    expect(d.merchant_handle).toBe("adadesign");
  });
  it("asks instead of drafting for a merchant outside the allowlist", () => {
    expect(normalizeDraft(base, ["other"]).ready).toBe(false);
  });
  it("asks when no budget is given", () => {
    expect(normalizeDraft({ ...base, amount_cents: 0 }, []).ready).toBe(false);
  });
  it("treats malformed AI output as not ready", () => {
    expect(normalizeDraft({ nope: 1 }, []).ready).toBe(false);
  });
});
