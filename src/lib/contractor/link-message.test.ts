import { describe, expect, it } from "vitest";
import { KeyPair } from "@near-js/crypto";
import { bytesToBase64, isFreshLink, linkMessage, nep413Bytes, parseLinkMessage, LINK_RECIPIENT } from "./link-message";
import { verifyNep413 } from "./verify.server";

const user = "11111111-2222-3333-4444-555555555555";
const issued = "2026-11-14T02:00:00.000Z";

async function sign(kp: KeyPair, message: string, nonce: Uint8Array, callbackUrl: string | null) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", nep413Bytes({ message, nonce, recipient: LINK_RECIPIENT, callbackUrl }) as BufferSource));
  return bytesToBase64(kp.sign(hash).signature);
}

describe("contractor link message", () => {
  it("round-trips the account, user and time", () => {
    expect(parseLinkMessage(linkMessage("alex.testnet", user, issued))).toEqual({ accountId: "alex.testnet", userId: user, issuedAt: issued });
  });
  it("rejects edited messages", () => {
    expect(parseLinkMessage(linkMessage("alex.testnet", user, issued) + " extra")).toBeNull();
  });
  it("only accepts signatures from the last 10 minutes", () => {
    const now = Date.parse(issued);
    expect(isFreshLink(issued, now + 9 * 60_000)).toBe(true);
    expect(isFreshLink(issued, now + 11 * 60_000)).toBe(false);
    expect(isFreshLink(issued, now - 5 * 60_000)).toBe(false);
  });
});

describe("NEP-413 verification", () => {
  const kp = KeyPair.fromRandom("ed25519");
  const nonce = new Uint8Array(32).fill(7);
  const message = linkMessage("alex.testnet", user, issued);

  it("accepts a signature from the wallet's key", async () => {
    const signature = await sign(kp, message, nonce, null);
    expect(await verifyNep413({ message, nonce, recipient: LINK_RECIPIENT, callbackUrl: null, publicKey: kp.getPublicKey().toString(), signature })).toBe(true);
  });
  it("accepts wallets that also sign the callback URL", async () => {
    const cb = "https://example.com/contractor";
    const signature = await sign(kp, message, nonce, cb);
    expect(await verifyNep413({ message, nonce, recipient: LINK_RECIPIENT, callbackUrl: cb, publicKey: kp.getPublicKey().toString(), signature })).toBe(true);
  });
  it("rejects a signature for a different user or a different key", async () => {
    const signature = await sign(kp, message, nonce, null);
    const other = linkMessage("alex.testnet", "99999999-2222-3333-4444-555555555555", issued);
    expect(await verifyNep413({ message: other, nonce, recipient: LINK_RECIPIENT, callbackUrl: null, publicKey: kp.getPublicKey().toString(), signature })).toBe(false);
    const stranger = KeyPair.fromRandom("ed25519").getPublicKey().toString();
    expect(await verifyNep413({ message, nonce, recipient: LINK_RECIPIENT, callbackUrl: null, publicKey: stranger, signature })).toBe(false);
  });
});
