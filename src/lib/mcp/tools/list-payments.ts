import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_payments",
  title: "List payments",
  description: "List the connected account's latest agent payment requests and NEAR testnet escrow references.",
  inputSchema: { limit: z.number().int().min(1).max(100).default(25), status: z.string().max(40).optional() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    let query = supabaseForUser(ctx).from("agent_payment_requests")
      .select("id, vendor_name, merchant_handle, amount_cents, currency, description, status, created_at, paypal_order_id, paypal_authorization_id, paypal_capture_id, paypal_capture_status, captured_at, voided_at")
      .order("created_at", { ascending: false }).limit(limit);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw new ToolError("Could not read your payments.");
    const rows = data ?? [];
    return { content: [{ type: "text", text: JSON.stringify(rows) }], structuredContent: { rows } };
  },
});