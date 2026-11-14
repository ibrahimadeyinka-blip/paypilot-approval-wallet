import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, Send, User, RotateCcw, ShieldCheck, ArrowUpRight, FileCheck2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { agentTokensQuery } from "@/lib/agent/tokens";
import { draftDirective, submitDirective } from "@/lib/agent/directive.functions";
import type { DirectiveDraft } from "@/lib/agent/directive";
import { track } from "@/lib/analytics";
import { Switch } from "@/components/ui/switch";
import { canAutoSubmit } from "@/lib/agent/autonomous";

export const Route = createFileRoute("/_authenticated/agent")({
  head: () => ({
    meta: [
      { title: "Agent Chat — Vigil" },
      { name: "description", content: "Tell your agent what to buy; it drafts a guarded payment request for your approval." },
      { property: "og:title", content: "Agent Chat — Vigil" },
      { property: "og:description", content: "Give your purchasing agent a directive and budget." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(agentTokensQuery),
  component: AgentChat,
});

type Msg = { role: "user" | "assistant"; content: string; time: string; draft?: DirectiveDraft | undefined; key?: string; activity?: string[] };
const money = (c: number) => `${(c / 100).toFixed(2)} NEAR`;
const timestamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const STARTERS = [
  { label: "A blue tech logo", text: "Commission a minimalist blue tech logo. Pay pixelstudio.testnet. Budget is 5 NEAR. Deliver a transparent PNG and an SVG. Hold the NEAR in escrow until the work is verified." },
  { label: "Three vector icons", text: "Hire iconsmith.testnet for three matching vector icons. Budget is 3 NEAR. Deliver editable SVG files." },
];

function AgentChat() {
  const { data: tokens } = useSuspenseQuery(agentTokensQuery);
  const active = tokens.filter((t) => !t.revoked && new Date(t.expires_at) > new Date());
  const [tokenId, setTokenId] = useState(active[0]?.id ?? "");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const draft = useServerFn(draftDirective);
  const submit = useServerFn(submitDirective);
  const qc = useQueryClient();
  const token = active.find((t) => t.id === tokenId);
  const stream = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!active.some((t) => t.id === tokenId)) {
      setTokenId(active[0]?.id ?? "");
      setMsgs([]); setSent(null);
    }
  }, [tokens, tokenId]);
  useEffect(() => {
    if (stream.current) stream.current.scrollTop = stream.current.scrollHeight;
  }, [msgs, busy]);

  function clearChat() { setMsgs([]); setSent(null); setInput(""); composer.current?.focus(); }

  async function send() {
    const text = input.trim();
    if (!text || !token || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text, time: timestamp() }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const d = await draft({ data: { tokenId, messages: next.map(({ role, content }) => ({ role, content })) } });
      track("project.agent_request_drafted", { ready: d.ready, amount_cents: d.amount_cents });
      qc.invalidateQueries({ queryKey: ["agent_analytics"] });
      const key = crypto.randomUUID();
      const response: Msg = { role: "assistant", time: timestamp(), content: d.ready ? `Here's a proposal for ${d.vendor_name}, at ${money(d.amount_cents)}. Nothing has been paid.` : d.question.trim() || "Who should do the work, what should they deliver, and what's the budget in NEAR?", draft: d.ready ? d : undefined, key, activity: d.activity };
      setMsgs([...next, response]);
      if (canAutoSubmit(automatic, d)) {
        const directive = next.filter((m) => m.role === "user").map((m) => m.content).join("\n").slice(-2000);
        const r = await submit({ data: { tokenId, idempotencyKey: key, directive, ...d } });
        setSent(next.length);
        setMsgs([...next, response, { role: "assistant", time: timestamp(), content: r.status === "blocked" ? `Blocked by your safeguards: ${r.reason}. No money moved.` : "Automatically submitted for owner approval. Open Approvals to lock it from your NEAR wallet. No funds moved." }]);
        track(r.status === "blocked" ? "project.agent_request_blocked" : "project.agent_request_sent", { amount_cents: d.amount_cents });
        qc.invalidateQueries({ queryKey: ["agent_payment_requests"] });
        qc.invalidateQueries({ queryKey: ["agent_analytics"] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  async function confirm(i: number, d: DirectiveDraft) {
    if (busy || sent !== null || !token) return;
    setBusy(true);
    try {
      const directive = msgs.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      const r = await submit({ data: { tokenId, idempotencyKey: msgs[i]?.key ?? crypto.randomUUID(), directive: directive.slice(-2000), ...d } });
      setSent(i);
      track(r.status === "blocked" ? "project.agent_request_blocked" : "project.agent_request_sent", { amount_cents: d.amount_cents });
      qc.invalidateQueries({ queryKey: ["agent_analytics"] });
      qc.invalidateQueries({ queryKey: ["agent_payment_requests"] });
      setMsgs((m) => [...m, { role: "assistant", time: timestamp(), content: r.status === "blocked" ? `Blocked by your safeguards: ${r.reason ?? "limit reached"}. No money moved.` : "Sent. It's waiting in Approvals — approve it to lock the NEAR from your wallet." }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    } finally { setBusy(false); }
  }

  return (
    <main className="app-main chat-main">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow">Step 2 · Directive</div><h1 className="page-heading mt-3">Agent Chat</h1></div><span className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-signal" />Your approval. Your limits.</span></div>

      {active.length === 0 ? (
        <div className="empty-state mt-8"><Bot className="size-8 text-signal" /><p>No active token yet.</p><Button asChild><Link to="/wallet">Create an agent token<ArrowUpRight /></Link></Button></div>
      ) : (
        <section className="chat-room overflow-hidden rounded-lg border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-md bg-ink text-highlight"><Bot className="size-5" /></span><div><h2 className="text-sm font-semibold">Purchasing agent · Lovable AI</h2><p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-signal" />{busy ? "Checking policy and preparing request" : "Ready for your directive"}</p></div></div>
            <Button type="button" variant="ghost" size="icon" title="Clear chat" aria-label="Clear chat" disabled={busy || !msgs.length} onClick={clearChat}><RotateCcw /></Button>
          </header>
          <div className="border-b bg-muted/40 px-4 py-3 sm:px-6">
            <label className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">Agent token<select aria-label="Agent token" disabled={busy} value={tokenId} onChange={(e) => { setTokenId(e.target.value); clearChat(); }} className="min-w-0 max-w-full flex-1 rounded-md border bg-card px-2 py-1.5 text-xs text-foreground">{active.map((t) => <option key={t.id} value={t.id}>{t.label} · {money(t.single_cap_cents)} per payment · {money(t.daily_cap_cents)} / 24h</option>)}</select></label>
            {token && <p className="mt-2 break-words text-[11px] leading-relaxed text-muted-foreground">Payees: {token.merchant_whitelist.length ? token.merchant_whitelist.join(", ") : "Any contractor"} · Expires {new Date(token.expires_at).toLocaleDateString()}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3"><Switch id="automatic" checked={automatic} onCheckedChange={setAutomatic} disabled={busy} /><label htmlFor="automatic" className="text-xs">Submit complete requests automatically</label><span className="text-[10px] text-muted-foreground">Escrow locks still need your wallet approval</span></div>
          </div>
          <div ref={stream} role="log" aria-label="Conversation" aria-live="polite" className="chat-stream space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
            {msgs.length === 0 && <div className="flex h-full flex-col items-center justify-center py-8 text-center"><span className="mb-5 flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground"><Sparkles className="size-6" /></span><h2 className="font-display text-2xl font-semibold">What are we making?</h2><p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">A contractor, a budget, a clear deliverable.<br />Every payment stays on your rails.</p><div className="mt-7 flex flex-wrap justify-center gap-2">{STARTERS.map((s) => <Button key={s.label} variant="outline" size="sm" onClick={() => { setInput(s.text); composer.current?.focus(); }}><Sparkles />{s.label}<ArrowUpRight /></Button>)}</div></div>}
            {msgs.map((m, i) => (
              <div key={i} className={`flex gap-2 sm:gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <span className={`mt-1 flex size-7 shrink-0 items-center justify-center rounded-full ${m.role === "user" ? "bg-muted text-foreground" : "bg-accent text-accent-foreground"}`}>{m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}</span>
                <div className="min-w-0 max-w-[88%] text-sm sm:max-w-[80%]">
                  <div className={`rounded-lg px-4 py-3 ${m.role === "user" ? "bg-ink text-ink-foreground" : "bg-muted/60 text-foreground"}`}><p className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</p></div>
                  <p className={`mt-1.5 text-[10px] text-muted-foreground ${m.role === "user" ? "text-right" : ""}`}>{m.role === "user" ? "You" : "Vigil"} · {m.time}</p>
                  {m.activity?.map((step) => <p key={step} className="mt-2 flex items-center gap-1.5 text-[10px] text-signal"><ShieldCheck className="size-3" />{step}</p>)}
                  {m.draft && (
                    <div className="mt-3 overflow-hidden rounded-md border text-xs">
                      <div className="flex items-center gap-2 border-b bg-accent px-4 py-3 font-medium text-accent-foreground"><FileCheck2 className="size-4" />Proof-of-source proposal</div>
                      <div className="p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="font-display text-2xl font-semibold">{money(m.draft.amount_cents)} </span>{token && <span className={`flex items-center gap-1 text-[10px] ${m.draft.amount_cents <= token.single_cap_cents ? "text-accent-foreground" : "text-destructive"}`}><ShieldCheck className="size-3" />{m.draft.amount_cents <= token.single_cap_cents ? `Within ${money(token.single_cap_cents)} cap` : `Above ${money(token.single_cap_cents)} cap`}</span>}</div>
                      <dl className="grid gap-y-1 [&_dd]:mb-3 [&_dd]:break-words [&_dt]:text-muted-foreground">
                        <dt>Contractor</dt><dd>{m.draft.vendor_name} <span className="font-mono">({m.draft.merchant_handle})</span></dd>
                        <dt>Scope of work</dt><dd>{m.draft.description}</dd>
                        {m.draft.delivery_requirements && <><dt>Must deliver</dt><dd>{m.draft.delivery_requirements}</dd></>}
                      </dl>
                      <Button size="sm" className="mt-1 w-full" disabled={busy || sent !== null} onClick={() => { if (m.draft) void confirm(i, m.draft); }}><ShieldCheck />{sent === i ? "Submitted" : "Send for approval"}</Button><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Daily budget and payee safeguards are checked when submitted. No funds move here.</p></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Bot className="size-4 text-signal" /><Loader2 className="size-3 animate-spin" />Agent is working…</div>}
            {sent !== null && <Button asChild variant="outline" size="sm"><Link to="/approvals">Open Approvals<ArrowUpRight /></Link></Button>}
          </div>

          <form className="flex items-end gap-2 border-t bg-card p-4 sm:px-6" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <Textarea ref={composer} aria-label="Message your agent" value={input} disabled={busy} onChange={(e) => setInput(e.target.value)} placeholder="Message your agent…" rows={2} maxLength={2000} className="max-h-40 min-h-16 resize-none border-0 bg-muted/50 shadow-none"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <Button type="submit" size="icon" className="mb-1 shrink-0" disabled={busy || !token || !input.trim()} aria-label="Send"><Send className="size-4" /></Button>
          </form>
        </section>
      )}
    </main>
  );
}
