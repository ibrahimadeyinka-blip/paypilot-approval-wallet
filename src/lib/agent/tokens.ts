import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sha256Hex, TOKEN_PREFIX } from "./gateway-input";
import { IN_FLIGHT } from "./status";

export const TOKEN_LIFETIMES = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

export function generateSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseMerchantList(input: string): string[] {
  return Array.from(new Set(input.split(",").map((m) => m.trim().toLowerCase()).filter(Boolean)));
}

/** The plaintext secret is returned once and never stored; only its SHA-256 hash is saved. */
export async function issueAgentToken(label: string, lifetimeDays: number, merchants: string[]) {
  const secret = generateSecret();
  const { data, error } = await supabase
    .from("agent_tokens")
    .insert({
      label,
      token_hash: await sha256Hex(secret),
      token_prefix: secret.slice(0, 12),
      expires_at: new Date(Date.now() + lifetimeDays * 86_400_000).toISOString(),
      merchant_whitelist: merchants,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { token: data, secret };
}

export async function revokeAgentToken(id: string) {
  const { error } = await supabase.from("agent_tokens").update({ revoked: true }).eq("id", id);
  if (error) throw error;
}

export const agentTokensQuery = queryOptions({
  queryKey: ["agent_tokens"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("agent_tokens")
      .select("id, label, token_prefix, expires_at, merchant_whitelist, revoked, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const agentRequestsQuery = queryOptions({
  queryKey: ["agent_payment_requests"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("agent_payment_requests")
      .select("id, token_id, vendor_name, merchant_handle, amount_cents, currency, status, block_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },
});

export const approvalsQuery = queryOptions({
  queryKey: ["agent_payment_requests", "approvals"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("agent_payment_requests")
      .select(
        "id, vendor_name, merchant_handle, amount_cents, currency, description, source_context, status, block_reason, authorization_error, created_at, approved_at, decided_at, paypal_order_id, paypal_approve_url, paypal_authorization_id, paypal_authorization_status, paypal_authorization_expires_at, delivery_requirements, paypal_capture_id, paypal_capture_status, captured_at, captured_by, voided_at, settlement_error, agent_tokens(label), deliverables(id, filename, storage_path, mime_type, size_bytes, ai_verdict, ai_notes, ai_confidence, uploaded_at, reviewed_at), delivery_links(id, expires_at, used_at, revoked, created_at)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  },
  // While something finishes elsewhere (PayPal tab, merchant upload, a capture), poll for the result.
  refetchInterval: (q) =>
    q.state.data?.some((r) => IN_FLIGHT.has(r.status) || r.deliverables.some((d) => d.ai_verdict === "pending")) ||
    q.state.data?.some((r) => r.status === "authorized")
      ? 5000
      : false,
});
