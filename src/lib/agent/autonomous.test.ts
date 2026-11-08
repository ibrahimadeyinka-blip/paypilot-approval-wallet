import { describe, expect, it } from "vitest";
import { canAutoSubmit } from "./autonomous";
const draft = { ready: true, question: "", vendor_name: "Alex", merchant_handle: "alex@studio.io", amount_cents: 1000, description: "Blue logo", delivery_requirements: "PNG" };
describe("autonomous submission", () => {
  it("requires explicit owner opt-in", () => { expect(canAutoSubmit(false, draft)).toBe(false); });
  it("submits a complete $10 contractor request when enabled", () => { expect(canAutoSubmit(true, draft)).toBe(true); });
  it("does not submit without a named payee", () => { expect(canAutoSubmit(true, { ...draft, merchant_handle: "" })).toBe(false); });
  it("does not submit incomplete directives", () => { expect(canAutoSubmit(true, { ...draft, ready: false })).toBe(false); });
});