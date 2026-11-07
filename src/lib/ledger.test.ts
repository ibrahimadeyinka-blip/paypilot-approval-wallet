import { describe, expect, it } from "vitest";
import { csvCell, ledgerTotals } from "./ledger";

describe("ledger accounting", () => {
  it("does not count a $100 authorization hold as paid", () => {
    expect(ledgerTotals([{ amount_cents: 10000, status: "authorized", paypal_capture_status: null }])).toEqual({ held: 10000, paid: 0, released: 0, unconfirmed: 0 });
  });
  it("does not count a pending $25 capture as confirmed payment", () => {
    expect(ledgerTotals([{ amount_cents: 2500, status: "captured", paypal_capture_status: "PENDING" }])).toEqual({ held: 0, paid: 0, released: 0, unconfirmed: 2500 });
  });
  it("separates a confirmed $25 capture from a released $10 hold", () => {
    expect(ledgerTotals([{ amount_cents: 2500, status: "captured", paypal_capture_status: "COMPLETED" }, { amount_cents: 1000, status: "voided", paypal_capture_status: null }])).toEqual({ held: 0, paid: 2500, released: 1000, unconfirmed: 0 });
  });
  it("neutralizes spreadsheet formulas on export", () => {
    expect(csvCell(' =HYPERLINK("x")')).toBe('"\' =HYPERLINK(""x"")"');
    expect(csvCell("normal, value")).toBe('"normal, value"');
  });
});