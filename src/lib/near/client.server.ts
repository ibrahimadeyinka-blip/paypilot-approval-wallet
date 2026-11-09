/**
 * NEAR Testnet escrow adapter. Implements the same port the approval and
 * settlement flows use, so every database safeguard (caps, budget, locks,
 * idempotency) stays in charge:
 *  - createOrder   -> registers an escrow hold and returns the in-app confirm page
 *  - authorizeOrder-> verifies the escrow account can cover the amount on-chain
 *  - capture       -> sends NEAR on-chain from the escrow account to the payee
 *  - void          -> releases the reservation (no funds leave escrow)
 * Testnet only. There is deliberately no mainnet switch.
 */
import { Account } from "@near-js/accounts";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { PaypalError, type PaypalAuthorization } from "@/lib/paypal/parse";
import { isNearAccountId, centsToYocto, NEAR_RPC_URL } from "./units";

const GAS_RESERVE_YOCTO = 50_000_000_000_000_000_000_000n; // 0.05 NEAR kept for fees
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

async function requestBy(column: "paypal_order_id" | "paypal_authorization_id", value: string) {
  const db = await admin();
  const { data, error } = await db
    .from("agent_payment_requests")
    .select("id, merchant_handle, amount_cents, currency")
    .eq(column, value)
    .maybeSingle();
  if (error || !data) throw new PaypalError("api", "Could not find the escrow hold for this request.");
  return data;
}

function newOrderId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "NEAR" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
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

  async authorizeOrder(orderId: string): Promise<PaypalAuthorization> {
    const { accountId } = config();
    const req = await requestBy("paypal_order_id", orderId);
    const payee = (req.merchant_handle ?? "").trim().toLowerCase();
    if (!isNearAccountId(payee)) {
      throw new PaypalError("api", `"${payee}" is not a NEAR account. Payees must be accounts like designer.testnet.`);
    }
    try {
      await new Account(payee, provider()).getState();
    } catch (err) {
      throw wrap(err, `NEAR account ${payee} could not be found on testnet.`);
    }
    let available: bigint;
    try {
      available = await availableYocto(accountId);
    } catch (err) {
      throw wrap(err, "Could not read the escrow balance on NEAR testnet.");
    }
    if (available < centsToYocto(req.amount_cents) + GAS_RESERVE_YOCTO) {
      throw new PaypalError("api", "The escrow account does not have enough NEAR to cover this payment.");
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

  /** Releasing a hold keeps the NEAR in escrow; nothing is sent on-chain. */
  async voidAuthorization(): Promise<void> {
    return;
  },

  /** Sends the held amount on-chain from escrow to the payee. Returns the transaction hash. */
  async captureAuthorization(authorizationId: string): Promise<{ captureId: string | null; status: string }> {
    const { accountId, key } = config();
    const req = await requestBy("paypal_authorization_id", authorizationId);
    const payee = (req.merchant_handle ?? "").trim().toLowerCase();
    if (!isNearAccountId(payee)) throw new PaypalError("api", `"${payee}" is not a NEAR account.`);
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
