import { describe, expect, it } from "vitest";
import { normalizeDraft } from "./directive";

const base = { ready: true, question: "", vendor_name: "Ada Design", merchant_handle: "AdaDesign.testnet", amount_cents: 10_000, description: "Minimalist blue tech logo", delivery_requirements: "PNG" };

describe("normalizeDraft", () => {
  it("allows an individual contractor when the payee list is blank", () => {
    const draft = normalizeDraft({ ...base, vendor_name: "Alex Studio", merchant_handle: "alex.testnet" }, []);
    expect(draft.ready).toBe(true);
    expect(draft.merchant_handle).toBe("alex.testnet");
  });
  it("allows only the listed contractor when a payee list is set", () => {
    expect(normalizeDraft({ ...base, merchant_handle: "alex.testnet" }, ["alex.testnet"]).ready).toBe(true);
    expect(normalizeDraft({ ...base, merchant_handle: "other.testnet" }, ["alex.testnet"]).ready).toBe(false);
  });
  it("keeps a complete draft for an allowlisted merchant", () => {
    const d = normalizeDraft(base, ["adadesign.testnet"]);
    expect(d.ready).toBe(true);
    expect(d.merchant_handle).toBe("adadesign.testnet");
  });
  it("asks instead of drafting for a merchant outside the allowlist", () => {
    expect(normalizeDraft(base, ["other"]).ready).toBe(false);
  });
  it("asks for a NEAR account when given an email or website", () => {
    expect(normalizeDraft({ ...base, merchant_handle: "fiverr.com" }, []).ready).toBe(false);
    expect(normalizeDraft({ ...base, merchant_handle: "jane@example.com" }, []).ready).toBe(false);
  });
  it("asks when no budget is given", () => {
    expect(normalizeDraft({ ...base, amount_cents: 0 }, []).ready).toBe(false);
  });
  it("treats malformed AI output as not ready", () => {
    expect(normalizeDraft({ nope: 1 }, []).ready).toBe(false);
  });
});
