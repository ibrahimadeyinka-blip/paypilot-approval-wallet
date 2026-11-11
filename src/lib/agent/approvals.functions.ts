import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Loads server-only modules inside handlers so they never reach the browser bundle. */
async function loadFlow() {
  const [{ supabaseAdmin }, { nearEscrow }, flow] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/near/client.server"),
    import("./approval-flow.server"),
  ]);
  const callRpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await callRpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  return { flow, deps: { rpc, paypal: nearEscrow } };
}

const originSchema = z
  .string()
  .url()
  .transform((u) => new URL(u))
  .refine((u) => u.protocol === "https:" || u.hostname === "localhost", "Invalid origin")
  .transform((u) => u.origin);

export const approveAgentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid(), origin: originSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { flow, deps } = await loadFlow();
    return flow.runApprove(deps, {
      ownerId: context.userId,
      requestId: data.requestId,
      returnUrl: `${data.origin}/escrow/confirm`,
      cancelUrl: `${data.origin}/escrow/confirm?cancelled=1`,
    });
  });

export const confirmAgentAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { flow, deps } = await loadFlow();
    return flow.runConfirm(deps, { requestId: data.requestId, ownerId: context.userId });
  });

export const declineAgentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: status, error } = await context.supabase.rpc("decline_agent_payment", { p_request_id: data.requestId });
    if (error) throw new Error("Could not decline that request.");
    // If the owner already deposited from their wallet, send it straight back.
    const { data: row } = await context.supabase
      .from("agent_payment_requests")
      .select("paypal_order_id, funding_tx_hash")
      .eq("id", data.requestId)
      .maybeSingle();
    let refundNote: string | null = null;
    if (row?.paypal_order_id && row.funding_tx_hash) {
      const { refundDeposit } = await import("@/lib/near/client.server");
      try {
        refundNote = (await refundDeposit(row.paypal_order_id)) ? "Your deposit was refunded to your wallet." : null;
      } catch {
        refundNote = "We couldn't refund your deposit yet. Decline again to retry.";
      }
    }
    return { status: status ?? "declined", refundNote };
  });

const orderIdSchema = z.string().regex(/^NEAR[0-9A-F]{24}$/);

/** Owner-only: what their wallet must send to lock this escrow order. */
export const getEscrowLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: orderIdSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("agent_payment_requests")
      .select("id, vendor_name, merchant_handle, description, amount_cents, status, funding_tx_hash, funder_account_id")
      .eq("paypal_order_id", data.orderId)
      .maybeSingle();
    if (error || !row) return { found: false as const };
    const [{ escrowAccountId }, { escrowDepositYocto }] = await Promise.all([
      import("@/lib/near/client.server"),
      import("@/lib/near/deposit"),
    ]);
    let escrow: string | null = null;
    try {
      escrow = escrowAccountId();
    } catch {
      escrow = null;
    }
    return {
      found: true as const,
      requestId: row.id,
      vendorName: row.vendor_name,
      payee: row.merchant_handle,
      description: row.description,
      amountCents: row.amount_cents,
      status: row.status,
      fundingTxHash: row.funding_tx_hash,
      funder: row.funder_account_id,
      escrowAccountId: escrow,
      depositYocto: escrowDepositYocto(row.amount_cents, data.orderId).toString(),
    };
  });

const FAILED = new Set(["blocked", "authorization_failed", "declined", "changed"]);

/**
 * Owner-only: records the deposit their wallet just sent, verifies it on NEAR testnet
 * and places the hold. If a safeguard stops the hold, the deposit is refunded.
 */
export const submitEscrowDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: orderIdSchema,
        txHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/),
        funder: z.string().min(2).max(64).regex(/^[a-z0-9._-]+$/),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: owned } = await context.supabase
      .from("agent_payment_requests")
      .select("id")
      .eq("paypal_order_id", data.orderId)
      .maybeSingle();
    if (!owned) return { status: "not_found", message: "We couldn't find that escrow order." };
    const near = await import("@/lib/near/client.server");
    const attached = await near.attachDeposit({ orderId: data.orderId, txHash: data.txHash, funder: data.funder });
    if (!attached.ok) return { status: "authorization_failed", message: attached.reason };
    const { flow, deps } = await loadFlow();
    const result = await flow.runConfirm(deps, { orderId: data.orderId });
    if (FAILED.has(result.status)) {
      try {
        const refund = await near.refundDeposit(data.orderId);
        if (refund) return { status: result.status, message: `${result.message} Your deposit was refunded to ${data.funder}.` };
      } catch {
        return { status: result.status, message: `${result.message} We couldn't refund your deposit automatically yet — decline the request to retry the refund.` };
      }
    }
    return { status: result.status, message: result.message };
  });

/**
 * Public on purpose: PayPal sends the payer back here, possibly in a new tab
 * without the app session. It only acts on a PayPal order id we issued, and the
 * database re-checks every safeguard before the hold is placed.
 */
export const completePaypalReturn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().regex(/^[A-Z0-9]{8,40}$/), cancelled: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { flow, deps } = await loadFlow();
    const r = data.cancelled ? await flow.runCancel(deps, data.orderId) : await flow.runConfirm(deps, { orderId: data.orderId });
    return { status: r.status, message: r.message };
  });
