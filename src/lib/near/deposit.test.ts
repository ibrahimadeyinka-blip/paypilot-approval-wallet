import { describe, expect, it } from "vitest";
import { depositMismatch, depositTagYocto, escrowDepositYocto, orderIdFromApproveUrl } from "./deposit";

const ORDER = "NEAR0123456789ABCDEF01234567";
const OTHER = "NEARFFEEDDCCBBAA998877665544";

describe("escrow deposit amount", () => {
  it("adds a tag of at most 1e9 yocto to the held amount", () => {
    const tag = depositTagYocto(ORDER);
    expect(tag >= 1n && tag <= 1_000_000_000n).toBe(true);
    expect(escrowDepositYocto(1000, ORDER)).toBe(10n * 10n ** 24n + tag);
  });
  it("gives different orders different amounts", () => {
    expect(escrowDepositYocto(500, ORDER)).not.toBe(escrowDepositYocto(500, OTHER));
  });
  it("rejects malformed order ids", () => {
    expect(() => depositTagYocto("NEAR123")).toThrow();
  });
  it("reads the order id from the confirm link", () => {
    expect(orderIdFromApproveUrl(`https://x.app/escrow/confirm?token=${ORDER}`)).toBe(ORDER);
    expect(orderIdFromApproveUrl("https://x.app/escrow/confirm?token=bad")).toBeNull();
  });
});

describe("deposit verification", () => {
  const expected = { funder: "alice.testnet", escrow: "vault.testnet", yocto: escrowDepositYocto(1000, ORDER) };
  const tx = (over: Record<string, unknown> = {}, deposit = expected.yocto.toString(), status: object = { SuccessValue: "" }) => ({
    status,
    transaction: { signer_id: "alice.testnet", receiver_id: "vault.testnet", actions: [{ Transfer: { deposit } }], ...over },
  });

  it("accepts an exact successful transfer", () => {
    expect(depositMismatch(tx(), expected)).toBeNull();
  });
  it("rejects a deposit from another wallet", () => {
    expect(depositMismatch(tx({ signer_id: "mallory.testnet" }), expected)).toMatch(/different wallet/);
  });
  it("rejects a transfer to another account", () => {
    expect(depositMismatch(tx({ receiver_id: "bob.testnet" }), expected)).toMatch(/escrow account/);
  });
  it("rejects the right NEAR amount without this order's tag", () => {
    expect(depositMismatch(tx({}, (10n * 10n ** 24n).toString()), expected)).toMatch(/exact amount/);
  });
  it("rejects a failed transaction", () => {
    expect(depositMismatch(tx({}, undefined, { Failure: {} }), expected)).toMatch(/did not succeed/);
  });
  it("rejects anything that is not a single transfer", () => {
    expect(depositMismatch(tx({ actions: [{ FunctionCall: {} }] }), expected)).toMatch(/plain NEAR transfer/);
  });
});
