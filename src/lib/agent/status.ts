export type BadgeTone = "default" | "secondary" | "destructive" | "outline";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending_approval: { label: "Needs your approval", tone: "default" },
  authorizing: { label: "Waiting for PayPal", tone: "secondary" },
  authorized: { label: "Funds on hold", tone: "default" },
  authorization_failed: { label: "Hold failed", tone: "destructive" },
  approved: { label: "Approved (old flow)", tone: "secondary" },
  declined: { label: "Declined", tone: "outline" },
  blocked: { label: "Blocked", tone: "destructive" },
};

export function statusMeta(status: string): { label: string; tone: BadgeTone } {
  return STATUS[status] ?? { label: status.replace(/_/g, " "), tone: "secondary" };
}

/** Requests that still need the owner to do something. */
export const NEEDS_ACTION = new Set(["pending_approval", "authorizing", "authorization_failed"]);
