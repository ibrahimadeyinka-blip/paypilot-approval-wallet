export type ApprovalGroup = "new" | "successful" | "unsuccessful";
export type TokenGroup = "active" | "revoked";

/** Presentation only; financial safeguards remain in the database. */
export function approvalGroup(status: string): ApprovalGroup {
  if (["pending_approval", "authorizing"].includes(status)) return "new";
  if (["authorized", "capturing", "voiding", "captured", "approved"].includes(status)) return "successful";
  return "unsuccessful";
}

/** The inactive view includes expired tokens without changing their revoked flag. */
export function tokenGroup(token: { revoked: boolean; expires_at: string }, now: number): TokenGroup {
  return !token.revoked && new Date(token.expires_at).getTime() > now ? "active" : "revoked";
}