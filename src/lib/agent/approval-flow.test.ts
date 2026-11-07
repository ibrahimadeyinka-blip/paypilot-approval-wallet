import { describe, expect, it, vi } from "vitest";
import { runApprove, runCancel, runConfirm, type FlowDeps, type PaypalPort } from "./approval-flow.server";
import { errorFromResponse, parseApproveUrl, parseAuthorization, PaypalError } from "@/lib/paypal/parse";

const REQ = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const urls = { returnUrl: "https://app.test/paypal/return", cancelUrl: "https://app.test/paypal/return?cancelled=1" };

function makeDeps(rpcResults: Record<string, unknown>, paypal: Partial<PaypalPort> = {}) {
  const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) => rpcResults[fn]);
  const pp: PaypalPort = {
    createOrder: vi.fn(async () => ({ orderId: "ORDER123ABC", approveUrl: "https://sandbox.paypal.com/approve" })),
    authorizeOrder: vi.fn(async () => ({ authorizationId: "AUTH1", status: "CREATED", expiresAt: "2026-12-01T00:00:00Z" })),
    getOrderAuthorization: vi.fn(async () => ({ authorizationId: "AUTH1", status: "CREATED", expiresAt: null })),
    voidAuthorization: vi.fn(async () => {}),
    ...paypal,
  };
  const deps: FlowDeps = { rpc, paypal: pp };
  return { deps, rpc, pp };
}
const called = (rpc: ReturnType<typeof vi.fn>, fn: string) => rpc.mock.calls.some((c) => c[0] === fn);

const proceed = { outcome: "proceed", request_id: REQ, attempt: 1, amount_cents: 1500, currency: "USD", description: "Pro seat", vendor_name: "Figma" };

describe("owner approval", () => {
  it("creates one PayPal order with a stable idempotency key and returns the approval link", async () => {
    const { deps, rpc, pp } = makeDeps({ begin_agent_authorization: proceed, attach_agent_paypal_order: true });
    const r = await runApprove(deps, { ownerId: OWNER, requestId: REQ, ...urls });
    expect(r).toMatchObject({ status: "authorizing", approveUrl: "https://sandbox.paypal.com/approve" });
    expect(pp.createOrder).toHaveBeenCalledWith(expect.objectContaining({ requestKey: `${REQ}:1:create`, amountCents: 1500 }));
    expect(called(rpc, "attach_agent_paypal_order")).toBe(true);
  });

  it("a duplicate click reuses the existing PayPal order instead of creating another", async () => {
    const { deps, pp } = makeDeps({
      begin_agent_authorization: { outcome: "in_progress", attempt: 1, approve_url: "https://sandbox.paypal.com/existing" },
    });
    const r = await runApprove(deps, { ownerId: OWNER, requestId: REQ, ...urls });
    expect(r.approveUrl).toBe("https://sandbox.paypal.com/existing");
    expect(pp.createOrder).not.toHaveBeenCalled();
  });

  it("retrying after a timeout reuses the same attempt key so PayPal returns the same order", async () => {
    const { deps, pp } = makeDeps({
      begin_agent_authorization: { ...proceed, outcome: "in_progress", approve_url: null },
      attach_agent_paypal_order: true,
    });
    await runApprove(deps, { ownerId: OWNER, requestId: REQ, ...urls });
    expect(pp.createOrder).toHaveBeenCalledWith(expect.objectContaining({ requestKey: `${REQ}:1:create` }));
  });

  it("never contacts PayPal when a safeguard blocks the request at approval", async () => {
    const { deps, pp } = makeDeps({ begin_agent_authorization: { outcome: "blocked", reason: "Agent token was revoked. Payment halted." } });
    const r = await runApprove(deps, { ownerId: OWNER, requestId: REQ, ...urls });
    expect(r).toEqual({ status: "blocked", message: "Agent token was revoked. Payment halted." });
    expect(pp.createOrder).not.toHaveBeenCalled();
  });

  it("a PayPal timeout leaves the request retryable without marking it failed", async () => {
    const { deps, rpc } = makeDeps(
      { begin_agent_authorization: proceed },
      { createOrder: vi.fn(async () => { throw new PaypalError("timeout", "slow"); }) },
    );
    const r = await runApprove(deps, { ownerId: OWNER, requestId: REQ, ...urls });
    expect(r.status).toBe("authorizing");
    expect(called(rpc, "fail_agent_authorization")).toBe(false);
  });

  it("a PayPal rejection marks the attempt failed (no funds held)", async () => {
    const { deps, rpc } = makeDeps(
      { begin_agent_authorization: proceed, fail_agent_authorization: true },
      { createOrder: vi.fn(async () => { throw new PaypalError("api", "Invalid amount", 422, "INVALID_PARAMETER_VALUE"); }) },
    );
    const r = await runApprove(deps, { ownerId: OWNER, requestId: REQ, ...urls });
    expect(r.status).toBe("authorization_failed");
    expect(called(rpc, "fail_agent_authorization")).toBe(true);
  });
});

const checkOk = { outcome: "proceed", request_id: REQ, attempt: 1, order_id: "ORDER123ABC" };

describe("placing the hold", () => {
  it("authorizes with a stable key and records the PayPal authorization", async () => {
    const { deps, rpc, pp } = makeDeps({ check_agent_authorization: checkOk, record_agent_authorization: { outcome: "authorized" } });
    const r = await runConfirm(deps, { requestId: REQ, ownerId: OWNER });
    expect(r.status).toBe("authorized");
    expect(pp.authorizeOrder).toHaveBeenCalledWith("ORDER123ABC", `${REQ}:1:authorize`);
    const rec = rpc.mock.calls.find((c) => c[0] === "record_agent_authorization");
    expect(rec?.[1]).toMatchObject({ p_authorization_id: "AUTH1", p_order_id: "ORDER123ABC" });
  });

  it("does not call PayPal when the re-check finds the token revoked", async () => {
    const { deps, pp } = makeDeps({ check_agent_authorization: { outcome: "blocked", reason: "Agent token was revoked. Payment halted." } });
    const r = await runConfirm(deps, { orderId: "ORDER123ABC" });
    expect(r.status).toBe("blocked");
    expect(pp.authorizeOrder).not.toHaveBeenCalled();
  });

  it("waits (no state change) when the payer hasn't approved at PayPal yet", async () => {
    const { deps, rpc } = makeDeps(
      { check_agent_authorization: checkOk },
      { authorizeOrder: vi.fn(async () => { throw new PaypalError("api", "not approved", 422, "ORDER_NOT_APPROVED"); }) },
    );
    const r = await runConfirm(deps, { requestId: REQ, ownerId: OWNER });
    expect(r.status).toBe("authorizing");
    expect(called(rpc, "fail_agent_authorization")).toBe(false);
    expect(called(rpc, "record_agent_authorization")).toBe(false);
  });

  it("a timeout stays retryable and records nothing", async () => {
    const { deps, rpc } = makeDeps(
      { check_agent_authorization: checkOk },
      { authorizeOrder: vi.fn(async () => { throw new PaypalError("timeout", "slow"); }) },
    );
    const r = await runConfirm(deps, { requestId: REQ, ownerId: OWNER });
    expect(r.status).toBe("authorizing");
    expect(called(rpc, "record_agent_authorization")).toBe(false);
  });

  it("an already-authorized order is looked up, not authorized twice", async () => {
    const { deps, pp } = makeDeps(
      { check_agent_authorization: checkOk, record_agent_authorization: { outcome: "authorized" } },
      { authorizeOrder: vi.fn(async () => { throw new PaypalError("api", "done", 422, "ORDER_ALREADY_AUTHORIZED"); }) },
    );
    const r = await runConfirm(deps, { requestId: REQ, ownerId: OWNER });
    expect(r.status).toBe("authorized");
    expect(pp.getOrderAuthorization).toHaveBeenCalledTimes(1);
  });

  it("releases the hold if the owner declined while PayPal was placing it", async () => {
    const { deps, pp } = makeDeps({ check_agent_authorization: checkOk, record_agent_authorization: { outcome: "conflict", status: "declined" } });
    const r = await runConfirm(deps, { requestId: REQ, ownerId: OWNER });
    expect(r.status).toBe("declined");
    expect(pp.voidAuthorization).toHaveBeenCalledWith("AUTH1", `${REQ}:1:void`);
  });

  it("a denied authorization is recorded as failed", async () => {
    const { deps, rpc } = makeDeps(
      { check_agent_authorization: checkOk, fail_agent_authorization: true },
      { authorizeOrder: vi.fn(async () => ({ authorizationId: "AUTH1", status: "DENIED", expiresAt: null })) },
    );
    const r = await runConfirm(deps, { requestId: REQ, ownerId: OWNER });
    expect(r.status).toBe("authorization_failed");
    expect(called(rpc, "record_agent_authorization")).toBe(false);
  });

  it("cancelling at PayPal marks the attempt failed with no funds held", async () => {
    const { deps, rpc, pp } = makeDeps({ check_agent_authorization: checkOk, fail_agent_authorization: true });
    const r = await runCancel(deps, "ORDER123ABC");
    expect(r.status).toBe("authorization_failed");
    expect(called(rpc, "fail_agent_authorization")).toBe(true);
    expect(pp.authorizeOrder).not.toHaveBeenCalled();
  });
});

describe("PayPal response parsing", () => {
  it("reads the authorization from an order", () => {
    const order = { purchase_units: [{ payments: { authorizations: [{ id: "8AB", status: "CREATED", expiration_time: "2026-12-06T00:00:00Z" }] } }] };
    expect(parseAuthorization(order)).toEqual({ authorizationId: "8AB", status: "CREATED", expiresAt: "2026-12-06T00:00:00Z" });
    expect(parseAuthorization({})).toBeNull();
  });
  it("prefers the payer-action link", () => {
    expect(parseApproveUrl({ links: [{ rel: "self", href: "x" }, { rel: "payer-action", href: "https://p" }] })).toBe("https://p");
  });
  it("extracts the PayPal issue code from errors", () => {
    const e = errorFromResponse(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ORDER_NOT_APPROVED", description: "Payer has not approved" }], debug_id: "d1" });
    expect(e.issue).toBe("ORDER_NOT_APPROVED");
    expect(e.debugId).toBe("d1");
  });
});
