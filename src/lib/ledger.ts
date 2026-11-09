import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ledgerQuery = queryOptions({
  queryKey: ["ledger"],
  queryFn: async () => {
    const { data, error } = await supabase.from("agent_payment_requests")
      .select("id, vendor_name, merchant_handle, amount_cents, currency, description, source_context, status, created_at, paypal_order_id, paypal_authorization_id, paypal_capture_id, paypal_capture_status, captured_at, voided_at, transaction_id, agent_history(id, actor, event, from_status, to_status, detail, metadata, created_at), transactions(audit_timeline(id, step, actor, title, detail, metadata, created_at))")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return data;
  },
  refetchInterval: 15000,
});

export const money = (cents: number, _currency = "NEAR") => `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NEAR`;

/** A hold is never counted as paid; pending PayPal captures remain unconfirmed. */
export function ledgerTotals(rows: { amount_cents: number; status: string; paypal_capture_status: string | null }[]) {
  return rows.reduce((total, r) => {
    if (["authorized", "capturing", "voiding"].includes(r.status)) total.held += r.amount_cents;
    if (r.status === "captured" && ["COMPLETED", "ALREADY_CAPTURED"].includes(r.paypal_capture_status ?? "")) total.paid += r.amount_cents;
    if (r.status === "captured" && !["COMPLETED", "ALREADY_CAPTURED"].includes(r.paypal_capture_status ?? "")) total.unconfirmed += r.amount_cents;
    if (r.status === "voided") total.released += r.amount_cents;
    return total;
  }, { held: 0, paid: 0, released: 0, unconfirmed: 0 });
}

export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}