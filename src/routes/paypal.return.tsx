import { PublicFrame } from "@/components/public-frame";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completePaypalReturn } from "@/lib/agent/approvals.functions";

const searchSchema = z.object({
  token: z.string().optional(),
  cancelled: z.union([z.string(), z.number()]).optional(),
});

export const Route = createFileRoute("/paypal/return")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Confirming your PayPal hold — Payrail" },
      { name: "description", content: "Payrail is confirming the PayPal Sandbox authorization hold you approved." },
      { property: "og:title", content: "Confirming your PayPal hold — Payrail" },
      { property: "og:description", content: "Confirming a PayPal Sandbox authorization hold." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaypalReturn,
});

function PaypalReturn() {
  const { token, cancelled } = Route.useSearch();
  const complete = useServerFn(completePaypalReturn);
  const started = useRef(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setResult({ status: "not_found", message: "PayPal didn't send back an order reference." });
      return;
    }
    complete({ data: { orderId: token, cancelled: cancelled !== undefined } })
      .then(setResult)
      .catch(() => setResult({ status: "error", message: "We couldn't confirm with PayPal. Go back to Approvals and press \"check now\"." }));
  }, [token, cancelled, complete]);

  const ok = result?.status === "authorized";
  const waiting = result === null;

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
          {waiting ? "Confirming with PayPal…" : ok ? "Funds are on hold" : "No hold placed"}
        </h1>
        <p className="text-sm text-muted-foreground">{result?.message ?? "This takes a few seconds."}</p>
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
