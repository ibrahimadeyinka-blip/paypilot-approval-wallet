import { createFileRoute } from "@tanstack/react-router";
import {
  extractToken,
  parseIdempotencyKey,
  paymentRequestSchema,
  sha256Hex,
  statusForOutcome,
  type GatewayOutcome,
} from "@/lib/agent/gateway-input";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
};

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: cors });
}

export const Route = createFileRoute("/api/public/agent-gateway")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const raw = await request.json().catch(() => null);
        const token = extractToken(request.headers.get("authorization"), raw);
        if (!token) return json({ error: "Missing or malformed agent token" }, 401);

        const idem = parseIdempotencyKey(request.headers.get("idempotency-key"));
        if (idem === "invalid") return json({ error: "Invalid Idempotency-Key header" }, 400);

        const parsed = paymentRequestSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid request", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
        }
        const b = parsed.data;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("submit_agent_payment", {
            p_token_hash: await sha256Hex(token),
            p_vendor_name: b.vendor_name,
            p_merchant_handle: b.merchant_handle,
            p_amount_cents: b.amount_cents,
            p_currency: b.currency,
            p_description: b.description,
            p_source_context: b.source_context,
            p_idempotency_key: idem as string,
          });
          if (error) throw error;
          const r = data as { outcome: GatewayOutcome; request_id?: string; status?: string; reason?: string | null };
          return json(
            { request_id: r.request_id, status: r.status ?? r.outcome, reason: r.reason ?? undefined, replayed: r.outcome === "replayed" || undefined },
            statusForOutcome(r.outcome, r.status),
          );
        } catch (err) {
          console.error("agent-gateway failed", err);
          return json({ error: "Payment gateway unavailable. Please try again." }, 500);
        }
      },
    },
  },
});
