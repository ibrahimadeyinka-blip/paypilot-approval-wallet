import { formatNear } from "@/lib/near/units";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Ban, Check, Copy, KeyRound, ShieldCheck, ArrowUpRight, Activity, ScanEye, LockKeyhole, MessageSquare, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { tokenGroup } from "@/lib/agent/classification";
import {
  agentRequestsQuery,
  agentTokensQuery,
  issueAgentToken,
  parseMerchantList,
  dollarsToCents,
  validateCaps,
  revokeAgentToken,
  TOKEN_LIFETIMES,
} from "@/lib/agent/tokens";
import { statusMeta } from "@/lib/agent/status";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

const usd = (c: number) => formatNear(c);

function Wallet() {
  const qc = useQueryClient();
  const { data: tokens } = useSuspenseQuery(agentTokensQuery);
  const { data: requests } = useSuspenseQuery(agentRequestsQuery);
  const [label, setLabel] = useState("");
  const [lifetime, setLifetime] = useState(7);
  const [merchants, setMerchants] = useState("");
  const [singleCap, setSingleCap] = useState("100");
  const [dailyCap, setDailyCap] = useState("500");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenTab, setTokenTab] = useState("active");

  async function issue(e: FormEvent) {
    e.preventDefault();
    const list = parseMerchantList(merchants);
    const single = dollarsToCents(singleCap);
    const daily = dollarsToCents(dailyCap);
    const capError = validateCaps(single, daily);
    if (capError) {
      toast.error(capError);
      return;
    }
    if (single === null || daily === null) return;
    setBusy(true);
    try {
      const { secret } = await issueAgentToken(label.trim(), lifetime, list, single, daily);
      setSecret(secret);
      setTokenTab("active");
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

  const now = Date.now();
  const activeTokens = tokens.filter((t) => !t.revoked && new Date(t.expires_at).getTime() > now);
  const stages = [
    { name: "Owner approval", icon: ShieldCheck, statuses: ["pending_approval"], description: "Every request starts with your decision." },
    { name: "NEAR escrow", icon: LockKeyhole, statuses: ["authorizing", "authorized"], description: "Authorized funds stay on hold, not paid out." },
    { name: "Delivery review", icon: ScanEye, statuses: ["capture_failed"], description: "Private delivery. AI checks the requirements." },
    { name: "Settlement", icon: CheckCircle2, statuses: ["captured", "voided"], description: "Verified work is paid; released holds aren't." },
  ];

  return (
    <main className="app-main space-y-9">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><span className="eyebrow">AGENT PAYMENT INFRASTRUCTURE</span><h1 className="page-heading mt-3">Agent Wallet</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Give your agents room to work. Keep their spending in bounds.</p></div><span className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs text-primary"><ShieldCheck className="size-4" /> Guardrails enforced</span></div>
      <div className="grid grid-cols-2 divide-x border-y bg-card py-6 md:grid-cols-4">{[["Active tokens", String(tokens.filter(t => !t.revoked && new Date(t.expires_at).getTime() > now).length)], ...(() => { const act = tokens.filter(t => !t.revoked && new Date(t.expires_at).getTime() > now); const caps = act.map(t => t.single_cap_cents); const lo = Math.min(...caps), hi = Math.max(...caps); return [["Per-payment cap", act.length === 0 ? "—" : lo === hi ? usd(hi) : `${usd(lo)}–${usd(hi)}`], ["Total 24h budget", act.length === 0 ? "—" : usd(act.reduce((s, t) => s + t.daily_cap_cents, 0))]]; })(), ["Total requests", String(requests.length)]].map(([name,value]) => <div key={name} className="px-4 py-2 sm:px-6"><p className="text-xs text-muted-foreground">{name}</p><p className="mt-3 font-display text-3xl font-semibold tabular-nums">{value}</p></div>)}</div>
      {secret && (
        <div className="space-y-3 rounded-md border border-primary/40 bg-accent p-5">
          <div className="flex items-center gap-2 font-medium text-accent-foreground">
            <ShieldCheck className="size-4" /> Copy this token now — it won't be shown again.
          </div>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded-md bg-card px-3 py-2 font-mono text-sm">{secret}</code>
            <Button
              variant="outline"
              aria-label="Copy agent token" title="Copy agent token"
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

      <section className="border-b pb-8"><div className="mb-5 flex items-center gap-2"><KeyRound className="size-4 text-primary" /><h2 className="section-heading">Issue an agent token</h2></div><form onSubmit={issue} className="grid gap-5 lg:grid-cols-[1fr_auto]">
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
          <Label htmlFor="merchants">Allowed payees <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="merchants" placeholder="designer.testnet, alex.testnet" aria-describedby="payee-help" value={merchants} onChange={(e) => setMerchants(e.target.value)} />
          <p id="payee-help" className="max-w-lg text-xs leading-relaxed text-muted-foreground">Leave blank for any contractor within your limits, subject to your approval. To restrict this token, enter exact contractor handles or emails, separated by commas—not marketplace websites. This list does not set the PayPal payment recipient.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
          <div className="space-y-1.5">
            <Label htmlFor="single-cap">Max per payment (NEAR)</Label>
            <Input id="single-cap" inputMode="decimal" placeholder="10" value={singleCap} onChange={(e) => setSingleCap(e.target.value)} required />
            <p className="text-xs text-muted-foreground">Any single request above this is blocked.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="daily-cap">Rolling 24h budget (NEAR)</Label>
            <Input id="daily-cap" inputMode="decimal" placeholder="50" value={dailyCap} onChange={(e) => setDailyCap(e.target.value)} required />
            <p className="text-xs text-muted-foreground">Total this agent can have pending or held in any 24 hours.</p>
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          <KeyRound className="size-4" /> Issue token
        </Button>
      </form></section>

      <section className="space-y-3">
        <h2 className="section-heading">Your tokens</h2>
        <Tabs value={tokenTab} onValueChange={setTokenTab} className="space-y-4">
          <TabsList aria-label="Token categories" className="grid h-auto w-full grid-cols-2 rounded-md sm:max-w-sm">
            <TabsTrigger value="active" className="gap-2 py-2">Active <span className="font-mono text-xs tabular-nums">{activeTokens.length}</span></TabsTrigger>
            <TabsTrigger value="revoked" className="gap-2 py-2">Revoked <span className="font-mono text-xs tabular-nums">{tokens.length - activeTokens.length}</span></TabsTrigger>
          </TabsList>
          {(["active", "revoked"] as const).map((group) => {
            const matching = tokens.filter((t) => tokenGroup(t, now) === group);
            return <TabsContent key={group} value={group} className="space-y-3">
              {group === "revoked" && <h3 className="text-sm text-muted-foreground">Revoked & expired tokens</h3>}
              {matching.length === 0 && <p className="empty-state"><KeyRound className="size-6 text-primary" />{group === "active" ? "No active tokens." : "No revoked or expired tokens."}</p>}
              <ul className={matching.length ? "divide-y rounded-md border bg-card" : ""}>
          {matching.map((t) => {
            const expired = new Date(t.expires_at).getTime() <= now;
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 break-words font-medium">
                    {t.label}
                    {t.revoked ? <Badge variant="destructive">Revoked</Badge> : expired ? <Badge variant="secondary">Expired</Badge> : <Badge>Active</Badge>}
                  </div>
                  <div className="break-words font-mono text-xs leading-relaxed text-muted-foreground">
                    {t.token_prefix}… · max {usd(t.single_cap_cents)}/payment · {usd(t.daily_cap_cents)}/24h · expires {new Date(t.expires_at).toLocaleString()} · {t.merchant_whitelist.join(", ") || "Any contractor · spending limits apply"}
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
            </TabsContent>;
          })}
        </Tabs>
      </section>

      <section className="space-y-3">
        <h2 className="section-heading">Recent agent requests</h2>
        {requests.length === 0 && <p className="empty-state"><Activity className="size-6 text-primary" />No requests yet.</p>}
        <ul className={requests.length ? "divide-y rounded-md border bg-card" : ""}>
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div>
                <span className="font-medium">{r.vendor_name}</span>{" "}
                <span className="text-muted-foreground">({r.merchant_handle})</span>
                {r.block_reason && <div className="text-destructive">{r.block_reason}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono">{usd(r.amount_cents)}</span>
                <Badge variant={statusMeta(r.status).tone}>{statusMeta(r.status).label}</Badge>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-6 border-t pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><span className="eyebrow">Your money, on rails</span><h2 className="mt-3 font-display text-2xl font-semibold">Agent Safety Cockpit</h2></div>
          <span className="flex items-center gap-2 text-xs text-accent-foreground"><span className="size-2 rounded-full bg-signal" />{activeTokens.length} active {activeTokens.length === 1 ? "token" : "tokens"}</span>
        </div>
        <div className="grid gap-0 border-y sm:grid-cols-2 xl:grid-cols-4">
          {stages.map(({ name, icon: Icon, statuses, description }, i) => (
            <div key={name} className="border-b px-3 py-5 last:border-b-0 sm:px-5 xl:border-b-0 xl:border-r xl:last:border-r-0">
              <div className="flex items-center justify-between"><Icon className="size-5 text-signal" /><span className="font-mono text-[10px] text-muted-foreground">0{i + 1}</span></div>
              <h3 className="mt-4 text-sm font-semibold">{name}</h3>
              <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted-foreground">{description}</p>
              {i !== 2 && <p className="mt-4 font-mono text-xs">{requests.filter((r) => statuses.includes(r.status)).length} {i === 3 ? "completed" : "requests"}</p>}
              {i === 2 && <p className="mt-4 font-mono text-xs text-muted-foreground">Review details in Approvals</p>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">{["Per-payment caps", "Rolling 24h limits", "Owner approval"].map((name) => <span key={name} className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-signal" />{name}</span>)}<span className="w-full text-[10px]">Request counts reflect the most recent {requests.length} requests.</span></div>
          <Button asChild variant="highlight"><Link to={activeTokens.length ? "/agent" : "/wallet"}><MessageSquare />{activeTokens.length ? "Open Agent Chat Room" : "Issue a token to start"}<ArrowUpRight /></Link></Button>
        </div>
      </section>
    </main>
  );
}
