/**
 * Owner approval -> PayPal Sandbox authorization (hold), then capture later (Slice 3).
 * Every state change goes through database functions that lock the token and
 * request rows and re-check safeguards. Every PayPal call carries a stable
 * PayPal-Request-Id so retries and double clicks never create a second order or hold.
 */
import { isTransient, PaypalError, type PaypalAuthorization } from "@/lib/paypal/parse";

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export interface PaypalPort {
  createOrder(input: {
    requestKey: string;
    referenceId: string;
    amountCents: number;
    currency: string;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<{ orderId: string; approveUrl: string }>;
  authorizeOrder(orderId: string, requestKey: string): Promise<PaypalAuthorization>;
  getOrderAuthorization(orderId: string): Promise<PaypalAuthorization | null>;
  voidAuthorization(authorizationId: string, requestKey: string): Promise<void>;
}

export interface FlowDeps {
  rpc: Rpc;
  paypal: PaypalPort;
}

export interface FlowResult {
  status: string;
  message: string;
  approveUrl?: string;
}

interface DbResult {
  outcome: string;
  request_id?: string;
  attempt?: number;
  order_id?: string | null;
  approve_url?: string | null;
  amount_cents?: number;
  currency?: string;
  description?: string;
  vendor_name?: string;
  status?: string;
  reason?: string | null;
}

const RETRY_SAFE = "Try again — it's safe and won't create a second payment.";

function paypalMessage(err: unknown): string {
  if (err instanceof PaypalError) {
    return err.kind === "config" ? err.message : `PayPal: ${err.message}${err.debugId ? ` (ref ${err.debugId})` : ""}`;
  }
  return "Unexpected error while contacting PayPal.";
}

export async function runApprove(
  deps: FlowDeps,
  input: { ownerId: string; requestId: string; returnUrl: string; cancelUrl: string },
): Promise<FlowResult> {
  const r = (await deps.rpc("begin_agent_authorization", {
    p_owner_id: input.ownerId,
    p_request_id: input.requestId,
  })) as DbResult;

  switch (r.outcome) {
    case "not_found":
      return { status: "not_found", message: "We couldn't find that request." };
    case "blocked":
      return { status: "blocked", message: r.reason ?? "A safeguard stopped this payment." };
    case "already_authorized":
      return { status: "authorized", message: "Funds are already on hold for this request." };
    case "not_actionable":
      return { status: r.status ?? "unknown", message: "This request was already decided." };
    case "in_progress":
      if (r.approve_url) {
        return { status: "authorizing", approveUrl: r.approve_url, message: "Finish approving the payment at PayPal." };
      }
      break; // order not created yet (earlier attempt timed out): retry with the same attempt key
    case "proceed":
      break;
    default:
      throw new Error(`Unexpected approval outcome: ${r.outcome}`);
  }

  const attempt = r.attempt ?? 0;
  let order: { orderId: string; approveUrl: string };
  try {
    order = await deps.paypal.createOrder({
      requestKey: `${input.requestId}:${attempt}:create`,
      referenceId: input.requestId,
      amountCents: r.amount_cents ?? 0,
      currency: r.currency ?? "USD",
      description: `${r.vendor_name ?? ""}: ${r.description ?? ""}`,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });
  } catch (err) {
    if (isTransient(err)) {
      return { status: "authorizing", message: `PayPal didn't answer in time. ${RETRY_SAFE}` };
    }
    const message = paypalMessage(err);
    await deps.rpc("fail_agent_authorization", { p_request_id: input.requestId, p_attempt: attempt, p_error: message });
    return { status: "authorization_failed", message };
  }

  const attached = (await deps.rpc("attach_agent_paypal_order", {
    p_request_id: input.requestId,
    p_attempt: attempt,
    p_order_id: order.orderId,
    p_approve_url: order.approveUrl,
  })) as boolean;
  if (!attached) {
    return { status: "changed", message: "This request changed while we contacted PayPal. Refresh to see its status." };
  }
  return { status: "authorizing", approveUrl: order.approveUrl, message: "Finish approving the payment at PayPal." };
}

type ConfirmTarget = { requestId: string; ownerId: string } | { orderId: string };

async function check(deps: FlowDeps, target: ConfirmTarget): Promise<DbResult> {
  return (await deps.rpc("check_agent_authorization", {
    p_request_id: "requestId" in target ? target.requestId : null,
    p_owner_id: "ownerId" in target ? target.ownerId : null,
    p_order_id: "orderId" in target ? target.orderId : null,
  })) as DbResult;
}

function mapNonProceed(c: DbResult): FlowResult | null {
  switch (c.outcome) {
    case "not_found":
      return { status: "not_found", message: "We couldn't find a payment request for this PayPal order." };
    case "already_authorized":
      return { status: "authorized", message: "Funds are on hold with PayPal Sandbox." };
    case "not_actionable":
      return { status: c.status ?? "unknown", message: c.reason ?? "This request is no longer waiting for PayPal." };
    case "no_order":
      return { status: "authorizing", message: `PayPal hasn't been reached yet. Press Approve again. ${RETRY_SAFE}` };
    case "blocked":
      return { status: "blocked", message: c.reason ?? "A safeguard stopped this payment before funds were held." };
    case "proceed":
      return null;
    default:
      throw new Error(`Unexpected check outcome: ${c.outcome}`);
  }
}

const BAD_AUTH_STATUSES = new Set(["DENIED", "VOIDED", "EXPIRED"]);

export async function runConfirm(deps: FlowDeps, target: ConfirmTarget): Promise<FlowResult> {
  const c = await check(deps, target);
  const early = mapNonProceed(c);
  if (early) return early;

  const requestId = c.request_id as string;
  const attempt = c.attempt as number;
  const orderId = c.order_id as string;
  const fail = async (message: string): Promise<FlowResult> => {
    await deps.rpc("fail_agent_authorization", { p_request_id: requestId, p_attempt: attempt, p_error: message });
    return { status: "authorization_failed", message };
  };

  let auth: PaypalAuthorization | null;
  try {
    auth = await deps.paypal.authorizeOrder(orderId, `${requestId}:${attempt}:authorize`);
  } catch (err) {
    const issue = err instanceof PaypalError ? err.issue : undefined;
    if (issue === "ORDER_NOT_APPROVED" || issue === "PAYER_ACTION_REQUIRED") {
      return { status: "authorizing", message: "Waiting for you to approve the payment at PayPal." };
    }
    if (isTransient(err)) {
      return { status: "authorizing", message: `We couldn't confirm with PayPal yet. ${RETRY_SAFE}` };
    }
    if (issue !== "ORDER_ALREADY_AUTHORIZED") return fail(paypalMessage(err));
    try {
      auth = await deps.paypal.getOrderAuthorization(orderId);
    } catch (lookupErr) {
      if (isTransient(lookupErr)) {
        return { status: "authorizing", message: `We couldn't confirm with PayPal yet. ${RETRY_SAFE}` };
      }
      return fail(paypalMessage(lookupErr));
    }
    if (!auth) return { status: "authorizing", message: `PayPal hasn't finished placing the hold. ${RETRY_SAFE}` };
  }

  if (BAD_AUTH_STATUSES.has(auth.status)) {
    return fail(`PayPal returned the authorization as ${auth.status.toLowerCase()}. No funds are held.`);
  }

  const rec = (await deps.rpc("record_agent_authorization", {
    p_request_id: requestId,
    p_attempt: attempt,
    p_order_id: orderId,
    p_authorization_id: auth.authorizationId,
    p_authorization_status: auth.status,
    p_expires_at: auth.expiresAt,
  })) as DbResult;

  if (rec.outcome === "conflict") {
    // The owner declined (or the request changed) while PayPal was placing the hold: release it.
    try {
      await deps.paypal.voidAuthorization(auth.authorizationId, `${requestId}:${attempt}:void`);
      return { status: rec.status ?? "declined", message: "The request changed while PayPal placed the hold, so the hold was released." };
    } catch {
      return {
        status: rec.status ?? "declined",
        message: `The request changed while PayPal placed the hold and we couldn't release it automatically (authorization ${auth.authorizationId}). It will expire on its own, or you can void it in PayPal.`,
      };
    }
  }
  return { status: "authorized", message: "Funds are on hold with PayPal Sandbox. Nothing is captured yet." };
}

export async function runCancel(deps: FlowDeps, orderId: string): Promise<FlowResult> {
  const c = await check(deps, { orderId });
  const early = mapNonProceed(c);
  if (early) return early;
  const message = "You cancelled at PayPal. No funds were held.";
  await deps.rpc("fail_agent_authorization", { p_request_id: c.request_id, p_attempt: c.attempt, p_error: message });
  return { status: "authorization_failed", message };
}
