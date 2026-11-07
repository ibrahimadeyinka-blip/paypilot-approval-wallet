import { describe, expect, it } from "vitest";
import { extractToken, parseIdempotencyKey, paymentRequestSchema, sha256Hex, statusForOutcome } from "./gateway-input";
import { parseMerchantList, generateSecret } from "./tokens";

const valid = {
  vendor_name: "Figma",
  merchant_handle: "Figma.com",
  amount_cents: 1500,
  description: "Pro seat",
  source_context: "Invoice #881: Figma Pro $15.00",
};

describe("gateway input", () => {
  it("normalizes merchant to lowercase and defaults currency to USD", () => {
    const r = paymentRequestSchema.parse(valid);
    expect(r.merchant_handle).toBe("figma.com");
    expect(r.currency).toBe("USD");
  });
  it("rejects missing source evidence", () => {
    expect(paymentRequestSchema.safeParse({ ...valid, source_context: "" }).success).toBe(false);
  });
  it("rejects non-integer or negative amounts", () => {
    expect(paymentRequestSchema.safeParse({ ...valid, amount_cents: 10.5 }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ ...valid, amount_cents: -1 }).success).toBe(false);
  });
  it("reads bearer token and rejects malformed ones", () => {
    expect(extractToken("Bearer apt_abc", null)).toBe("apt_abc");
    expect(extractToken("Bearer sk_abc", null)).toBeNull();
    expect(extractToken(null, {})).toBeNull();
  });
  it("validates idempotency keys", () => {
    expect(parseIdempotencyKey(null)).toBeNull();
    expect(parseIdempotencyKey("order-1")).toBe("order-1");
    expect(parseIdempotencyKey("bad key!")).toBe("invalid");
  });
  it("maps outcomes to HTTP status", () => {
    expect(statusForOutcome("pending_approval")).toBe(202);
    expect(statusForOutcome("blocked")).toBe(403);
    expect(statusForOutcome("unauthorized")).toBe(401);
    expect(statusForOutcome("idempotency_conflict")).toBe(409);
    expect(statusForOutcome("replayed", "pending_approval")).toBe(200);
  });
  it("hashes deterministically and secrets are never equal to their hash", async () => {
    const s = generateSecret();
    expect(s.startsWith("apt_")).toBe(true);
    expect(await sha256Hex(s)).toHaveLength(64);
    expect(await sha256Hex(s)).not.toContain(s);
  });
  it("dedupes merchant lists", () => {
    expect(parseMerchantList(" A.com, a.com ,b.com,")).toEqual(["a.com", "b.com"]);
  });
});
