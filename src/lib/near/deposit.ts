/**
 * Browser-safe helpers for owner-funded escrow deposits.
 *
 * Every escrow order gets a tiny, order-specific "tag" (1 to 1e9 yocto, i.e. at most
 * 0.000000000000001 NEAR) added to the deposit. The server only accepts a deposit
 * whose amount matches exactly, so a transaction can only fund the order it was made for.
 */
import { centsToYocto } from "./units";

const ORDER_ID = /^NEAR[0-9A-F]{24}$/;

export function isEscrowOrderId(orderId: string): boolean {
  return ORDER_ID.test(orderId);
}

export function depositTagYocto(orderId: string): bigint {
  if (!isEscrowOrderId(orderId)) throw new Error("Invalid escrow order id.");
  return (BigInt("0x" + orderId.slice(4, 20)) % 1_000_000_000n) + 1n;
}

/** Exact yocto amount the owner's wallet must send to the escrow account for this order. */
export function escrowDepositYocto(amountCents: number, orderId: string): bigint {
  return centsToYocto(amountCents) + depositTagYocto(orderId);
}

export function orderIdFromApproveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const id = new URL(url).searchParams.get("token");
    return id && isEscrowOrderId(id) ? id : null;
  } catch {
    return null;
  }
}

export interface DepositExpectation {
  funder: string;
  escrow: string;
  yocto: bigint;
}

/**
 * Checks a NEAR RPC `tx` result. Returns null when it is a successful, single
 * transfer of exactly the expected amount from the funder to escrow; otherwise the reason.
 */
export function depositMismatch(result: unknown, expected: DepositExpectation): string | null {
  const r = result as {
    status?: Record<string, unknown>;
    transaction?: { signer_id?: string; receiver_id?: string; actions?: unknown[] };
  };
  const tx = r?.transaction;
  if (!tx) return "NEAR testnet returned no transaction.";
  if (tx.signer_id !== expected.funder) return "That deposit was sent from a different wallet.";
  if (tx.receiver_id !== expected.escrow) return "That transaction was not sent to the Vigil escrow account.";
  const actions = Array.isArray(tx.actions) ? tx.actions : [];
  const transfer = actions.length === 1 ? (actions[0] as { Transfer?: { deposit?: string } }).Transfer : undefined;
  if (!transfer || typeof transfer.deposit !== "string") return "That transaction is not a plain NEAR transfer.";
  let deposit: bigint;
  try {
    deposit = BigInt(transfer.deposit);
  } catch {
    return "That transaction has an unreadable amount.";
  }
  if (deposit !== expected.yocto) return "That deposit does not match this escrow order's exact amount.";
  if (!r.status || !("SuccessValue" in r.status)) return "That deposit did not succeed on NEAR testnet.";
  return null;
}
