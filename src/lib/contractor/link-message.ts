/**
 * Browser-safe helpers for linking a contractor's NEAR testnet payout account.
 * The wallet signs a NEP-413 message naming the Vigil user; the server rebuilds the
 * exact signed bytes, checks the signature and that the key is a full-access key.
 */
export const LINK_RECIPIENT = "vigil.contractor";
export const LINK_MAX_AGE_MS = 10 * 60 * 1000;
const NEP413_TAG = 2 ** 31 + 413;

export function linkMessage(accountId: string, userId: string, issuedAt: string): string {
  return `Link ${accountId} as my Vigil contractor payout account.\nVigil user: ${userId}\nIssued: ${issuedAt}`;
}

export function parseLinkMessage(message: string): { accountId: string; userId: string; issuedAt: string } | null {
  const m = /^Link ([a-z0-9._-]{2,64}) as my Vigil contractor payout account\.\nVigil user: ([0-9a-f-]{36})\nIssued: (\S+)$/.exec(message);
  if (!m) return null;
  return { accountId: m[1] as string, userId: m[2] as string, issuedAt: m[3] as string };
}

/** Signed within the last 10 minutes (and not from the future). */
export function isFreshLink(issuedAt: string, now = Date.now()): boolean {
  const t = Date.parse(issuedAt);
  return Number.isFinite(t) && t <= now + 60_000 && now - t <= LINK_MAX_AGE_MS;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function borshString(s: string): Uint8Array {
  const bytes = new TextEncoder().encode(s);
  return concat(u32(bytes.length), bytes);
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** NEP-413 bytes to hash: u32 tag (2^31+413) + borsh { message, nonce[32], recipient, callbackUrl: Option<string> }. */
export function nep413Bytes(input: { message: string; nonce: Uint8Array; recipient: string; callbackUrl: string | null }): Uint8Array {
  if (input.nonce.length !== 32) throw new Error("Nonce must be 32 bytes.");
  const cb = input.callbackUrl === null ? new Uint8Array([0]) : concat(new Uint8Array([1]), borshString(input.callbackUrl));
  return concat(u32(NEP413_TAG), borshString(input.message), input.nonce, borshString(input.recipient), cb);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
