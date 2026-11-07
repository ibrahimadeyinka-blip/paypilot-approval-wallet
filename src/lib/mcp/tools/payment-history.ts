import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "payment_history",
  title: "Payment history",
  description: "Read a payment's recorded state changes, delivery reviews, and settlement audit trail for the connected account.",
  inputSchema: { request_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ request_id }, ctx) => {
    const { data, error } = await supabaseForUser(ctx).from("agent_payment_requests")
      .select("id, status, source_context, agent_history(id, actor, event, from_status, to_status, detail, metadata, created_at), transactions(audit_timeline(id, step, actor, title, detail, metadata, created_at))")
      .eq("id", request_id).maybeSingle();
    if (error || !data) throw new ToolError("Payment not found or inaccessible.");
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { payment: data } };
  },
});