import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { agentTokensQuery } from "@/lib/agent/tokens";
import { draftDirective, submitDirective } from "@/lib/agent/directive.functions";
import type { DirectiveDraft } from "@/lib/agent/directive";

export const Route = createFileRoute("/_authenticated/agent")({
  head: () => ({
    meta: [
      { title: "Agent Chat — Payrail" },
      { name: "description", content: "Tell your agent what to buy; it drafts a guarded payment request for your approval." },
      { property: "og:title", content: "Agent Chat — Payrail" },
      { property: "og:description", content: "Give your purchasing agent a directive and budget." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentTokensQuery),
  component: AgentChat,
});

type Msg = { role: "user" | "assistant"; content: string; draft?: DirectiveDraft | undefined };
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const EXAMPLE = "Find a contractor to design a minimalist blue tech logo. Budget is $100. Put the funds in escrow.";

function AgentChat() {
  const { data: tokens } = useSuspenseQuery(agentTokensQuery);
  const active = tokens.filter((t) => !t.revoked && new Date(t.expires_at) > new Date());
  const [tokenId, setTokenId] = useState(active[0]?.id ?? "");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const draft = useServerFn(draftDirective);
  const submit = useServerFn(submitDirective);
  const qc = useQueryClient();
  const token = active.find((t) => t.id === tokenId);

  async function send() {
    const text = input.trim();
    if (!text || !tokenId) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const d = await draft({ data: { tokenId, messages: next.map(({ role, content }) => ({ role, content })) } });
      setMsgs([...next, { role: "assistant", content: d.ready ? `I'll hire ${d.vendor_name} for ${money(d.amount_cents)}. Confirm to send it for your approval.` : d.question, draft: d.ready ? d : undefined }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  async function confirm(i: number, d: DirectiveDraft) {
    setBusy(true);
    try {
      const directive = msgs.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      const r = await submit({ data: { tokenId, directive, ...d } });
      setSent(i);
      qc.invalidateQueries({ queryKey: ["agent_payment_requests"] });
      setMsgs((m) => [...m, { role: "assistant", content: r.status === "blocked" ? `Blocked by your safeguards: ${r.reason ?? "limit reached"}. No money moved.` : "Sent. It's waiting in Approvals — approve it to place the PayPal hold." }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    } finally { setBusy(false); }
  }

  return (
    <main className="app-main mx-auto max-w-3xl px-5 py-10 lg:px-9">
      <div className="eyebrow">Step 2 · Directive</div>
      <h1 className="page-heading mt-3">Agent Chat</h1>
      <p className="mt-2 text-sm text-muted-foreground">Tell your agent what to buy. It drafts a request inside your token's limits; nothing is held until you approve.</p>

      {active.length === 0 ? (
        <div className="empty-state mt-8">No active token yet. <Link to="/wallet" className="text-primary underline">Create one in Agent Wallet</Link> first.</div>
      ) : (
        <>
          <label className="mt-6 block text-xs font-medium text-muted-foreground">Agent token
            <select value={tokenId} onChange={(e) => { setTokenId(e.target.value); setMsgs([]); setSent(null); }} className="mt-1 block w-full rounded-md border bg-card px-3 py-2 text-sm text-foreground">
              {active.map((t) => <option key={t.id} value={t.id}>{t.label} — cap {money(t.single_cap_cents)}, 24h {money(t.daily_cap_cents)}</option>)}
            </select>
          </label>
          {token && <p className="mt-1 font-mono text-[11px] text-muted-foreground">Allowed: {token.merchant_whitelist.length ? token.merchant_whitelist.join(", ") : "any merchant"} · expires {new Date(token.expires_at).toLocaleDateString()}</p>}

          <div className="mt-6 space-y-4 rounded-lg border bg-card p-4">
            {msgs.length === 0 && <button type="button" onClick={() => setInput(EXAMPLE)} className="text-left text-sm text-muted-foreground hover:text-foreground">Try: “{EXAMPLE}”</button>}
            {msgs.map((m, i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">{m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.draft && (
                    <div className="mt-3 rounded-md border bg-background p-3 text-xs">
                      <dl className="grid grid-cols-[110px_1fr] gap-y-1">
                        <dt className="text-muted-foreground">Contractor</dt><dd>{m.draft.vendor_name} <span className="font-mono">@{m.draft.merchant_handle}</span></dd>
                        <dt className="text-muted-foreground">Amount</dt><dd className="font-semibold">{money(m.draft.amount_cents)} USD</dd>
                        <dt className="text-muted-foreground">Work</dt><dd>{m.draft.description}</dd>
                        {m.draft.delivery_requirements && <><dt className="text-muted-foreground">Must deliver</dt><dd>{m.draft.delivery_requirements}</dd></>}
                      </dl>
                      <Button size="sm" className="mt-3" disabled={busy || sent !== null} onClick={() => confirm(i, m.draft!)}>{sent === i ? "Sent" : "Send for approval"}</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="What should your agent buy?" rows={2} maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <Button type="submit" disabled={busy || !input.trim()} aria-label="Send"><Send className="size-4" /></Button>
          </form>
        </>
      )}
    </main>
  );
}
