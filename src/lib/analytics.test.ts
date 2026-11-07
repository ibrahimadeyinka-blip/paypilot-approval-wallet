import { describe, expect, it } from "vitest";
import { classifyBlock, funnel } from "./analytics";

const h = (request_id: string, event: string, to_status: string, detail: string | null = null) => ({ request_id, event, to_status, detail, created_at: "2026-11-07T10:00:00Z" });

describe("agent funnel", () => {
  it("counts drafted, sent, blocked and approved separately", () => {
    const f = funnel(
      [{ ready: true, created_at: "x" }, { ready: false, created_at: "x" }, { ready: true, created_at: "x" }],
      [h("a", "request_received", "pending"), h("a", "status_changed", "authorizing"), h("a", "status_changed", "authorized"), h("a", "status_changed", "captured"),
       h("b", "request_received", "pending"), h("c", "request_received", "blocked", "Amount exceeds single payment cap")],
    );
    expect(f).toMatchObject({ drafted: 3, readyDrafts: 2, sent: 2, blocked: 1, approved: 1 });
    expect(f.approvalRate).toBe(0.5);
    expect(f.reasons.single_cap).toBe(1);
  });
  it("classifies block reasons", () => {
    expect(classifyBlock("Merchant not on allowlist")).toBe("merchant");
    expect(classifyBlock("Would exceed rolling 24h budget")).toBe("daily_budget");
    expect(classifyBlock("Token expired")).toBe("token");
  });
});
