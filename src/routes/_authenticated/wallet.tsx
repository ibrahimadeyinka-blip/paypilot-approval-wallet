import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Ban, Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  agentRequestsQuery,
  agentTokensQuery,
  issueAgentToken,
  parseMerchantList,
  revokeAgentToken,
  TOKEN_LIFETIMES,
} from "@/lib/agent/tokens";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "Agent Wallet — Payrail" },
      { name: "description", content: "Issue and revoke limited payment tokens for your AI agents." },
      { property: "og:title", content: "Agent Wallet — Payrail" },
      { property: "og:description", content: "Issue and revoke limited payment tokens for your AI agents." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(agentTokensQuery),
      context.queryClient.ensureQueryData(agentRequestsQuery),
    ]),
  component: Wallet,
});

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

function Wallet() {
  const qc = useQueryClient();
  const { data: tokens } = useSuspenseQuery(agentTokensQuery);
  const { data: requests } = useSuspenseQuery(agentRequestsQuery);
  const [label, setLabel] = useState("");
  const [lifetime, setLifetime] = useState(7);
  const [merchants, setMerchants] = useState("");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function issue(e: FormEvent) {
    e.preventDefault();
    const list = parseMerchantList(merchants);
    if (list.length === 0) return toast.error("Add at least one approved merchant.");
    setBusy(true);
    try {
      const { secret } = await issueAgentToken(label.trim(), lifetime, list);
      setSecret(secret);
      setLabel("");
      setMerchants("");
      qc.invalidateQueries({ queryKey: agentTokensQuery.queryKey });
    } catch {
      toast.error("Could not issue the token. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await revokeAgentToken(id);
      qc.invalidateQueries({ queryKey: agentTokensQuery.queryKey });
      toast.success("Token revoked. It stops working immediately.");
    } catch {
      toast.error("Could not revoke that token.");
    }
  }

  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/public/agent-gateway` : "/api/public/agent-gateway";
  const now = Date.now();

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Wallet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give an agent a time-limited token. Every payment it asks for is checked on our server: $100 per
          payment, $500 per rolling 24 hours, and only merchants you list.
        </p>
      </div>

      {secret && (
        <div className="space-y-3 rounded-xl border border-primary/40 bg-accent p-5">
          <div className="flex items-center gap-2 font-medium text-accent-foreground">
            <ShieldCheck className="size-4" /> Copy this token now — it won't be shown again.
          </div>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded-md bg-card px-3 py-2 font-mono text-sm">{secret}</code>
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>I've saved it</Button>
        </div>
      )}

      <form onSubmit={issue} className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-[1fr_auto_1.4fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="label">Agent name</Label>
          <Input id="label" placeholder="Research assistant" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label>Expires in</Label>
          <div className="flex gap-1">
            {TOKEN_LIFETIMES.map((l) => (
              <Button key={l.days} type="button" size="sm" variant={lifetime === l.days ? "default" : "outline"} onClick={() => setLifetime(l.days)}>
                {l.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="merchants">Approved merchants (comma separated)</Label>
          <Input id="merchants" placeholder="figma.com, upwork.com" value={merchants} onChange={(e) => setMerchants(e.target.value)} required />
        </div>
        <Button type="submit" disabled={busy}>
          <KeyRound className="size-4" /> Issue token
        </Button>
      </form>

      <section className="space-y-3">
        <h2 className="font-semibold">Your tokens</h2>
        {tokens.length === 0 && <p className="text-sm text-muted-foreground">No tokens yet.</p>}
        <ul className="divide-y rounded-xl border bg-card">
          {tokens.map((t) => {
            const expired = new Date(t.expires_at).getTime() <= now;
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {t.label}
                    {t.revoked ? <Badge variant="destructive">Revoked</Badge> : expired ? <Badge variant="secondary">Expired</Badge> : <Badge>Active</Badge>}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {t.token_prefix}… · expires {new Date(t.expires_at).toLocaleString()} · {t.merchant_whitelist.join(", ") || "no merchants"}
                  </div>
                </div>
                {!t.revoked && !expired && (
                  <Button variant="outline" size="sm" onClick={() => revoke(t.id)}>
                    <Ban className="size-4" /> Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Recent agent requests</h2>
        {requests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
        <ul className="divide-y rounded-xl border bg-card">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div>
                <span className="font-medium">{r.vendor_name}</span>{" "}
                <span className="text-muted-foreground">({r.merchant_handle})</span>
                {r.block_reason && <div className="text-destructive">{r.block_reason}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono">{usd(r.amount_cents)}</span>
                <Badge variant={r.status === "blocked" ? "destructive" : "secondary"}>{r.status.replace("_", " ")}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Connect your agent</h2>
        <pre className="overflow-x-auto rounded-xl border bg-card p-4 font-mono text-xs leading-relaxed">{`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer apt_..." \\
  -H "Idempotency-Key: order-1234" \\
  -H "Content-Type: application/json" \\
  -d '{"vendor_name":"Figma","merchant_handle":"figma.com","amount_cents":1500,
       "currency":"USD","description":"Pro seat for May",
       "source_context":"Invoice #881: Figma Pro, 1 seat, $15.00"}'`}</pre>
        <p className="text-xs text-muted-foreground">
          Retrying with the same Idempotency-Key returns the original result instead of creating a duplicate.
        </p>
      </section>
    </main>
  );
}
