/**
 * Personal NEAR testnet wallet connection (MyNearWallet, Meteor, HERE) via NEAR Wallet Selector.
 * Wallet code is browser-only, so it is imported lazily after hydration and never during SSR.
 * The wallet only ever signs deposits the owner explicitly confirms; Vigil never sees keys.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";

interface NearWallet {
  ready: boolean;
  accountId: string | null;
  connect: () => void;
  disconnect: () => Promise<void>;
  /** Asks the wallet to send an exact yocto amount; resolves with the transaction hash. */
  sendDeposit: (receiverId: string, yocto: string) => Promise<string>;
}

const WalletContext = createContext<NearWallet | null>(null);

async function loadSelector() {
  const { Buffer } = await import("buffer");
  const g = globalThis as unknown as { Buffer?: typeof Buffer };
  g.Buffer ??= Buffer;
  const [{ setupWalletSelector }, { setupModal }, { setupMyNearWallet }, { setupMeteorWallet }, { setupHereWallet }] =
    await Promise.all([
      import("@near-wallet-selector/core"),
      import("@near-wallet-selector/modal-ui"),
      import("@near-wallet-selector/my-near-wallet"),
      import("@near-wallet-selector/meteor-wallet"),
      import("@near-wallet-selector/here-wallet"),
      import("@near-wallet-selector/modal-ui/styles.css"),
    ]);
  const selector = await setupWalletSelector({
    network: "testnet",
    modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()],
  });
  const modal = setupModal(selector, {
    theme: "dark",
    description: "Connect the NEAR testnet wallet that funds your agents' escrow. Vigil never sees your keys.",
  });
  return { selector, modal };
}

export function NearWalletProvider({ children }: { children: ReactNode }) {
  const ref = useRef<{ selector: WalletSelector; modal: WalletSelectorModal } | null>(null);
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    loadSelector()
      .then((loaded) => {
        if (cancelled) return;
        ref.current = loaded;
        const sub = loaded.selector.store.observable.subscribe((state) => {
          const active = state.accounts.find((a) => a.active) ?? state.accounts[0];
          setAccountId(active?.accountId ?? null);
        });
        unsubscribe = () => sub.unsubscribe();
        setReady(true);
      })
      .catch((err) => console.error("NEAR wallet selector failed to load", err));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const connect = useCallback(() => ref.current?.modal.show(), []);

  const disconnect = useCallback(async () => {
    const s = ref.current?.selector;
    if (!s?.isSignedIn()) return;
    const wallet = await s.wallet();
    await wallet.signOut();
  }, []);

  const sendDeposit = useCallback(async (receiverId: string, yocto: string) => {
    const s = ref.current?.selector;
    if (!s?.isSignedIn()) throw new Error("Connect your NEAR wallet first.");
    const { actionCreators } = await import("@near-wallet-selector/core");
    const wallet = await s.wallet();
    const outcome = (await wallet.signAndSendTransaction({
      receiverId,
      actions: [actionCreators.transfer(BigInt(yocto))],
    })) as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | void;
    const hash = outcome ? (outcome.transaction?.hash ?? outcome.transaction_outcome?.id) : undefined;
    if (!hash) throw new Error("The wallet didn't return a transaction. Check your wallet's activity, then press Check again.");
    return hash;
  }, []);

  return (
    <WalletContext.Provider value={{ ready, accountId, connect, disconnect, sendDeposit }}>{children}</WalletContext.Provider>
  );
}

export function useNearWallet(): NearWallet {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useNearWallet must be used inside NearWalletProvider");
  return ctx;
}
