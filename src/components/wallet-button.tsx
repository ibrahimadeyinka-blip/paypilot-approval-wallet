import { Wallet, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNearWallet } from "@/lib/near/wallet";
import { accountUrl } from "@/lib/near/units";

/** Connect / show the owner's personal NEAR testnet wallet. */
export function WalletButton() {
  const { ready, accountId, connect, disconnect } = useNearWallet();
  if (!ready) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="size-4 animate-spin" />
        <span className="hidden sm:inline">Wallet</span>
      </Button>
    );
  }
  if (!accountId) {
    return (
      <Button variant="outline" size="sm" onClick={connect}>
        <Wallet className="size-4" /> Connect NEAR wallet
      </Button>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 pl-2.5">
      <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
      <a
        href={accountUrl(accountId)}
        target="_blank"
        rel="noopener noreferrer"
        className="max-w-36 truncate font-mono text-xs text-foreground hover:underline sm:max-w-48"
        title={accountId}
      >
        {accountId}
      </a>
      <Button variant="ghost" size="sm" onClick={() => void disconnect()} aria-label="Disconnect NEAR wallet">
        <LogOut className="size-3.5" />
      </Button>
    </div>
  );
}
