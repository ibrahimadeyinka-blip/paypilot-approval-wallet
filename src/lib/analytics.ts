import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HistoryRow = { request_id: string; event: string; to_status: string | null; detail: string | null; created_at: string };
export type DraftRow = { ready: boolean; created_at: string };

/** Statuses that mean the owner approved and PayPal placed (or later settled) the hold. */
export const APPROVED_STATUSES = ["authorized", "awaiting_delivery", "delivered", "reviewing", "capturing", "captured", "voiding", "voided", "needs_owner_review"];

export type BlockKind = "single_cap" | "daily_budget" | "merchant" | "token" | "other";
export function classifyBlock(reason: string | null): BlockKind {
  const r = (reason ?? "").toLowerCase();
  if (/merchant|allowlist|whitelist/.test(r)) return "merchant";
  if (/24|daily|budget|rolling/.test(r)) return "daily_budget";
  if (/single|per[- ]payment|cap|exceeds|limit/.test(r)) return "single_cap";
  if (/expired|revoked|token/.test(r)) return "token";
  return "other";
}

/** Funnel: drafted in chat → sent for approval → blocked by token limits → approved. */
export function funnel(drafts: DraftRow[], history: HistoryRow[]) {
  const received = history.filter((h) => h.event === "request_received");
  const blockedRows = received.filter((h) => h.to_status === "blocked");
  const approved = new Set(history.filter((h) => h.to_status && APPROVED_STATUSES.includes(h.to_status)).map((h) => h.request_id));
  const reasons: Record<BlockKind, number> = { single_cap: 0, daily_budget: 0, merchant: 0, token: 0, other: 0 };
  for (const b of blockedRows) reasons[classifyBlock(b.detail)]++;
  const sent = received.length - blockedRows.length;
  return {
    drafted: drafts.length,
    readyDrafts: drafts.filter((d) => d.ready).length,
    sent,
    blocked: blockedRows.length,
    approved: approved.size,
    approvalRate: sent ? approved.size / sent : 0,
    reasons,
  };
}

/** Last 14 days, oldest first, by UTC day. */
export function daily(drafts: DraftRow[], history: HistoryRow[], now = new Date()) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (13 - i));
    return { day: d.toISOString().slice(0, 10), drafted: 0, sent: 0, blocked: 0 };
  });
  const idx = new Map(days.map((d, i) => [d.day, i]));
  for (const d of drafts) { const i = idx.get(d.created_at.slice(0, 10)); if (i !== undefined) days[i].drafted++; }
  for (const h of history) {
    if (h.event !== "request_received") continue;
    const i = idx.get(h.created_at.slice(0, 10)); if (i === undefined) continue;
    if (h.to_status === "blocked") days[i].blocked++; else days[i].sent++;
  }
  return days;
}

export const analyticsQuery = queryOptions({
  queryKey: ["agent_analytics"],
  refetchInterval: 20_000,
  queryFn: async () => {
    const [d, h] = await Promise.all([
      supabase.from("agent_drafts").select("ready, created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("agent_history").select("request_id, event, to_status, detail, created_at").order("created_at", { ascending: false }).limit(5000),
    ]);
    if (d.error) throw d.error;
    if (h.error) throw h.error;
    return { drafts: (d.data ?? []) as DraftRow[], history: (h.data ?? []) as HistoryRow[] };
  },
});

/** Visitor analytics hook; no-op when the built-in collector isn't present. */
export function track(name: string, props: Record<string, string | number | boolean> = {}) {
  try {
    const ev = (globalThis as unknown as { __lovableEvents?: { track?: (n: string, p: object) => void } }).__lovableEvents;
    ev?.track?.(name, props);
  } catch { /* never break the UI for analytics */ }
}
