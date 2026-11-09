export type BadgeTone = "default" | "secondary" | "destructive" | "outline";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending_approval: { label: "Needs your approval", tone: "default" },
  authorizing: { label: "Locking escrow", tone: "secondary" },
  authorized: { label: "Funds on hold", tone: "default" },
  authorization_failed: { label: "Hold failed", tone: "destructive" },
  approved: { label: "Approved (old flow)", tone: "secondary" },
  declined: { label: "Declined", tone: "outline" },
  blocked: { label: "Blocked", tone: "destructive" },
  capturing: { label: "Releasing payment", tone: "secondary" },
  captured: { label: "Paid", tone: "default" },
  capture_failed: { label: "Payment not released", tone: "destructive" },
  voiding: { label: "Releasing hold", tone: "secondary" },
  voided: { label: "Hold released", tone: "outline" },
};

export function statusMeta(status: string): { label: string; tone: BadgeTone } {
  return STATUS[status] ?? { label: status.replace(/_/g, " "), tone: "secondary" };
}

/** Requests that still need the owner to approve or decline. */
export const NEEDS_ACTION = new Set(["pending_approval", "authorizing", "authorization_failed"]);

/** Requests with NEAR held in escrow, waiting on delivery or settlement. */
export const ON_HOLD = new Set(["authorized", "capturing", "voiding"]);

/** Statuses that show the delivery panel. */
export const HAS_DELIVERY = new Set(["authorized", "capturing", "voiding", "captured", "capture_failed", "voided"]);

/** Statuses that should poll because a server step may finish elsewhere. */
export const IN_FLIGHT = new Set(["authorizing", "capturing", "voiding"]);

const VERDICT: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Review running", tone: "secondary" },
  approved: { label: "AI: meets requirements", tone: "default" },
  rejected: { label: "AI: doesn't meet requirements", tone: "destructive" },
  uncertain: { label: "AI: unsure — your call", tone: "secondary" },
};

export function verdictMeta(v: string): { label: string; tone: BadgeTone } {
  return VERDICT[v] ?? { label: v, tone: "secondary" };
}
