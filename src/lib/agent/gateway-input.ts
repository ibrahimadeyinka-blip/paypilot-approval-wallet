import { z } from "zod";

/** Limits enforced by the database function; mirrored here for docs and the UI. */
export const SINGLE_PAYMENT_CAP_CENTS = 10_000; // $100
export const DAILY_BUDGET_CENTS = 50_000; // $500 rolling 24h
export const TOKEN_PREFIX = "apt_";

export const paymentRequestSchema = z.object({
  vendor_name: z.string().trim().min(1).max(120),
  merchant_handle: z.string().trim().min(1).max(120).transform((s) => s.toLowerCase()),
  amount_cents: z.number().int().positive().max(100_000_000),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((s) => s.toUpperCase())
    .default("USD"),
  description: z.string().trim().min(1).max(2000),
  source_context: z.string().trim().min(10, "source_context must quote the text that justifies the payment").max(2000),
});

export type PaymentRequestInput = z.infer<typeof paymentRequestSchema>;

/** Accepts the token from `Authorization: Bearer apt_...` (preferred) or a legacy `token` body field. */
export function extractToken(authHeader: string | null, body: unknown): string | null {
  const fromHeader = authHeader?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const fromBody =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).token === "string"
      ? ((body as Record<string, unknown>).token as string).trim()
      : undefined;
  const token = fromHeader ?? fromBody;
  if (!token || !token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  return token;
}

export function parseIdempotencyKey(header: string | null): string | null | "invalid" {
  if (header == null || header === "") return null;
  if (header.length > 200 || !/^[\w.:-]+$/.test(header)) return "invalid";
  return header;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type GatewayOutcome =
  | "pending_approval"
  | "blocked"
  | "replayed"
  | "unauthorized"
  | "idempotency_conflict";

/** HTTP status for each database outcome. */
export function statusForOutcome(outcome: GatewayOutcome, replayedStatus?: string): number {
  switch (outcome) {
    case "pending_approval":
      return 202;
    case "blocked":
      return 403;
    case "replayed":
      return replayedStatus === "blocked" ? 403 : 200;
    case "unauthorized":
      return 401;
    case "idempotency_conflict":
      return 409;
  }
}
