import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, KeyRound, ScanLine, ShieldCheck, X, Bot, Lock, Upload, Sparkles, Moon, Sun, Asterisk } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayrailBrand } from "@/components/payrail-brand";
import { GlyphSphere } from "@/components/glyph-sphere";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Vigil — Escrow rails for autonomous AI agents on NEAR" },
    { name: "description", content: "Vigil gives AI agents spending tokens with your caps. Funds lock in NEAR testnet escrow, AI verifies the delivered work, then releases on-chain." },
    { property: "og:title", content: "Vigil — Escrow rails for autonomous AI agents" },
    { property: "og:description", content: "Spending tokens, owner approval, NEAR escrow and AI-verified on-chain release for AI agents." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Index,
});

const DIRECTIVE = "Hire pixelstudio.testnet for a minimalist blue tech logo. Budget 5 NEAR. Hold it in escrow until the work checks out.";
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

function useTyped(text: string, speed = 28) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) { const t = setTimeout(() => setN(0), 5600); return () => clearTimeout(t); }
    const t = setTimeout(() => setN(n + 1), speed);
    return () => clearTimeout(t);
  }, [n, text, speed]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  return <Button variant="default" size="icon" aria-label="Toggle dark mode" className="rounded-none bg-ink text-ink-foreground hover:bg-ink/90" onClick={() => { const d = !dark; setDark(d); document.documentElement.classList.toggle("dark", d); }}>{dark ? <Sun /> : <Moon />}</Button>;
}

function Index() {
  const { shown, done } = useTyped(DIRECTIVE);
  return <main className="overflow-x-hidden bg-background">
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to="/" aria-label="Vigil home"><PayrailBrand /></Link>
        <nav className="hidden items-center gap-7 font-mono text-[13px] md:flex"><a href="#how" className="hover:text-highlight">How it works</a><a href="#guardrails" className="hover:text-highlight">Guardrails</a><Link to="/ledger" className="hover:text-highlight">Ledger</Link><Link to="/analytics" className="hover:text-highlight">Analytics</Link></nav>
        <div className="flex items-center gap-2"><ThemeToggle /><Button asChild className="btn-sweep h-10 rounded-none px-5 font-mono"><Link to="/wallet">Launch app <ArrowUpRight /></Link></Button></div>
      </div>
    </header>

    <section className="relative mx-auto max-w-7xl px-5 sm:px-8">
      <div className="pt-16 text-center sm:pt-20">
        <h1 aria-label="Vigil" className="mega glyph-rise text-[26vw] sm:text-[200px] lg:text-[250px]">{"VIGIL".split("").map((c, i) => <span key={i} style={{ animationDelay: `${i * 70}ms` }}>{c}</span>)}</h1>
        <p className="mt-6 font-mono text-[15px] text-muted-foreground sm:text-lg">Escrow rails for <span className="font-semibold text-highlight">autonomous agents</span> on NEAR…</p>
      </div>

      <div className="relative mx-auto mt-10 grid max-w-5xl overflow-hidden border bg-card/50 lg:grid-cols-[1.1fr_1fr]">
        <div className="scan-grid relative h-[360px] border-b lg:h-[440px] lg:border-b-0 lg:border-r">
          <span className="corner corner-tl" /><span className="corner corner-tr" /><span className="corner corner-bl" /><span className="corner corner-br" />
          <span className="absolute left-12 top-6 font-mono text-[11px] text-muted-foreground">Make every payment earn its release</span>
          <GlyphSphere className="h-full w-full cursor-crosshair" />
          <span className="absolute bottom-6 left-12 font-mono text-[10px] uppercase text-muted-foreground">Move to tilt</span>
          <span className="absolute bottom-6 right-12 font-mono text-[10px] text-muted-foreground">NEAR · testnet</span>
        </div>
        <div className="flex flex-col p-5 sm:p-7">
          <div className="flex items-center justify-between border-b pb-3 font-mono text-[10px] uppercase text-muted-foreground"><span className="flex items-center gap-2"><span className="size-1.5 animate-pulse rounded-full bg-signal" /> agent · design-bot</span><span>15 NEAR cap · 7d</span></div>
          <div className="mt-5 flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center bg-ink font-mono text-[9px] font-semibold text-ink-foreground">YOU</span><p className={`text-[15px] leading-snug ${done ? "" : "caret"}`}>{shown}</p></div>
          <div className={`mt-5 space-y-2 transition-all duration-700 ${done ? "opacity-100" : "translate-y-2 opacity-0"}`}>
            <div className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center bg-highlight"><Bot className="size-3.5 text-highlight-foreground" /></span>
              <div className="flex-1 border border-dashed p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-medium">pixelstudio.testnet</span><span className="font-mono">5.00 NEAR</span></div><p className="mt-1 text-xs text-muted-foreground">Minimalist blue tech logo · PNG + SVG</p></div></div>
            {["Valid NEAR account", "Under 15 NEAR cap", "Inside 24h budget"].map((l) => <div key={l} className="ml-10 flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><Check className="size-3 text-signal" /> {l}</div>)}
            <div className="ml-10 flex items-center justify-between bg-ink px-3 py-2 font-mono text-[11px] text-ink-foreground"><span>Awaiting your approval</span><span className="text-signal">ESCROW · 5 NEAR</span></div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-6 py-10">
        <p className="font-mono text-[15px] text-muted-foreground">Autonomous agents. Owner-set limits.<br /><span className="text-foreground">Paid only when the work is proven.</span></p>
        <div className="flex items-center gap-6"><Link to="/agent" className="border-b border-foreground pb-1 font-mono text-sm hover:text-highlight">Try the agent</Link><Button asChild size="lg" className="btn-sweep h-14 rounded-none px-7 font-mono text-[15px]"><Link to="/wallet">Create an agent token <ArrowUpRight /></Link></Button></div>
      </div>
    </section>

    <div className="border-y bg-card/60 py-4 mask-x" aria-label="Vigil principles">
      <div className="marquee gap-10 pr-10">{[...slogans, ...slogans, ...slogans].map((s, i) => <span key={i} className="flex shrink-0 items-center gap-10 font-mono text-[13px] font-semibold uppercase tracking-wide">{s}<Asterisk className="ticker-star size-4" /></span>)}</div>
    </div>

    <section className="bg-highlight text-highlight-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:py-28">
        <div><span className="font-mono text-xs opacity-75">00 / THE PROBLEM</span><h2 className="mt-4 text-5xl font-black uppercase leading-[0.9] sm:text-7xl">Agents can spend.<br />Can they be trusted?</h2></div>
        <div className="grid gap-px self-end bg-highlight-foreground/20 sm:grid-cols-3">{[["Prepay", "the agent pays first and hopes the work arrives"], ["Postpay", "the contractor works first and hopes to be paid"], ["Vigil", "NEAR waits in escrow until AI verifies delivery"]].map(([t, b], i) => <div key={t} className={`p-6 ${i === 2 ? "bg-highlight-foreground text-highlight" : "bg-highlight"}`}><p className="font-mono text-[11px] uppercase opacity-70">0{i + 1}</p><p className="mt-8 text-2xl font-bold">{t}</p><p className="mt-2 text-sm opacity-80">{b}</p></div>)}</div>
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
