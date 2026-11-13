import { PublicFrame } from "@/components/public-frame";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completePaypalReturn } from "@/lib/agent/approvals.functions";
import { track } from "@/lib/analytics";

const searchSchema = z.object({
  token: z.string().optional(),
  cancelled: z.union([z.string(), z.number()]).optional(),
});

export const Route = createFileRoute("/escrow/confirm")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Confirming your NEAR escrow lock — Vigil" },
      { name: "description", content: "Vigil is confirming the NEAR testnet escrow lock you approved." },
      { property: "og:title", content: "Confirming your NEAR escrow lock — Vigil" },
      { property: "og:description", content: "Confirming a NEAR testnet escrow lock." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EscrowConfirm,
});

function EscrowConfirm() {
  const { token, cancelled } = Route.useSearch();
  const complete = useServerFn(completePaypalReturn);
  const started = useRef(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setResult({ status: "not_found", message: "This link is missing its escrow reference." });
      return;
    }
    complete({ data: { orderId: token, cancelled: cancelled !== undefined } })
      .then((r) => { if (r.status === "authorized") track("project.agent_request_approved", {}); setResult(r); })
      .catch(() => setResult({ status: "error", message: "We couldn't confirm the escrow on NEAR testnet. Go back to Approvals and press \"check now\"." }));
  }, [token, cancelled, complete]);

  const ok = result?.status === "authorized";
  const waiting = result === null;
  const needsDeposit = result?.status === "authorizing";

  return (
    <PublicFrame>
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          {waiting ? (
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          ) : ok ? (
            <CheckCircle2 className="size-8 text-primary" />
          ) : (
            <XCircle className="size-8 text-destructive" />
          )}
        </div>
        <h1 className="text-2xl font-semibold">
          {waiting ? "Confirming on NEAR testnet…" : ok ? "NEAR locked in escrow" : needsDeposit ? "Waiting for your wallet deposit" : "No hold placed"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {needsDeposit
            ? "Open Approvals, connect your NEAR testnet wallet and press Lock from wallet. Nothing is held until your deposit is confirmed on-chain."
            : (result?.message ?? "This takes a few seconds.")}
        </p>
        {!waiting && (
          <div className="flex flex-col items-center gap-2">
            <Button asChild>
              <Link to="/approvals">Back to Approvals</Link>
            </Button>
            <p className="text-xs text-muted-foreground">If you came from another tab, you can close this one.</p>
          </div>
        )}
      </div>
    </PublicFrame>
  );
}
