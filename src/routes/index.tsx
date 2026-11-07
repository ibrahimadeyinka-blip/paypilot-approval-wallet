import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, KeyRound, ShieldCheck, ScanLine, ReceiptText, LockKeyhole, Check, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayrailBrand } from "@/components/payrail-brand";
import infrastructure from "@/assets/payrail-infrastructure.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Payrail — Payments for agents. Control for you." },
    { name: "description", content: "Guarded AI agent payments with revocable tokens, spending limits, owner approval, and delivery review." },
    { property: "og:title", content: "Payrail — Payments for agents. Control for you." },
    { property: "og:description", content: "Your agents can transact. You stay in control, from request to delivery." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }), component: Index,
});
const capabilities = [
  { icon: KeyRound, number: "01", title: "Permission, not access.", body: "Give each agent a limited token, not your payment credentials. Set its lifetime and revoke it whenever you need.", detail: "1, 7 or 30-day tokens" },
  { icon: ShieldCheck, number: "02", title: "Your budget. Your boundaries.", body: "Only approved merchants. A hard cap on every request. You decide before PayPal places an authorization hold.", detail: "$100 per payment · $500 per rolling day" },
  { icon: ScanLine, number: "03", title: "Delivery before payment.", body: "Merchants deliver through a private link. AI reviews the work; unclear results come back to you before capture.", detail: "Private delivery · Conditional capture" },
];
function Index() {
  return <main className="bg-background">
    <header className="mx-auto flex h-24 max-w-7xl items-center justify-between gap-4 px-6 lg:px-10">
      <Link to="/" aria-label="Payrail home"><PayrailBrand /></Link>
      <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex"><a href="#guardrails" className="hover:text-primary">The guardrails</a><a href="#workflow" className="hover:text-primary">How it works</a><Link to="/ledger" className="hover:text-primary">Payment ledger</Link></nav>
      <div className="flex items-center gap-3"><Button asChild variant="ghost" className="hidden sm:inline-flex"><Link to="/auth">Sign in</Link></Button><Button asChild><Link to="/wallet">Open wallet <ArrowUpRight /></Link></Button></div>
    </header>
    <section className="relative isolate overflow-hidden border-y">
      <img src={infrastructure} alt="Emerald glass and stainless steel rails representing guarded payment infrastructure" width={1920} height={1024} className="hero-image absolute inset-0 -z-10 h-full w-full object-cover object-[62%_center] opacity-35 sm:object-center sm:opacity-100" />
      <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-10 lg:py-28">
        <div className="animate-enter max-w-xl"><span className="eyebrow">BUILT FOR THE AGENT ECONOMY</span><h1 className="mt-7 font-display text-[50px] font-medium leading-[1.05] sm:text-[66px]">Payrail.<br />Payments for agents.<br /><span className="text-primary">Control for you.</span></h1><p className="mt-7 max-w-[420px] text-base leading-relaxed text-muted-foreground sm:text-lg">Let your agents get things done. Keep every payment inside your rules, from the first request to the finished work.</p><div className="mt-8 flex flex-wrap items-center gap-4"><Button asChild size="lg"><Link to="/wallet">Open Agent Wallet <ArrowUpRight /></Link></Button><Button asChild variant="ghost"><a href="#workflow">Explore the flow <ArrowRight /></a></Button></div><div className="mt-10 flex flex-wrap items-center gap-5 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><LockKeyhole className="size-3.5" /> Your credentials stay yours</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> PayPal Sandbox</span></div></div>
      </div>
    </section>
    <section className="border-b"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x px-6 py-7 text-sm sm:grid-cols-4 lg:px-10">{["Scoped agent tokens", "Server-enforced limits", "Owner approval", "Delivery review"].map(t => <div key={t} className="flex items-center justify-center gap-2 px-2 py-2"><Check className="size-3.5 shrink-0 text-primary" /><span>{t}</span></div>)}</div></section>
    <section id="guardrails" className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24"><div className="flex flex-wrap items-end justify-between gap-6"><div><span className="eyebrow">AUTONOMY WITHOUT THE GUESSWORK</span><h2 className="mt-5 max-w-xl text-3xl font-medium leading-tight sm:text-[42px]">Everything an agent needs.<br />Nothing you didn’t allow.</h2></div><p className="max-w-xs text-sm leading-relaxed text-muted-foreground">A clear boundary between what your agent can request and what actually gets paid.</p></div><div className="mt-12 grid border-t md:grid-cols-3">{capabilities.map(c => <article key={c.number} className="border-b py-8 md:border-b-0 md:border-r md:px-7 md:first:pl-0 md:last:border-r-0 md:last:pr-0"><div className="flex items-center justify-between"><c.icon className="size-6 text-primary" /><span className="font-mono text-xs text-muted-foreground">/{c.number}</span></div><h3 className="mt-8 text-xl font-semibold">{c.title}</h3><p className="mt-4 text-sm leading-7 text-muted-foreground">{c.body}</p><p className="mt-7 border-t pt-4 font-mono text-[11px] text-primary">{c.detail}</p></article>)}</div></section>
    <section id="workflow" className="border-y bg-muted/50"><div className="mx-auto max-w-7xl px-6 py-20 lg:px-10"><span className="eyebrow">FROM INTENT TO RECEIPT</span><div className="mt-5 flex flex-wrap items-end justify-between gap-4"><h2 className="text-3xl font-medium sm:text-[42px]">One payment. A clear path.</h2><Button asChild variant="outline"><Link to="/approvals">View approvals <ArrowUpRight /></Link></Button></div><div className="mt-12 grid gap-0 sm:grid-cols-4">{[{ icon: GitBranch, title: "Agent requests", body: "Merchant, amount, and source evidence." }, { icon: ShieldCheck, title: "You approve", body: "Policy checks, then an authorization hold." }, { icon: ScanLine, title: "Work is reviewed", body: "Private delivery checked against requirements." }, { icon: ReceiptText, title: "Payment recorded", body: "Conditional capture and a complete audit trail." }].map((s,i) => <div key={s.title} className="relative border-t py-7 sm:pr-6"><div className="flex items-center justify-between"><span className="flex size-11 items-center justify-center rounded-md border bg-card"><s.icon className="size-5 text-primary" /></span><span className="font-mono text-xs text-muted-foreground">0{i+1}</span></div><h3 className="mt-6 text-base font-semibold">{s.title}</h3><p className="mt-2 max-w-56 text-sm leading-relaxed text-muted-foreground">{s.body}</p></div>)}</div></div></section>
    <section className="bg-primary text-primary-foreground"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-6 py-16 lg:px-10"><div><p className="font-mono text-xs opacity-70">YOUR AGENTS. YOUR RULES.</p><h2 className="mt-4 text-3xl font-medium sm:text-[42px]">Put your agents on the right rails.</h2></div><Button asChild size="lg" variant="highlight"><Link to="/wallet">Open your wallet <ArrowUpRight /></Link></Button></div></section>
    <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-9 lg:px-10"><Link to="/"><PayrailBrand /></Link><p className="text-xs text-muted-foreground">Guarded payments for AI agents.</p><Button asChild variant="ghost" size="sm"><Link to="/auth">Sign in <ArrowUpRight /></Link></Button></footer>
  </main>;
}
