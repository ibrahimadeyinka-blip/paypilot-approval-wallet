import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, KeyRound, ScanLine, ShieldCheck, X, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayrailBrand } from "@/components/payrail-brand";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Payrail — Let AI agents pay. On your rails." },
    { name: "description", content: "Give AI agents a spending token with your own caps, budgets and approved NEAR accounts. You approve, NEAR testnet escrow holds the funds, AI checks the work, then it releases on-chain." },
    { property: "og:title", content: "Payrail — Let AI agents pay. On your rails." },
    { property: "og:description", content: "Spending tokens, owner approval, NEAR escrow and AI-verified on-chain release for AI agents." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Index,
});

const DIRECTIVE = "Find a contractor to design a minimalist blue tech logo. Pay pixelstudio.testnet. Budget is 5 NEAR.";
const ticker = [
  ["pixelstudio.testnet", "5.00 NEAR", "in escrow"], ["figma-bot.testnet", "1.50 NEAR", "released"], ["bigspender.testnet", "24.00 NEAR", "blocked · over cap"],
  ["copydesk.testnet", "4.50 NEAR", "awaiting delivery"], ["unknown.testnet", "0.99 NEAR", "blocked · not approved"], ["gpu-rent.testnet", "3.20 NEAR", "released"],
  ["iconsmith.testnet", "6.00 NEAR", "in review"], ["notes-agent.testnet", "1.00 NEAR", "released"],
] as const;

function useTyped(text: string, speed = 32) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) { const t = setTimeout(() => setN(0), 5200); return () => clearTimeout(t); }
    const t = setTimeout(() => setN(n + 1), speed);
    return () => clearTimeout(t);
  }, [n, text, speed]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

function Index() {
  const { shown, done } = useTyped(DIRECTIVE);
  return <main className="overflow-x-hidden bg-background">
    <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to="/" aria-label="Payrail home"><PayrailBrand /></Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex"><a href="#how" className="hover:text-foreground">How it works</a><a href="#guardrails" className="hover:text-foreground">Guardrails</a><Link to="/analytics" className="hover:text-foreground">Analytics</Link></nav>
        <div className="flex items-center gap-2"><Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex"><Link to="/auth">Sign in</Link></Button><Button asChild size="sm"><Link to="/wallet">Open wallet</Link></Button></div>
      </div>
    </header>

    <section className="relative">
      <div className="paper-grid pointer-events-none absolute inset-0 -z-0 opacity-60" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pt-14 sm:px-8 lg:grid-cols-[1.25fr_1fr] lg:pt-20">
        <div className="stagger">
          <span className="eyebrow">Autonomous business · NEAR Testnet</span>
          <h1 className="mt-6 text-[52px] font-bold leading-[0.95] sm:text-[76px]">Let agents pay.<br />On <span className="hl">your rails.</span></h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted-foreground">Give each AI agent a token with your own limits. It asks, you approve, the NEAR is locked in escrow, and it's released on-chain only once AI verifies the work.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg" className="rounded-full px-6"><Link to="/wallet">Create an agent token <ArrowUpRight /></Link></Button><Button asChild size="lg" variant="outline" className="rounded-full px-6"><Link to="/agent">Try the agent <ArrowRight /></Link></Button></div>
        </div>

        <div className="animate-enter self-end [animation-delay:250ms]">
          <div className="rounded-xl border bg-card p-4 shadow-[var(--surface-shadow)]">
            <div className="flex items-center justify-between border-b pb-3 font-mono text-[10px] text-muted-foreground"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-signal" /> agent · design-bot</span><span>15 NEAR cap · 7 days</span></div>
            <div className="mt-4 flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-ink-foreground">YOU</span><p className={`text-[15px] leading-snug ${done ? "" : "caret"}`}>{shown}</p></div>
            <div className={`mt-4 space-y-2 transition-all duration-700 ${done ? "opacity-100" : "translate-y-2 opacity-0"}`}>
              <div className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-highlight"><Bot className="size-3.5 text-highlight-foreground" /></span>
                <div className="flex-1 rounded-lg border border-dashed p-3 text-sm"><div className="flex justify-between"><span className="font-medium">pixelstudio.testnet</span><span className="font-mono">5.00 NEAR</span></div><p className="mt-1 text-xs text-muted-foreground">Minimalist blue tech logo · PNG + SVG</p></div></div>
              {[["Valid NEAR account", true], ["Under 15 NEAR cap", true], ["Inside 24h budget", true]].map(([l]) => <div key={l as string} className="ml-10 flex items-center gap-2 font-mono text-[11px] text-muted-foreground"><Check className="size-3 text-signal" /> {l}</div>)}
              <div className="ml-10 flex items-center justify-between rounded-md bg-ink px-3 py-2 text-xs text-ink-foreground"><span>Waiting for your approval</span><span className="font-mono text-highlight">ESCROW · 5 NEAR</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="mask-x relative mt-16 overflow-hidden border-y bg-card/60 py-3.5" aria-label="Example agent activity">
        <div className="marquee gap-10 pr-10">{[...ticker, ...ticker].map(([m, a, s], i) => <span key={i} className="flex shrink-0 items-center gap-2.5 font-mono text-xs"><span className={`size-1.5 rounded-full ${s.startsWith("blocked") ? "bg-destructive" : s === "released" ? "bg-signal" : "bg-warning"}`} /><span className="font-semibold text-foreground">{m}</span><span className="text-muted-foreground">{a}</span><span className={s.startsWith("blocked") ? "text-destructive" : "text-signal"}>{s}</span></span>)}</div>
      </div>
    </section>

    <section id="how" className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6"><div><span className="font-mono text-xs text-muted-foreground">01 / HOW IT WORKS</span><h2 className="mt-4 max-w-lg text-4xl font-bold leading-[1.02] sm:text-5xl">From a sentence to a safe payment.</h2></div><p className="max-w-xs text-sm text-muted-foreground">Five steps. Money only moves on the last one.</p></div>
      <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
        {[["Set up", "Create a token with your own caps, budget, merchants and expiry."], ["Ask", "Tell the agent what you need and the budget."], ["Approve", "Checks pass, you approve, NEAR is locked in escrow."], ["Deliver", "The contractor uploads work through a private link."], ["Release", "AI checks it against your brief, then releases NEAR on-chain."]].map(([t, b], i) =>
          <li key={t} className="lift group bg-card p-6"><span className="font-mono text-[11px] text-muted-foreground">0{i + 1}</span><h3 className="mt-10 text-xl font-semibold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b}</p><div className="mt-6 h-0.5 w-6 bg-foreground transition-all duration-500 group-hover:w-full group-hover:bg-signal" /></li>)}
      </ol>
    </section>

    <section id="guardrails" className="bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2">
        <div><span className="font-mono text-xs opacity-60">02 / GUARDRAILS</span><h2 className="mt-4 text-4xl font-bold leading-[1.02] sm:text-5xl">Built so agents <span className="text-highlight">can't overspend.</span></h2><p className="mt-6 max-w-md opacity-70">Every limit is yours to set, and every one is checked on our servers before any NEAR is locked. A leaked or confused agent can't talk its way past them.</p>
          <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-ink-foreground/10">{[[KeyRound, "Expiring tokens"], [ShieldCheck, "Your caps"], [ScanLine, "Work reviewed"]].map(([I, l]) => { const Icon = I as typeof KeyRound; return <div key={l as string} className="bg-ink p-4"><Icon className="size-5 text-highlight" /><p className="mt-6 text-sm">{l as string}</p></div>; })}</div>
        </div>
        <div className="space-y-2 font-mono text-[13px]">
          {[["pixelstudio.testnet", "5.00 NEAR", "pass", "Approved account, under cap"], ["bigspender.testnet", "24.00 NEAR", "block", "Over this token's 15 NEAR cap"], ["unknown.testnet", "0.99 NEAR", "block", "Not on your approved list"], ["fiverr.com", "6.00 NEAR", "block", "Not a NEAR account"], ["copydesk.testnet", "4.50 NEAR", "pass", "In escrow, waiting for delivery"]].map(([m, a, r, why], i) =>
            <div key={m} className="animate-enter flex items-center gap-4 rounded-lg border border-ink-foreground/10 px-4 py-3.5" style={{ animationDelay: `${i * 90}ms` }}>
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${r === "pass" ? "bg-highlight text-highlight-foreground" : "bg-destructive text-destructive-foreground"}`}>{r === "pass" ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate">{m}</span><span className="block truncate text-[11px] opacity-50">{why}</span></span><span>{a}</span>
            </div>)}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-5 py-24 text-center sm:px-8">
      <span className="font-mono text-xs text-muted-foreground">03 / START</span>
      <h2 className="mx-auto mt-4 max-w-2xl text-4xl font-bold leading-[1.02] sm:text-6xl">Your agents. <span className="hl">Your rules.</span></h2>
      <div className="mt-9 flex justify-center gap-3"><Button asChild size="lg" className="rounded-full px-7"><Link to="/wallet">Open your wallet <ArrowUpRight /></Link></Button></div>
    </section>

    <footer className="bg-ink px-5 pb-14 pt-16">
      <div className="receipt mx-auto max-w-2xl px-8 py-10 text-center sm:px-14">
        <div className="flex justify-center"><PayrailBrand /></div>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">Guarded payments for AI agents. Owners approve every escrow lock on NEAR.</p>
        <div className="mt-8 grid grid-cols-3 gap-4 border-y border-dashed py-6 text-left text-sm">
          <div><p className="font-mono text-[10px] text-muted-foreground">OWNERS</p><Link to="/wallet" className="mt-2 block hover:text-signal">Agent wallet</Link><Link to="/approvals" className="mt-1 block hover:text-signal">Approvals</Link></div>
          <div><p className="font-mono text-[10px] text-muted-foreground">AGENTS</p><Link to="/agent" className="mt-2 block hover:text-signal">Agent chat</Link><Link to="/analytics" className="mt-1 block hover:text-signal">Analytics</Link></div>
          <div><p className="font-mono text-[10px] text-muted-foreground">RECORDS</p><Link to="/ledger" className="mt-2 block hover:text-signal">Ledger</Link><Link to="/history" className="mt-1 block hover:text-signal">History</Link></div>
        </div>
        <p className="mt-7 font-mono text-[11px] tracking-[0.3em]">THANK YOU FOR PAYING SAFELY</p>
        <div className="barcode mx-auto mt-4 w-48" aria-hidden />
        <p className="mt-3 font-mono text-[10px] text-muted-foreground">NEAR Testnet only · no mainnet funds</p>
      </div>
    </footer>
  </main>;
}
