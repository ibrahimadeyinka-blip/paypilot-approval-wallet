import { describe, expect, it, vi } from "vitest";
import { runCapture, runReviewAndSettle, runVoid, type SettlementPaypal } from "./settlement-flow.server";
import { normalizeReview } from "./review";
import { checkDeliverable, detectFileType, safeFilename } from "./files";
import { PaypalError } from "@/lib/paypal/parse";

const REQ = "33333333-3333-4333-8333-333333333333";
const DEL = "44444444-4444-4444-8444-444444444444";

function makeDeps(rpcResults: Record<string, unknown>, paypal: Partial<SettlementPaypal> = {}) {
  const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) => rpcResults[fn]);
  const pp: SettlementPaypal = {
    captureAuthorization: vi.fn(async () => ({ captureId: "CAP1", status: "COMPLETED" })),
    voidAuthorization: vi.fn(async () => {}),
    ...paypal,
  };
  return { deps: { rpc, paypal: pp }, rpc, pp };
}
const calls = (rpc: ReturnType<typeof vi.fn>, fn: string) => rpc.mock.calls.filter((c) => c[0] === fn);
const proceed = { outcome: "proceed", attempt: 1, authorization_id: "AUTH1" };

describe("review decides capture", () => {
  const base = { begin_agent_capture: proceed, record_agent_capture: { outcome: "captured" }, record_deliverable_review: null };

  it("approved work with high confidence is captured through PayPal", async () => {
    const { deps, pp, rpc } = makeDeps(base);
    const r = await runReviewAndSettle(
      { ...deps, model: "m", review: async () => ({ verdict: "approved", confidence: 0.95, summary: "Logo delivered", unmet_requirements: [] }) },
      { requestId: REQ, deliverableId: DEL },
    );
    expect(r.verdict).toBe("approved");
    expect(r.payment?.status).toBe("captured");
    expect(pp.captureAuthorization).toHaveBeenCalledWith("AUTH1", `${REQ}:capture:1`);
    expect(calls(rpc, "begin_agent_capture")[0]?.[1]).toMatchObject({ p_actor: "auto" });
  });

  it("rejected work is never captured", async () => {
    const { deps, pp } = makeDeps(base);
    const r = await runReviewAndSettle(
      { ...deps, model: "m", review: async () => ({ verdict: "rejected", confidence: 0.9, summary: "Blank page", unmet_requirements: ["logo"] }) },
      { requestId: REQ, deliverableId: DEL },
    );
    expect(r.verdict).toBe("rejected");
    expect(r.payment).toBeNull();
    expect(pp.captureAuthorization).not.toHaveBeenCalled();
  });

  it("an uncertain review is never captured", async () => {
    const { deps, pp } = makeDeps(base);
    const r = await runReviewAndSettle(
      { ...deps, model: "m", review: async () => ({ verdict: "uncertain", confidence: 0.5, summary: "Hard to tell", unmet_requirements: [] }) },
      { requestId: REQ, deliverableId: DEL },
    );
    expect(r.verdict).toBe("uncertain");
    expect(pp.captureAuthorization).not.toHaveBeenCalled();
  });

  it("a provider outage is recorded as uncertain and nothing is captured", async () => {
    const { deps, pp, rpc } = makeDeps(base);
    const r = await runReviewAndSettle(
      { ...deps, model: "m", review: async () => { throw new Error("503 from gateway"); } },
      { requestId: REQ, deliverableId: DEL },
    );
    expect(r.verdict).toBe("uncertain");
    expect(calls(rpc, "record_deliverable_review")[0]?.[1]).toMatchObject({ p_verdict: "uncertain" });
    expect(pp.captureAuthorization).not.toHaveBeenCalled();
  });

  it("an 'approved' answer with low confidence is downgraded and not captured", async () => {
    const { deps, pp } = makeDeps(base);
    const r = await runReviewAndSettle(
      { ...deps, model: "m", review: async () => ({ verdict: "approved", confidence: 0.6, summary: "Probably fine", unmet_requirements: [] }) },
      { requestId: REQ, deliverableId: DEL },
    );
    expect(r.verdict).toBe("uncertain");
    expect(pp.captureAuthorization).not.toHaveBeenCalled();
  });
});

describe("capture safety", () => {
  it("an expired authorization is not sent to PayPal", async () => {
    const { deps, pp } = makeDeps({ begin_agent_capture: { outcome: "expired", reason: "The PayPal authorization expired before capture. No funds were taken." } });
    const r = await runCapture(deps, { requestId: REQ, actor: "auto", ownerId: null });
    expect(r.status).toBe("capture_failed");
    expect(pp.captureAuthorization).not.toHaveBeenCalled();
  });

  it("a repeated capture of a paid request does not call PayPal again", async () => {
    const { deps, pp } = makeDeps({ begin_agent_capture: { outcome: "already_captured" } });
    const r = await runCapture(deps, { requestId: REQ, actor: "owner", ownerId: "o" });
    expect(r.status).toBe("captured");
    expect(pp.captureAuthorization).not.toHaveBeenCalled();
  });

  it("retrying an unfinished capture reuses the same PayPal idempotency key", async () => {
    const { deps, pp } = makeDeps({ begin_agent_capture: { ...proceed, attempt: 2, retry: true }, record_agent_capture: { outcome: "captured" } });
    await runCapture(deps, { requestId: REQ, actor: "owner", ownerId: "o" });
    expect(pp.captureAuthorization).toHaveBeenCalledWith("AUTH1", `${REQ}:capture:2`);
  });

  it("a PayPal timeout leaves the capture pending without marking failure", async () => {
    const { deps, rpc } = makeDeps(
      { begin_agent_capture: proceed },
      { captureAuthorization: vi.fn(async () => { throw new PaypalError("timeout", "slow"); }) },
    );
    const r = await runCapture(deps, { requestId: REQ, actor: "auto", ownerId: null });
    expect(r.status).toBe("capturing");
    expect(calls(rpc, "fail_agent_capture")).toHaveLength(0);
    expect(calls(rpc, "record_agent_capture")).toHaveLength(0);
  });

  it("PayPal saying the authorization expired is a terminal failure", async () => {
    const { deps, rpc } = makeDeps(
      { begin_agent_capture: proceed, fail_agent_capture: true },
      { captureAuthorization: vi.fn(async () => { throw new PaypalError("api", "expired", 422, "AUTHORIZATION_EXPIRED"); }) },
    );
    const r = await runCapture(deps, { requestId: REQ, actor: "auto", ownerId: null });
    expect(r.status).toBe("capture_failed");
    expect(calls(rpc, "fail_agent_capture")[0]?.[1]).toMatchObject({ p_terminal: true });
  });

  it("an already-captured authorization is recorded, not captured twice", async () => {
    const { deps, rpc } = makeDeps(
      { begin_agent_capture: proceed, record_agent_capture: { outcome: "captured" } },
      { captureAuthorization: vi.fn(async () => { throw new PaypalError("api", "done", 422, "AUTHORIZATION_ALREADY_CAPTURED"); }) },
    );
    const r = await runCapture(deps, { requestId: REQ, actor: "auto", ownerId: null });
    expect(r.status).toBe("captured");
    expect(calls(rpc, "record_agent_capture")).toHaveLength(1);
  });

  it("missing PayPal keys keep the money on hold and report why", async () => {
    const { deps, rpc } = makeDeps(
      { begin_agent_capture: proceed, fail_agent_capture: true },
      { captureAuthorization: vi.fn(async () => { throw new PaypalError("config", "PayPal Sandbox keys are not set up yet."); }) },
    );
    const r = await runCapture(deps, { requestId: REQ, actor: "auto", ownerId: null });
    expect(r.status).toBe("authorized");
    expect(calls(rpc, "fail_agent_capture")[0]?.[1]).toMatchObject({ p_terminal: false });
  });
});

describe("releasing the hold", () => {
  it("voids through PayPal and records it", async () => {
    const { deps, pp, rpc } = makeDeps({ begin_agent_void: proceed, record_agent_void: { outcome: "voided" } });
    const r = await runVoid(deps, { requestId: REQ, ownerId: "o" });
    expect(r.status).toBe("voided");
    expect(pp.voidAuthorization).toHaveBeenCalledWith("AUTH1", `${REQ}:release:1`);
    expect(calls(rpc, "record_agent_void")).toHaveLength(1);
  });
  it("an authorization PayPal already expired is recorded as released", async () => {
    const { deps, rpc } = makeDeps(
      { begin_agent_void: proceed, record_agent_void: { outcome: "voided" } },
      { voidAuthorization: vi.fn(async () => { throw new PaypalError("api", "expired", 422, "AUTHORIZATION_EXPIRED"); }) },
    );
    expect((await runVoid(deps, { requestId: REQ, ownerId: "o" })).status).toBe("voided");
    expect(calls(rpc, "record_agent_void")).toHaveLength(1);
  });
});

describe("review normalization", () => {
  it("garbage becomes uncertain", () => {
    expect(normalizeReview(null).verdict).toBe("uncertain");
    expect(normalizeReview({ verdict: "yes", confidence: 1 }).verdict).toBe("uncertain");
  });
  it("lists missing requirements in the summary", () => {
    const r = normalizeReview({ verdict: "rejected", confidence: 0.9, summary: "Wrong file.", unmet_requirements: ["SVG format"] });
    expect(r.summary).toContain("SVG format");
  });
});

describe("file checks", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const pdf = new TextEncoder().encode("%PDF-1.7 rest");
  it("detects allowed types from content, not the name", () => {
    expect(detectFileType(png)).toBe("image/png");
    expect(detectFileType(pdf)).toBe("application/pdf");
    expect(detectFileType(new TextEncoder().encode("MZ executable"))).toBeNull();
  });
  it("rejects empty and oversized files", () => {
    expect(checkDeliverable(new Uint8Array()).ok).toBe(false);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(png);
    expect(checkDeliverable(big).ok).toBe(false);
  });
  it("strips paths and odd characters from names", () => {
    expect(safeFilename("../../etc/pass wd<script>.png")).toBe("pass_wdscript.png");
  });
});
