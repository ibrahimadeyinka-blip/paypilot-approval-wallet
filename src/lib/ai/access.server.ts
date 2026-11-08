import { APICallError } from "ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertAiAccess(ownerId: string) {
  const { data, error } = await supabaseAdmin.from("agent_ai_state").select("pause_reason").eq("owner_id", ownerId).maybeSingle();
  if (error) throw new Error("Could not check AI access. Run Setup checks.");
  if (data?.pause_reason) throw new Error(data.pause_reason);
}

export async function handleAiFailure(ownerId: string, error: unknown): Promise<never> {
  let message = "The AI request could not finish. No automatic retry was made.";
  if (APICallError.isInstance(error)) {
    let body: unknown;
    try { body = JSON.parse(error.responseBody ?? "{}"); } catch { body = null; }
    if (body && typeof body === "object") {
      const b = body as { message?: unknown; error?: { message?: unknown } };
      const safe = b.message ?? b.error?.message;
      if (typeof safe === "string") message = safe;
    }
    if (error.statusCode === 402 || error.statusCode === 403) {
      const { error: saveError } = await supabaseAdmin.from("agent_ai_state").upsert({ owner_id: ownerId, pause_reason: message, updated_at: new Date().toISOString() });
      if (saveError) throw new Error("AI access is blocked and its status could not be saved. Run Setup checks before continuing.");
    }
  }
  throw new Error(message);
}