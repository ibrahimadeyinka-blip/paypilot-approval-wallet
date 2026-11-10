import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, KeyRound, ScanLine, ShieldCheck, X, Bot, Lock, Upload, Sparkles, Asterisk, Terminal, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayrailBrand } from "@/components/payrail-brand";
import { KineticVault } from "@/components/kinetic-vault";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Vigil — Escrow rails for autonomous AI agents on NEAR" },
    { name: "description", content: "Vigil gives AI agents spending tokens with your caps. Funds lock in NEAR testnet escrow, AI verifies the delivered work, then releases on-chain." },
    { property: "og:title", content: "Vigil — Escrow rails for autonomous AI agents" },
    { property: "og:description", content: "Spending tokens, owner approval, NEAR escrow and AI-verified on-chain release for AI agents." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Index,
});

const slogans = ["Lock before you trust", "Verify before you pay", "Agents with a leash", "Money with a conscience", "Release on proof"];
const ticker = [
  ["pixelstudio.testnet", "5.00 NEAR", "in escrow"], ["figma-bot.testnet", "1.50 NEAR", "released"], ["bigspender.testnet", "24.00 NEAR", "blocked · over cap"],
  ["copydesk.testnet", "4.50 NEAR", "awaiting delivery"], ["unknown.testnet", "0.99 NEAR", "blocked · not approved"], ["gpu-rent.testnet", "3.20 NEAR", "released"],
  ["iconsmith.testnet", "6.00 NEAR", "in review"], ["notes-agent.testnet", "1.00 NEAR", "released"],
] as const;
const steps = [
  { icon: KeyRound, t: "Scope", b: "Issue a token with your own per-payment cap, 24h budget, payees and expiry." },
  { icon: Bot, t: "Direct", b: "Tell the agent what you need in plain words. It drafts a guarded request." },
  { icon: Lock, t: "Lock", b: "You approve. The NEAR is reserved in the testnet escrow account." },
  { icon: Upload, t: "Deliver", b: "The contractor uploads the work through a one-time private link." },
  { icon: Sparkles, t: "Release", b: "AI vision checks it against your brief, then NEAR moves on-chain." },
];

const CAP = 1500, BUDGET = 5000;
type Check = { label: string; ok: boolean };
function runGuards(payee: string, cents: number, spent: number): Check[] {
  return [
    { label: "NEAR testnet account", ok: /^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.testnet$/.test(payee) },
    { label: "Under 15 NEAR per-payment cap", ok: cents > 0 && cents <= CAP },
    { label: "Inside 50 NEAR 24h budget", ok: spent + cents <= BUDGET },
  ];
}

function Sandbox({ onLock, onRelease }: { onLock: (c: number) => void; onRelease: () => void }) {
  const [payee, setPayee] = useState("pixelstudio.testnet");
  const [amount, setAmount] = useState("5");
  const [spent, setSpent] = useState(0);
  const [log, setLog] = useState<{ checks: Check[]; payee: string; cents: number; state: "locked" | "blocked" | "released" } | null>(null);
  const [step, setStep] = useState(0);
  const run = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(Number(amount) * 100) || 0;
    const checks = runGuards(payee.trim().toLowerCase(), cents, spent);
    const ok = checks.every((c) => c.ok);
    setLog({ checks, payee: payee.trim(), cents, state: ok ? "locked" : "blocked" }); setStep(0);
    checks.forEach((_, i) => setTimeout(() => setStep(i + 1), 260 * (i + 1)));
    if (ok) setTimeout(() => { setSpent((s) => s + cents); onLock(cents); }, 900);
  };
  const release = () => { if (!log) return; setLog({ ...log, state: "released" }); onLock(-log.cents); onRelease(); };
  return <div className="hud-panel flex flex-col">
    <div className="flex items-center justify-between border-b px-4 py-2.5 font-mono text-[10px] uppercase text-muted-foreground"><span className="flex items-center gap-2"><Terminal className="size-3.5 text-primary" /> agent sandbox · try it</span><span>cap 15 Ⓝ · budget {((BUDGET - spent) / 100).toFixed(0)} Ⓝ left</span></div>
    <form onSubmit={run} className="grid gap-3 p-4 sm:grid-cols-[1fr_110px_auto]">
      <label className="font-mono text-[10px] uppercase text-muted-foreground">payee<input value={payee} onChange={(e) => setPayee(e.target.value)} className="mt-1 block h-11 w-full border bg-background px-3 font-mono text-sm normal-case text-foreground outline-none focus:border-primary" /></label>
      <label className="font-mono text-[10px] uppercase text-muted-foreground">amount Ⓝ<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 block h-11 w-full border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-primary" /></label>
      <Button type="submit" className="h-11 self-end rounded-none font-mono">Run guards <Zap /></Button>
    </form>
    <div className="flex flex-wrap gap-2 px-4 font-mono text-[11px]">{[["pixelstudio.testnet", "5"], ["bigspender.testnet", "24"], ["fiverr.com", "6"]].map(([p, a]) => <button key={p} type="button" onClick={() => { setPayee(p); setAmount(a); }} className="border border-dashed px-2 py-1 text-muted-foreground hover:border-highlight hover:text-highlight">{p} · {a}Ⓝ</button>)}</div>
    <div className="m-4 min-h-[170px] flex-1 border bg-ink p-4 font-mono text-[12px] leading-relaxed">
      {!log ? <p className="text-muted-foreground">&gt; awaiting directive<span className="caret" /></p> : <>
        <p className="text-muted-foreground">&gt; submit {log.payee} · {(log.cents / 100).toFixed(2)} Ⓝ</p>
        {log.checks.slice(0, step).map((c) => <p key={c.label} className={c.ok ? "text-primary" : "text-destructive"}>{c.ok ? "[ok]  " : "[fail]"} {c.label}</p>)}
        {step >= 3 && <p className={`mt-2 ${log.state === "blocked" ? "text-destructive" : "text-highlight"}`}>&gt; {log.state === "blocked" ? "BLOCKED — no NEAR moved" : log.state === "locked" ? "LOCKED in escrow · awaiting delivery" : "AI verified · RELEASED on-chain"}</p>}
        {step >= 3 && log.state === "locked" && <button onClick={release} className="mt-3 border border-primary px-3 py-1.5 text-primary hover:bg-primary hover:text-primary-foreground">Simulate verified delivery →</button>}
      </>}
    </div>
  </div>;
}

function Index() {
  const [locked, setLocked] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [block, setBlock] = useState(187_402_311);
  useEffect(() => { const i = setInterval(() => setBlock((b) => b + 1), 1200); return () => clearInterval(i); }, []);
  return <main className="overflow-x-hidden bg-background">
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to="/" aria-label="Vigil home"><PayrailBrand /></Link>
        <nav className="hidden items-center gap-7 font-mono text-[13px] md:flex"><a href="#how" className="hover:text-highlight">How it works</a><a href="#guardrails" className="hover:text-highlight">Guardrails</a><Link to="/ledger" className="hover:text-highlight">Ledger</Link><Link to="/analytics" className="hover:text-highlight">Analytics</Link></nav>
        <div className="flex items-center gap-2"><Button asChild className="hud-glow h-10 rounded-none px-5 font-mono"><Link to="/wallet">Launch app <ArrowUpRight /></Link></Button></div>
      </div>
    </header>

    <section className="hud-grid relative overflow-hidden border-b">
      <div className="hud-sweep" />
      <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-14 sm:px-8 sm:pt-20">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] uppercase text-muted-foreground"><span className="flex items-center gap-2 border border-primary/40 px-2 py-1 text-primary"><span className="size-1.5 animate-pulse bg-primary" /> sys online</span><span>near testnet · escrow node</span><span className="hidden sm:inline">// guardrails armed</span></div>
        <h1 className="flicker mt-6 max-w-5xl text-5xl font-extrabold uppercase leading-[0.95] sm:text-7xl lg:text-8xl">Agents spend.<br /><span className="glow-text text-primary">Vigil</span> <span className="glow-cyan text-highlight">watches.</span></h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">Escrow rails for autonomous AI agents on NEAR. Your caps, your payees — funds stay locked until AI verifies the work.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg" className="hud-glow h-12 rounded-none px-6 font-mono"><Link to="/wallet">Create an agent token <ArrowUpRight /></Link></Button><Button asChild size="lg" variant="outline" className="h-12 rounded-none border-highlight/50 px-6 font-mono text-highlight hover:bg-highlight/10 hover:text-highlight"><Link to="/agent">Open agent chat</Link></Button></div>

        <div className="mt-12 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Sandbox onLock={(c) => { setLocked((l) => l + c); }} onRelease={() => setPulse((p) => p + 1)} />
          <div className="hud-panel hud-scan flex flex-col">
            <div className="flex items-center justify-between border-b px-4 py-2.5 font-mono text-[10px] uppercase text-muted-foreground"><span>escrow vault · telemetry</span><span className="text-primary">● live</span></div>
            <KineticVault className="h-[320px] w-full cursor-crosshair lg:h-full lg:min-h-[340px]" pulseKey={pulse} locked={locked} />
            <div className="grid grid-cols-3 border-t font-mono text-[11px]">{[["block", block.toLocaleString()], ["locked", `${(locked / 100).toFixed(2)} Ⓝ`], ["releases", String(pulse)]].map(([k, v]) => <div key={k} className="border-r px-4 py-3 last:border-r-0"><p className="text-[10px] uppercase text-muted-foreground">{k}</p><p className="mt-1 text-highlight">{v}</p></div>)}</div>
          </div>
        </div>
      </div>
    </section>

    <div className="border-y bg-card/60 py-4 mask-x" aria-label="Vigil principles">
      <div className="marquee gap-10 pr-10">{[...slogans, ...slogans, ...slogans].map((s, i) => <span key={i} className="flex shrink-0 items-center gap-10 font-mono text-[13px] font-semibold uppercase tracking-wide">{s}<Asterisk className="ticker-star size-4" /></span>)}</div>
    </div>

    <section className="border-y bg-ink">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:py-28">
        <div><span className="font-mono text-xs text-highlight">00 / THE PROBLEM</span><h2 className="mt-4 text-4xl font-extrabold uppercase leading-[0.95] sm:text-6xl">Agents can spend.<br /><span className="text-highlight glow-cyan">Can they be trusted?</span></h2></div>
        <div className="grid gap-px self-end bg-border sm:grid-cols-3">{[["Prepay", "the agent pays first and hopes the work arrives"], ["Postpay", "the contractor works first and hopes to be paid"], ["Vigil", "NEAR waits in escrow until AI verifies delivery"]].map(([t, b], i) => <div key={t} className={`p-6 ${i === 2 ? "bg-primary text-primary-foreground hud-glow" : "bg-card"}`}><p className="font-mono text-[11px] uppercase opacity-70">0{i + 1}</p><p className="mt-8 text-2xl font-bold">{t}</p><p className="mt-2 text-sm opacity-80">{b}</p></div>)}</div>
      </div>
    </section>

    <section id="how" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6"><div><span className="font-mono text-xs text-muted-foreground">01 / HOW IT WORKS</span><h2 className="mt-4 max-w-2xl text-5xl font-black uppercase leading-[0.9] sm:text-6xl">From one sentence to a <span className="hl">proven</span> payment.</h2></div><p className="max-w-xs font-mono text-sm text-muted-foreground">Five steps. NEAR only moves on the last one.</p></div>
      <ol className="mt-14 grid gap-px border bg-border sm:grid-cols-5">
        {steps.map(({ icon: Icon, t, b }, i) =>
          <li key={t} className="group relative bg-background p-6 transition-colors duration-300 hover:bg-ink hover:text-ink-foreground"><div className="flex items-center justify-between"><span className="font-mono text-[11px] opacity-60">0{i + 1}</span><Icon className="size-5 text-highlight transition-colors group-hover:text-signal" /></div><h3 className="mt-14 text-2xl font-black uppercase">{t}</h3><p className="mt-2 text-sm leading-relaxed opacity-75">{b}</p></li>)}
      </ol>
    </section>

    <div className="border-y py-3.5 mask-x" aria-label="Example agent activity">
      <div className="marquee gap-10 pr-10 [animation-direction:reverse]">{[...ticker, ...ticker].map(([m, a, s], i) => <span key={i} className="flex shrink-0 items-center gap-2.5 font-mono text-xs"><span className={`size-1.5 ${s.startsWith("blocked") ? "bg-destructive" : s === "released" ? "bg-signal" : "bg-highlight"}`} /><span className="font-semibold">{m}</span><span className="text-muted-foreground">{a}</span><span className={s.startsWith("blocked") ? "text-destructive" : "text-success"}>{s}</span></span>)}</div>
    </div>

    <section id="guardrails" className="bg-ink text-ink-foreground">
      <div className="dot-grid">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2">
          <div><span className="font-mono text-xs opacity-60">02 / GUARDRAILS</span><h2 className="mt-4 text-5xl font-black uppercase leading-[0.9] sm:text-6xl">Built so agents <span className="text-signal">can't overspend.</span></h2><p className="mt-6 max-w-md opacity-70">Every limit is yours, and every one is checked inside the database before any NEAR is locked. A leaked or confused agent can't talk its way past them.</p>
            <div className="mt-10 grid grid-cols-3 gap-px bg-ink-foreground/15">{[[KeyRound, "Expiring tokens"], [ShieldCheck, "Your caps"], [ScanLine, "AI-verified work"]].map(([I, l]) => { const Icon = I as typeof KeyRound; return <div key={l as string} className="bg-ink p-4"><Icon className="size-5 text-signal" /><p className="mt-8 font-mono text-xs">{l as string}</p></div>; })}</div>
          </div>
          <div className="space-y-2 font-mono text-[13px]">
            {[["pixelstudio.testnet", "5.00 NEAR", "pass", "Approved account, under cap"], ["bigspender.testnet", "24.00 NEAR", "block", "Over this token's 15 NEAR cap"], ["unknown.testnet", "0.99 NEAR", "block", "Not on your approved list"], ["fiverr.com", "6.00 NEAR", "block", "Not a NEAR account"], ["copydesk.testnet", "4.50 NEAR", "pass", "In escrow, waiting for delivery"]].map(([m, a, r, why], i) =>
              <div key={m} className="animate-enter flex items-center gap-4 border border-ink-foreground/15 bg-ink px-4 py-3.5" style={{ animationDelay: `${i * 90}ms` }}>
                <span className={`flex size-6 shrink-0 items-center justify-center ${r === "pass" ? "bg-signal text-signal-foreground" : "bg-destructive text-destructive-foreground"}`}>{r === "pass" ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate">{m}</span><span className="block truncate text-[11px] opacity-50">{why}</span></span><span>{a}</span>
              </div>)}
          </div>
        </div>
      </div>
    </section>

    <section className="relative mx-auto max-w-7xl px-5 py-28 text-center sm:px-8">
      <span className="font-mono text-xs text-muted-foreground">03 / START</span>
      <h2 className="mega mx-auto mt-6 text-6xl sm:text-8xl lg:text-9xl">Stay <span className="text-highlight">vigilant.</span></h2>
      <p className="mx-auto mt-6 max-w-md font-mono text-sm text-muted-foreground">Your agents work. Your rules hold. Your NEAR waits for proof.</p>
      <div className="mt-10 flex justify-center"><Button asChild size="lg" className="btn-sweep h-14 rounded-none px-8 font-mono text-[15px]"><Link to="/wallet">Open your wallet <ArrowUpRight /></Link></Button></div>
    </section>

    <footer className="border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div><PayrailBrand /><p className="mt-4 max-w-xs text-sm text-muted-foreground">Guarded payments for AI agents. Owners approve every escrow lock on NEAR.</p></div>
        {[["Owners", [["/wallet", "Agent wallet"], ["/approvals", "Approvals"]]], ["Agents", [["/agent", "Agent chat"], ["/analytics", "Analytics"]]], ["Records", [["/ledger", "Ledger"], ["/history", "History"]]]].map(([h, ls]) => <div key={h as string}><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{h as string}</p>{(ls as string[][]).map(([to, l]) => <Link key={to} to={to as "/wallet"} className="mt-3 block text-sm hover:text-highlight">{l}</Link>)}</div>)}
      </div>
      <div className="border-t"><div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-5 py-5 font-mono text-[11px] text-muted-foreground sm:px-8"><span>© Vigil · escrow rails for agents</span><span className="flex items-center gap-2"><span className="size-1.5 bg-signal" /> NEAR Testnet only · no mainnet funds</span></div></div>
    </footer>
  </main>;
}
