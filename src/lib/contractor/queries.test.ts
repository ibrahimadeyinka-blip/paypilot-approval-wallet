import { describe, expect, it } from "vitest";
import { contractorTotals } from "./queries";

describe("contractorTotals", () => {
  it("counts held funds separately from confirmed payouts", () => {
    const t = contractorTotals([
      { status: "authorized", amount_cents: 500, payout_tx: null },
      { status: "captured", amount_cents: 300, payout_tx: "abc" },
      { status: "voided", amount_cents: 900, payout_tx: null },
    ]);
    expect(t).toEqual({ held: 500, paid: 300, payouts: 1 });
  });
  it("does not count a payout without an on-chain transaction", () => {
    expect(contractorTotals([{ status: "captured", amount_cents: 300, payout_tx: null }]).paid).toBe(0);
  });
});
