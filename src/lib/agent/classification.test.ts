import { describe, expect, it } from "vitest";
import { approvalGroup, tokenGroup } from "./classification";

describe("approval groups", () => {
  it.each(["pending_approval", "authorizing"])("keeps %s in New", (status) => {
    expect(approvalGroup(status)).toBe("new");
  });
  it.each(["authorized", "captured", "capturing", "voiding", "approved"])("keeps %s in Successful", (status) => {
    expect(approvalGroup(status)).toBe("successful");
  });
  it.each(["blocked", "declined", "authorization_failed", "capture_failed", "voided"])("keeps %s in Unsuccessful", (status) => {
    expect(approvalGroup(status)).toBe("unsuccessful");
  });
});

describe("token groups", () => {
  const now = Date.parse("2026-11-09T01:44:00Z");
  const future = "2026-11-10T01:44:00Z";
  it("shows valid unrevoked tokens in Active", () => {
    expect(tokenGroup({ revoked: false, expires_at: future }, now)).toBe("active");
  });
  it("shows manually revoked tokens in Revoked even before expiry", () => {
    expect(tokenGroup({ revoked: true, expires_at: future }, now)).toBe("revoked");
  });
  it("includes expired tokens in the inactive view without revoking them", () => {
    const token = { revoked: false, expires_at: "2026-11-08T01:44:00Z" };
    expect(tokenGroup(token, now)).toBe("revoked");
    expect(token.revoked).toBe(false);
  });
  it("treats the exact expiry instant as inactive", () => {
    expect(tokenGroup({ revoked: false, expires_at: new Date(now).toISOString() }, now)).toBe("revoked");
  });
});