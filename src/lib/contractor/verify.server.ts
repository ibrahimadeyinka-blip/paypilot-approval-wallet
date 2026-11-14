import { PublicKey } from "@near-js/crypto";
import { NEAR_RPC_URL } from "@/lib/near/units";
import { base64ToBytes, nep413Bytes } from "./link-message";

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

/** Checks a NEP-413 signature. Wallets differ on whether callbackUrl is signed, so both forms are tried. */
export async function verifyNep413(input: {
  message: string; nonce: Uint8Array; recipient: string; callbackUrl: string | null; publicKey: string; signature: string;
}): Promise<boolean> {
  let key: PublicKey;
  let sig: Uint8Array;
  try {
    key = PublicKey.fromString(input.publicKey);
    sig = base64ToBytes(input.signature);
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  const variants = input.callbackUrl ? [null, input.callbackUrl] : [null];
  for (const callbackUrl of variants) {
    const hash = await sha256(nep413Bytes({ message: input.message, nonce: input.nonce, recipient: input.recipient, callbackUrl }));
    try {
      if (key.verify(hash, sig)) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/** True when the key is a full-access key of the account on NEAR testnet (i.e. it can move the account's funds). */
export async function isFullAccessKey(accountId: string, publicKey: string): Promise<boolean> {
  const res = await fetch(NEAR_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "vigil", method: "query", params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey } }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { result?: { permission?: unknown }; error?: unknown } | null;
  return body?.result?.permission === "FullAccess";
}
