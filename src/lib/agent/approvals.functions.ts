import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Loads server-only modules inside handlers so they never reach the browser bundle. */
async function loadFlow() {
  const [{ supabaseAdmin }, { sandboxPaypal }, flow] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/paypal/client.server"),
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
  return { flow, deps: { rpc, paypal: sandboxPaypal } };
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
      returnUrl: `${data.origin}/paypal/return`,
      cancelUrl: `${data.origin}/paypal/return?cancelled=1`,
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
    return { status: status ?? "declined" };
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
