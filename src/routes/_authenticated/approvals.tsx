import { formatNear, accountUrl } from "@/lib/near/units";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Quote, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { approvalGroup } from "@/lib/agent/classification";
import { approvalsQuery } from "@/lib/agent/tokens";
import { HAS_DELIVERY, NEEDS_ACTION, statusMeta } from "@/lib/agent/status";
import { DeliveryPanel } from "@/components/delivery-panel";
import { approveAgentRequest, confirmAgentAuthorization, declineAgentRequest } from "@/lib/agent/approvals.functions";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Approvals — Vigil" },
      { name: "description", content: "Review what your agents want to pay for, with their quoted evidence, before any funds are held." },
      { property: "og:title", content: "Approvals — Vigil" },
      { property: "og:description", content: "Review agent payment requests and lock NEAR testnet escrow." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(approvalsQuery),
  component: Approvals,
});

type Req = ReturnType<typeof useApprovals>[number];
function useApprovals() {
  return useSuspenseQuery(approvalsQuery).data;
}

const usd = (c: number, _cur: string) => formatNear(c);
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

function Approvals() {
  const requests = useApprovals();
  const groups = [
    { key: "new", label: "New", heading: "Awaiting approval", empty: "You’re all caught up." },
    { key: "successful", label: "Successful", heading: "Funds on hold & paid requests", empty: "No successful requests yet." },
    { key: "unsuccessful", label: "Unsuccessful", heading: "Blocked, declined, failed & released requests", empty: "No unsuccessful requests." },
  ] as const;

  return (
    <main className="app-main space-y-9">
      <div>
        <span className="eyebrow">HUMAN IN THE LOOP</span><h1 className="page-heading mt-3">Approvals</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Nothing is paid until you approve. Approving locks the amount in the <strong>NEAR testnet escrow</strong> — the
          NEAR is reserved, not sent. It's released on-chain to the contractor only after the delivery is reviewed.
        </p>
      </div>

      <Tabs defaultValue="new" className="space-y-6">
        <TabsList aria-label="Approval categories" className="grid h-auto w-full grid-cols-3 rounded-md sm:max-w-lg">
          {groups.map((group) => (
            <TabsTrigger key={group.key} value={group.key} className="min-w-0 flex-wrap gap-1.5 px-1.5 py-2 text-xs sm:text-sm">
              {group.label}<span className="font-mono text-xs tabular-nums">{requests.filter((r) => approvalGroup(r.status) === group.key).length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {groups.map((group) => {
          const matching = requests.filter((r) => approvalGroup(r.status) === group.key);
          return (
            <TabsContent key={group.key} value={group.key} className="space-y-3">
              <h2 className="section-heading">{group.heading} ({matching.length})</h2>
              {matching.length === 0 && <div className="empty-state"><ShieldCheck className="size-6 text-primary" /><p>{group.empty}</p></div>}
              {matching.map((r) => <RequestCard key={r.id} r={r} />)}
            </TabsContent>
          );
        })}
      </Tabs>
    </main>
  );
}

function RequestCard({ r }: { r: Req }) {
  const qc = useQueryClient();
  const approve = useServerFn(approveAgentRequest);
  const confirm = useServerFn(confirmAgentAuthorization);
  const decline = useServerFn(declineAgentRequest);
  const [busy, setBusy] = useState<null | "approve" | "confirm" | "decline">(null);
  const meta = statusMeta(r.status);
  const refresh = () => qc.invalidateQueries({ queryKey: ["agent_payment_requests"] });

  function report(res: { status: string; message: string }) {
    if (res.status === "authorized") toast.success(res.message);
    else if (["blocked", "authorization_failed", "not_found"].includes(res.status)) toast.error(res.message);
    else toast(res.message);
  }

  async function onApprove() {
    setBusy("approve");
    try {
      const res = await approve({ data: { requestId: r.id, origin: window.location.origin } });
      // Escrow lock is confirmed in-app: verify the escrow balance on NEAR testnet right away.
      report(res.approveUrl ? await confirm({ data: { requestId: r.id } }) : res);
    } catch {
      toast.error("Could not lock the escrow. Please try again.");
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function onConfirm() {
    setBusy("confirm");
    try {
      report(await confirm({ data: { requestId: r.id } }));
    } catch {
      toast.error("Could not check NEAR testnet. Please try again.");
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function onDecline() {
    setBusy("decline");
    try {
      const res = await decline({ data: { requestId: r.id } });
      if (res.status === "declined") toast.success("Request declined. No funds were held.");
      else toast(`This request is already ${statusMeta(res.status).label.toLowerCase()}.`);
    } catch {
      toast.error("Could not decline that request.");
    } finally {
      setBusy(null);
      refresh();
    }
  }

  return (
    <article className="overflow-hidden rounded-md border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="section-heading">{r.vendor_name}</h3>
            <span className="font-mono text-xs text-muted-foreground">{r.merchant_handle}</span>
            <Badge variant={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Requested by {r.agent_tokens?.label ?? "an agent"} · {when(r.created_at)}
          </p>
        </div>
        <div className="font-mono text-2xl font-semibold tabular-nums">{usd(r.amount_cents, r.currency)}</div>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Purpose</div>
          <p className="mt-1 text-sm">{r.description}</p>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Quote className="size-3.5" /> Evidence the agent quoted
            </div>
            <span className="text-xs text-muted-foreground">Provided by the agent — not verified</span>
          </div>
          <blockquote className="mt-1.5 whitespace-pre-wrap break-words rounded-md border-l-4 border-primary bg-muted px-4 py-3 font-mono text-sm leading-relaxed">
            {r.source_context || "(no evidence provided)"}
          </blockquote>
        </div>

        {r.status === "blocked" && r.block_reason && (
          <Notice tone="destructive" title="Blocked by a safeguard">{r.block_reason}</Notice>
        )}
        {r.status === "authorization_failed" && (
          <Notice tone="destructive" title="The hold wasn't placed — no funds are held">
            {r.authorization_error ?? "The NEAR escrow lock did not complete."}
          </Notice>
        )}
        {r.status === "authorizing" && (
          <Notice tone="info" title="Escrow lock in progress">
            {r.paypal_approve_url
              ? "Vigil is confirming the escrow balance on NEAR testnet. Checking again is always safe."
              : "The escrow lock hasn't started yet. Press Approve again — it won't create a second payment."}
          </Notice>
        )}
        {r.paypal_authorization_id && (
          <p className="text-xs text-muted-foreground">
            NEAR escrow hold <span className="font-mono">{r.paypal_authorization_id}</span> · payee{" "}
            <a className="font-mono underline" href={accountUrl(r.merchant_handle)} target="_blank" rel="noopener noreferrer">{r.merchant_handle}</a>
            {r.paypal_authorization_expires_at ? ` · hold expires ${when(r.paypal_authorization_expires_at)}` : ""}
          </p>
        )}
        {HAS_DELIVERY.has(r.status) && <DeliveryPanel r={r} />}
        {r.decided_at && r.status !== "blocked" && !HAS_DELIVERY.has(r.status) && (
          <p className="text-xs text-muted-foreground">
            {r.approved_at ? `You approved on ${when(r.approved_at)}` : `Decided on ${when(r.decided_at)}`}
          </p>
        )}
      </div>

      {NEEDS_ACTION.has(r.status) && (
        <footer className="flex flex-wrap gap-2 border-t bg-muted/40 px-5 py-3">
          {r.status === "authorizing" && r.paypal_approve_url ? (
            <>
              <Button onClick={onConfirm} disabled={busy !== null}>
                <RefreshCw className="size-4" /> Confirm escrow lock
              </Button>
            </>
          ) : (
            <Button onClick={onApprove} disabled={busy !== null}>
              <ShieldCheck className="size-4" />
              {r.status === "pending_approval" ? "Approve & lock in escrow" : "Try again"}
            </Button>
          )}
          <Button variant="ghost" onClick={onDecline} disabled={busy !== null}>
            <X className="size-4" /> Decline
          </Button>
        </footer>
      )}
    </article>
  );
}

function Notice({ tone, title, children }: { tone: "destructive" | "info" | "success"; title: string; children: React.ReactNode }) {
  const cls =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "success"
        ? "border-primary/40 bg-accent text-accent-foreground"
        : "border-border bg-muted text-foreground";
  return (
    <div className={`flex gap-2 rounded-md border px-3 py-2.5 text-sm ${cls}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 break-words opacity-90">{children}</div>
      </div>
    </div>
  );
}
