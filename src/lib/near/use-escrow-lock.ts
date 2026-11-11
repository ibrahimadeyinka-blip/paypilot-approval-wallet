import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";
import { getEscrowLock, submitEscrowDeposit } from "@/lib/agent/approvals.functions";
import { useNearWallet } from "./wallet";

export interface LockResult {
  status: string;
  message: string;
}

/** Locks an escrow order with a deposit from the owner's connected NEAR wallet. */
export function useEscrowLock() {
  const wallet = useNearWallet();
  const getLock = useServerFn(getEscrowLock);
  const submit = useServerFn(submitEscrowDeposit);

  const lock = useCallback(
    async (orderId: string): Promise<LockResult> => {
      if (!wallet.accountId) {
        wallet.connect();
        return { status: "needs_wallet", message: "Connect your NEAR testnet wallet, then press Lock again." };
      }
      const details = await getLock({ data: { orderId } });
      if (!details.found) return { status: "not_found", message: "We couldn't find that escrow order." };
      if (!details.escrowAccountId) return { status: "authorization_failed", message: "The Vigil escrow account isn't set up yet. Check Setup." };
      if (details.fundingTxHash) return submit({ data: { orderId, txHash: details.fundingTxHash, funder: details.funder ?? wallet.accountId } });
      let txHash: string;
      try {
        txHash = await wallet.sendDeposit(details.escrowAccountId, details.depositYocto);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        return { status: "cancelled", message: msg && !/reject|cancel|closed|denied/i.test(msg) ? msg : "Deposit cancelled — nothing was sent." };
      }
      return submit({ data: { orderId, txHash, funder: wallet.accountId } });
    },
    [wallet, getLock, submit],
  );

  return { lock, accountId: wallet.accountId, ready: wallet.ready };
}
