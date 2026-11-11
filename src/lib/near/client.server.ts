/**
 * NEAR Testnet escrow adapter. Implements the same port the approval and
 * settlement flows use, so every database safeguard (caps, budget, locks,
 * idempotency) stays in charge:
 *  - createOrder   -> registers an escrow hold and returns the in-app confirm page
 *  - authorizeOrder-> verifies the owner's wallet deposit for this exact order on-chain
 *  - capture       -> sends NEAR on-chain from the escrow account to the payee
 *  - void          -> refunds the owner's deposit to the wallet that funded it
 * Testnet only. There is deliberately no mainnet switch.
 */
import { Account } from "@near-js/accounts";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { PaypalError, type PaypalAuthorization } from "@/lib/paypal/parse";
import { isNearAccountId, isTestnetPayee, centsToYocto, NEAR_RPC_URL } from "./units";
import { depositMismatch, escrowDepositYocto } from "./deposit";

const HOLD_DAYS = 29;

function config() {
  const accountId = process.env["NEAR_ESCROW_ACCOUNT_ID"]?.trim();
  const key = process.env["NEAR_ESCROW_PRIVATE_KEY"]?.trim();
  if (!accountId || !key) throw new PaypalError("config", "NEAR escrow account is not set up yet.");
  if (!isNearAccountId(accountId) || !accountId.endsWith(".testnet")) {
    throw new PaypalError("config", "The escrow account must be a NEAR testnet account (ending in .testnet).");
  }
  if (!key.startsWith("ed25519:")) throw new PaypalError("config", "The escrow private key must start with ed25519:.");
  return { accountId, key };
}

function provider() {
  return new JsonRpcProvider({ url: NEAR_RPC_URL });
}

function wrap(err: unknown, fallback: string): PaypalError {
  if (err instanceof PaypalError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out|abort/i.test(msg)) return new PaypalError("timeout", "NEAR testnet did not answer in time.");
  if (/fetch failed|network|ECONN/i.test(msg)) return new PaypalError("network", "Could not reach NEAR testnet.");
  if (/does not exist|UNKNOWN_ACCOUNT/i.test(msg)) return new PaypalError("api", "That NEAR account does not exist on testnet.");
  if (/NotEnoughBalance|LackBalance/i.test(msg)) return new PaypalError("api", "The escrow account does not have enough NEAR.");
  if (/access key|InvalidSignature|InvalidAccessKey/i.test(msg)) return new PaypalError("config", "NEAR rejected the escrow key. Check it is a full-access key for the escrow account.");
  return new PaypalError("api", fallback);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function availableYocto(accountId: string): Promise<bigint> {
  const state = (await new Account(accountId, provider()).getState()) as unknown as {
    balance: { available: bigint | string };
  };
  return BigInt(state.balance.available);
}

type FundingRow = {
  id: string;
  status: string;
  merchant_handle: string;
  amount_cents: number;
  currency: string;
  paypal_order_id: string | null;
  funding_tx_hash: string | null;
  funder_account_id: string | null;
  refund_tx_hash: string | null;
};
const FUNDING_COLUMNS =
  "id, status, merchant_handle, amount_cents, currency, paypal_order_id, funding_tx_hash, funder_account_id, refund_tx_hash";

async function requestBy(column: "paypal_order_id" | "paypal_authorization_id", value: string): Promise<FundingRow> {
  const db = await admin();
  const { data, error } = await db.from("agent_payment_requests").select(FUNDING_COLUMNS).eq(column, value).maybeSingle();
  if (error || !data) throw new PaypalError("api", "Could not find the escrow hold for this request.");
  return data as FundingRow;
}

function newOrderId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "NEAR" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const orderFromAuthorization = (authorizationId: string) => authorizationId.replace(/^NEARHOLD-/, "");

/** Statuses where an owner's deposit is no longer backing a hold and must go back to them. */
const REFUNDABLE = new Set(["voiding", "voided", "declined", "blocked", "authorization_failed"]);
/** Statuses where a freshly sent deposit may be recorded against its order. */
const ATTACHABLE = new Set(["authorizing", "declined", "blocked", "authorization_failed"]);

/** Reads a transaction from NEAR testnet RPC. Unknown (not yet indexed) transactions are transient. */
async function fetchTx(txHash: string, sender: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(NEAR_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "vigil", method: "tx", params: { tx_hash: txHash, sender_account_id: sender, wait_until: "EXECUTED_OPTIMISTIC" } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw wrap(err, "Could not reach NEAR testnet.");
  }
  const body = (await res.json().catch(() => null)) as { result?: unknown; error?: { cause?: { name?: string }; message?: string } } | null;
  if (body?.result) return body.result;
  const cause = body?.error?.cause?.name ?? "";
  if (/UNKNOWN_TRANSACTION|TIMEOUT_ERROR/.test(cause) || res.status >= 500) {
    throw new PaypalError("timeout", "NEAR testnet hasn't finalised your deposit yet.");
  }
  throw new PaypalError("api", "NEAR testnet could not find that deposit transaction.");
}

async function verifyDeposit(row: FundingRow, escrow: string): Promise<void> {
  if (!row.funding_tx_hash || !row.funder_account_id || !row.paypal_order_id) {
    throw new PaypalError("api", "No deposit is recorded for this escrow order.");
  }
  const result = await fetchTx(row.funding_tx_hash, row.funder_account_id);
  const reason = depositMismatch(result, {
    funder: row.funder_account_id,
    escrow,
    yocto: escrowDepositYocto(row.amount_cents, row.paypal_order_id),
  });
  if (reason) throw new PaypalError("api", reason, undefined, "DEPOSIT_MISMATCH");
}

/** The escrow account owners deposit into. Account ids are public on-chain. */
export function escrowAccountId(): string {
  return config().accountId;
}

/**
 * Records the owner's wallet deposit transaction against its escrow order.
 * Only one deposit per order; the same transaction can never fund two orders.
 */
export async function attachDeposit(input: { orderId: string; txHash: string; funder: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = await admin();
  const row = await requestBy("paypal_order_id", input.orderId);
  if (row.funding_tx_hash) {
    return row.funding_tx_hash === input.txHash ? { ok: true } : { ok: false, reason: "A different deposit is already recorded for this escrow order." };
  }
  if (!ATTACHABLE.has(row.status)) return { ok: false, reason: "This request is no longer waiting for a deposit." };
  const { data, error } = await db
    .from("agent_payment_requests")
    .update({ funding_tx_hash: input.txHash, funder_account_id: input.funder, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("paypal_order_id", input.orderId)
    .is("funding_tx_hash", null)
    .select("id");
  if (error) {
    return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "That transaction already funded another order." : "Could not record the deposit." };
  }
  return data && data.length > 0 ? { ok: true } : { ok: false, reason: "This request changed while recording the deposit. Refresh and try again." };
}

/**
 * Sends an owner's deposit back to the wallet that funded it, once, when it no
 * longer backs a hold. Claims the refund row first so two callers can't both pay.
 * Returns the refund transaction hash, or null when there is nothing to refund.
 */
export async function refundDeposit(orderId: string): Promise<string | null> {
  const { accountId, key } = config();
  const db = await admin();
  const row = await requestBy("paypal_order_id", orderId);
  if (!row.funding_tx_hash || !row.funder_account_id || row.refund_tx_hash) return row.refund_tx_hash;
  if (!REFUNDABLE.has(row.status)) return null;
  const claim = `pending:${crypto.randomUUID()}`;
  const { data: claimed } = await db
    .from("agent_payment_requests")
    .update({ refund_tx_hash: claim })
    .eq("id", row.id)
    .is("refund_tx_hash", null)
    .select("id");
  if (!claimed || claimed.length === 0) return null;
  const release = () => db.from("agent_payment_requests").update({ refund_tx_hash: null }).eq("id", row.id).eq("refund_tx_hash", claim);
  try {
    await verifyDeposit(row, accountId);
  } catch (err) {
    await release();
    throw err;
  }
  try {
    const signer = KeyPairSigner.fromSecretKey(key as `ed25519:${string}`);
    const account = new Account(accountId, provider(), signer);
    const outcome = (await account.transfer({
      receiverId: row.funder_account_id,
      amount: escrowDepositYocto(row.amount_cents, orderId),
    })) as unknown as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
    const hash = outcome.transaction?.hash ?? outcome.transaction_outcome?.id ?? "sent";
    await db.from("agent_payment_requests").update({ refund_tx_hash: hash }).eq("id", row.id);
    return hash;
  } catch (err) {
    const wrapped = wrap(err, "NEAR testnet rejected the refund transaction.");
    // Only clear the claim when NEAR clearly refused; an unanswered send may have gone through.
    if (wrapped.kind !== "timeout" && wrapped.kind !== "network") await release();
    throw wrapped;
  }
}

export const nearEscrow = {
  async createOrder(input: {
    requestKey: string;
    referenceId: string;
    amountCents: number;
    currency: string;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<{ orderId: string; approveUrl: string }> {
    config();
    if (input.currency !== "NEAR") throw new PaypalError("api", "Only NEAR payments are supported.");
    const orderId = newOrderId();
    const url = new URL(input.returnUrl);
    url.searchParams.set("token", orderId);
    return { orderId, approveUrl: url.toString() };
  },

  /** Places the hold once the owner's wallet deposit for this exact order is confirmed on-chain. */
  async authorizeOrder(orderId: string): Promise<PaypalAuthorization> {
    const { accountId } = config();
    const req = await requestBy("paypal_order_id", orderId);
    const payee = (req.merchant_handle ?? "").trim().toLowerCase();
    if (!isTestnetPayee(payee)) {
      throw new PaypalError("api", `"${payee}" is not a NEAR account. Payees must be accounts like designer.testnet.`);
    }
    try {
      await new Account(payee, provider()).getState();
    } catch (err) {
      throw wrap(err, `NEAR account ${payee} could not be found on testnet.`);
    }
    if (!req.funding_tx_hash) {
      throw new PaypalError("api", "Waiting for the deposit from your NEAR wallet.", undefined, "PAYER_ACTION_REQUIRED");
    }
    try {
      await verifyDeposit(req, accountId);
    } catch (err) {
      if (err instanceof PaypalError && err.issue === "DEPOSIT_MISMATCH") {
        // Not a deposit for this order: forget it so the owner can send the right one.
        const db = await admin();
        await db
          .from("agent_payment_requests")
          .update({ funding_tx_hash: null, funder_account_id: null })
          .eq("id", req.id)
          .eq("funding_tx_hash", req.funding_tx_hash);
      }
      throw err;
    }
    return {
      authorizationId: `NEARHOLD-${orderId}`,
      status: "CREATED",
      expiresAt: new Date(Date.now() + HOLD_DAYS * 86_400_000).toISOString(),
    };
  },

  async getOrderAuthorization(orderId: string): Promise<PaypalAuthorization | null> {
    return { authorizationId: `NEARHOLD-${orderId}`, status: "CREATED", expiresAt: null };
  },

  /** Releasing a hold refunds the owner's wallet deposit on-chain (no-op for older escrow-funded holds). */
  async voidAuthorization(authorizationId: string): Promise<void> {
    await refundDeposit(orderFromAuthorization(authorizationId));
  },

  /** Sends the held amount on-chain from escrow to the payee. Returns the transaction hash. */
  async captureAuthorization(authorizationId: string): Promise<{ captureId: string | null; status: string }> {
    const { accountId, key } = config();
    const req = await requestBy("paypal_authorization_id", authorizationId);
    const payee = (req.merchant_handle ?? "").trim().toLowerCase();
    if (!isTestnetPayee(payee)) throw new PaypalError("api", `"${payee}" is not a NEAR account.`);
    try {
      const signer = KeyPairSigner.fromSecretKey(key as `ed25519:${string}`);
      const account = new Account(accountId, provider(), signer);
      const outcome = (await account.transfer({ receiverId: payee, amount: centsToYocto(req.amount_cents) })) as unknown as {
        transaction?: { hash?: string };
        transaction_outcome?: { id?: string };
      };
      return { captureId: outcome.transaction?.hash ?? outcome.transaction_outcome?.id ?? null, status: "COMPLETED" };
    } catch (err) {
      throw wrap(err, "NEAR testnet rejected the release transaction.");
    }
  },
};

/** Configuration check only: reads the escrow balance without sending anything. */
export async function verifyEscrowAccount(): Promise<{ balanceYocto: bigint }> {
  const { accountId, key } = config();
  KeyPairSigner.fromSecretKey(key as `ed25519:${string}`);
  try {
    return { balanceYocto: await availableYocto(accountId) };
  } catch (err) {
    throw wrap(err, "Could not read the escrow account on NEAR testnet.");
  }
}
