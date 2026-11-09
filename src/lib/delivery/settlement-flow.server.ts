/**
 * Deliverable review -> conditional capture, plus owner capture and void.
 * Payment is captured automatically only after an "approved" review; uncertain,
 * rejected or failed reviews leave the money on hold for the owner. Every
 * capture/void goes through database functions that lock the request and
 * re-check its state, and every PayPal call carries a stable PayPal-Request-Id.
 */
import { isTransient, PaypalError } from "@/lib/paypal/parse";
import { normalizeReview, type ReviewOutcome } from "./review";

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export interface SettlementPaypal {
  captureAuthorization(authorizationId: string, requestKey: string): Promise<{ captureId: string | null; status: string }>;
  voidAuthorization(authorizationId: string, requestKey: string): Promise<void>;
}

export interface SettlementDeps {
  rpc: Rpc;
  paypal: SettlementPaypal;
}

export interface SettlementResult {
  status: string;
  message: string;
}

interface Begin {
  outcome: string;
  attempt?: number;
  authorization_id?: string;
  reason?: string;
  status?: string;
}

const TERMINAL_CAPTURE_ISSUES = new Set(["AUTHORIZATION_EXPIRED", "AUTHORIZATION_VOIDED", "PREVIOUSLY_VOIDED", "AUTHORIZATION_DENIED"]);
const NO_HOLD_LEFT_ISSUES = new Set(["AUTHORIZATION_VOIDED", "AUTHORIZATION_ALREADY_VOIDED", "PREVIOUSLY_VOIDED", "AUTHORIZATION_EXPIRED"]);
const FAILED_CAPTURE_STATUSES = new Set(["DECLINED", "FAILED"]);

function describe(err: unknown): string {
  if (err instanceof PaypalError) {
    return err.kind === "config" ? err.message : `NEAR: ${err.message}${err.debugId ? ` (ref ${err.debugId})` : ""}`;
  }
  return "Unexpected error while contacting NEAR testnet.";
}

export async function runCapture(
  deps: SettlementDeps,
  input: { requestId: string; actor: "auto" | "owner"; ownerId: string | null },
): Promise<SettlementResult> {
  const b = (await deps.rpc("begin_agent_capture", {
    p_request_id: input.requestId,
    p_actor: input.actor,
    p_owner_id: input.ownerId,
  })) as Begin;

  switch (b.outcome) {
    case "not_found":
      return { status: "not_found", message: "We couldn't find that payment." };
    case "already_captured":
      return { status: "captured", message: "Payment was already released." };
    case "not_allowed":
      return { status: "held", message: b.reason ?? "Payment stays on hold." };
    case "expired":
      return { status: "capture_failed", message: b.reason ?? "The escrow hold expired. No funds were taken." };
    case "proceed":
      break;
    default:
      throw new Error(`Unexpected capture outcome: ${b.outcome}`);
  }

  const attempt = b.attempt as number;
  const key = `${input.requestId}:capture:${attempt}`;
  const record = async (captureId: string | null, status: string): Promise<SettlementResult> => {
    await deps.rpc("record_agent_capture", {
      p_request_id: input.requestId,
      p_attempt: attempt,
      p_capture_id: captureId,
      p_capture_status: status,
    });
    return { status: "captured", message: "Payment released on-chain on NEAR testnet." };
  };
  const fail = async (message: string, terminal: boolean): Promise<SettlementResult> => {
    await deps.rpc("fail_agent_capture", { p_request_id: input.requestId, p_attempt: attempt, p_error: message, p_terminal: terminal });
    return { status: terminal ? "capture_failed" : "authorized", message };
  };

  let cap: { captureId: string | null; status: string };
  try {
    cap = await deps.paypal.captureAuthorization(b.authorization_id as string, key);
  } catch (err) {
    const issue = err instanceof PaypalError ? err.issue : undefined;
    if (issue === "AUTHORIZATION_ALREADY_CAPTURED") return record(null, "ALREADY_CAPTURED");
    if (isTransient(err)) {
      return { status: "capturing", message: "NEAR testnet didn't confirm the capture yet. Try again — it won't charge twice." };
    }
    if (issue && TERMINAL_CAPTURE_ISSUES.has(issue)) return fail(`${describe(err)} No funds were taken.`, true);
    return fail(`${describe(err)} The money is still on hold.`, false);
  }
  if (FAILED_CAPTURE_STATUSES.has(cap.status)) {
    return fail(`NEAR testnet reported the capture as ${cap.status.toLowerCase()}. The money is still on hold.`, false);
  }
  return record(cap.captureId, cap.status);
}

export async function runVoid(deps: SettlementDeps, input: { requestId: string; ownerId: string }): Promise<SettlementResult> {
  const b = (await deps.rpc("begin_agent_void", { p_request_id: input.requestId, p_owner_id: input.ownerId })) as Begin;
  switch (b.outcome) {
    case "not_found":
      return { status: "not_found", message: "We couldn't find that payment." };
    case "already_voided":
      return { status: "voided", message: "The hold was already released." };
    case "not_allowed":
      return { status: "held", message: b.reason ?? "There is no hold to release." };
    case "proceed":
      break;
    default:
      throw new Error(`Unexpected void outcome: ${b.outcome}`);
  }
  const attempt = b.attempt as number;
  const record = async (note: string | null) => {
    await deps.rpc("record_agent_void", { p_request_id: input.requestId, p_attempt: attempt, p_note: note });
    return { status: "voided", message: "Hold released. No funds were taken." };
  };
  try {
    await deps.paypal.voidAuthorization(b.authorization_id as string, `${input.requestId}:release:${attempt}`);
  } catch (err) {
    const issue = err instanceof PaypalError ? err.issue : undefined;
    if (issue && NO_HOLD_LEFT_ISSUES.has(issue)) {
      return record("NEAR testnet reported no active hold remained (already voided or expired). No funds were taken.");
    }
    if (isTransient(err)) {
      return { status: "voiding", message: "NEAR testnet didn't confirm yet. Try again — it's safe to repeat." };
    }
    const message = `${describe(err)} The money is still on hold.`;
    await deps.rpc("fail_agent_void", { p_request_id: input.requestId, p_attempt: attempt, p_error: message });
    return { status: "authorized", message };
  }
  return record(null);
}

export interface ReviewResult {
  verdict: ReviewOutcome["verdict"];
  summary: string;
  payment: SettlementResult | null;
}

/**
 * Runs the AI review for a stored deliverable and captures only on "approved".
 * A provider error or unreadable answer is recorded as "uncertain" so the owner decides.
 */
export async function runReviewAndSettle(
  deps: SettlementDeps & { review: () => Promise<unknown>; model: string },
  input: { requestId: string; deliverableId: string },
): Promise<ReviewResult> {
  let outcome: ReviewOutcome;
  try {
    outcome = normalizeReview(await deps.review());
  } catch (err) {
    console.error("deliverable review failed", err);
    outcome = {
      verdict: "uncertain",
      summary: "The automatic review couldn't run, so payment stays on hold until the owner checks the file.",
      confidence: null,
    };
  }
  await deps.rpc("record_deliverable_review", {
    p_deliverable_id: input.deliverableId,
    p_verdict: outcome.verdict,
    p_summary: outcome.summary,
    p_confidence: outcome.confidence,
    p_model: deps.model,
  });
  const payment = outcome.verdict === "approved" ? await runCapture(deps, { requestId: input.requestId, actor: "auto", ownerId: null }) : null;
  return { verdict: outcome.verdict, summary: outcome.summary, payment };
}
