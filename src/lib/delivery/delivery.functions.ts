import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sha256Hex } from "@/lib/agent/gateway-input";

const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);

/** Public: what the merchant sees on the upload page. No owner details. */
export const getDeliveryLinkInfo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().max(100) }).parse(d))
  .handler(async ({ data }) => {
    if (!tokenSchema.safeParse(data.token).success) return { state: "not_found" as const };
    const { getServerDeps } = await import("@/lib/server-deps.server");
    const info = (await getServerDeps().rpc("get_delivery_link_info", { p_token_hash: await sha256Hex(data.token) })) as {
      state: "not_found" | "active" | "used" | "expired" | "revoked" | "closed";
      vendor_name?: string;
      description?: string;
      requirements?: string | null;
      amount_cents?: number;
      currency?: string;
      expires_at?: string;
    };
    return {
      state: info.state,
      vendorName: info.vendor_name ?? null,
      description: info.description ?? null,
      requirements: info.requirements ?? null,
      amountCents: info.amount_cents ?? null,
      currency: info.currency ?? null,
      expiresAt: info.expires_at ?? null,
    };
  });

export const createDeliveryLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: z.string().uuid(), requirements: z.string().max(2000), days: z.number().int().min(1).max(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { data: res, error } = await context.supabase.rpc("create_delivery_link", {
      p_request_id: data.requestId,
      p_token_hash: await sha256Hex(token),
      p_requirements: data.requirements,
      p_days: data.days,
    });
    if (error) throw new Error(error.message.includes("on hold") ? "Upload links can only be created while funds are on hold." : "Could not create the link.");
    return { path: `/deliver/${token}`, expiresAt: (res as { expires_at: string }).expires_at };
  });

/** Owner accepts the work and releases the held payment (allowed after an approved or uncertain review). */
export const captureHeldPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ getServerDeps }, { runCapture }] = await Promise.all([
      import("@/lib/server-deps.server"),
      import("./settlement-flow.server"),
    ]);
    return runCapture(getServerDeps(), { requestId: data.requestId, actor: "owner", ownerId: context.userId });
  });

/** Owner releases the hold (voids the PayPal authorization). */
export const releaseHeldPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ getServerDeps }, { runVoid }] = await Promise.all([
      import("@/lib/server-deps.server"),
      import("./settlement-flow.server"),
    ]);
    return runVoid(getServerDeps(), { requestId: data.requestId, ownerId: context.userId });
  });
