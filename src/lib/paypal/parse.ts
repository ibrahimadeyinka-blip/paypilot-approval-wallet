/** Browser-safe PayPal helpers: error type and response parsing. No network, no secrets. */

export type PaypalErrorKind = "config" | "timeout" | "network" | "api";

export class PaypalError extends Error {
  constructor(
    public readonly kind: PaypalErrorKind,
    message: string,
    public readonly status?: number,
    public readonly issue?: string,
    public readonly debugId?: string,
  ) {
    super(message);
    this.name = "PaypalError";
  }
}

/**
 * Transient failures may or may not have reached PayPal. They are safe to retry
 * because every PayPal call carries a stable PayPal-Request-Id.
 */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof PaypalError)) return false;
  return err.kind === "timeout" || err.kind === "network" || (err.kind === "api" && (err.status ?? 0) >= 500);
}

export interface PaypalAuthorization {
  authorizationId: string;
  status: string;
  expiresAt: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

/** Reads purchase_units[0].payments.authorizations[0] from a PayPal order response. */
export function parseAuthorization(order: unknown): PaypalAuthorization | null {
  if (!isObj(order) || !Array.isArray(order["purchase_units"])) return null;
  const unit = order["purchase_units"][0];
  const payments = isObj(unit) ? unit["payments"] : undefined;
  const auths = isObj(payments) ? payments["authorizations"] : undefined;
  const auth = Array.isArray(auths) ? auths[0] : undefined;
  if (!isObj(auth) || typeof auth["id"] !== "string") return null;
  return {
    authorizationId: auth["id"],
    status: typeof auth["status"] === "string" ? auth["status"] : "UNKNOWN",
    expiresAt: typeof auth["expiration_time"] === "string" ? auth["expiration_time"] : null,
  };
}

/** Finds the URL the payer opens to approve an order. */
export function parseApproveUrl(order: unknown): string | null {
  if (!isObj(order) || !Array.isArray(order["links"])) return null;
  for (const rel of ["payer-action", "approve"]) {
    const link = order["links"].find((l) => isObj(l) && l["rel"] === rel);
    if (isObj(link) && typeof link["href"] === "string") return link["href"];
  }
  return null;
}

/** Builds a PaypalError from a failed PayPal response body. */
export function errorFromResponse(status: number, body: unknown): PaypalError {
  const b = isObj(body) ? body : {};
  const details = Array.isArray(b["details"]) ? b["details"] : [];
  const first = isObj(details[0]) ? details[0] : {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const issue = str(first["issue"]) ?? str(b["name"]) ?? str(b["error"]);
  const message =
    str(first["description"]) ?? str(b["message"]) ?? str(b["error_description"]) ?? `PayPal returned ${status}`;
  return new PaypalError("api", message, status, issue, str(b["debug_id"]));
}

export function centsToValue(cents: number): string {
  return (cents / 100).toFixed(2);
}
