import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check } from "lucide-react";
import { PayrailBrand } from "@/components/payrail-brand";
import { Button } from "@/components/ui/button";

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return <div className="public-frame min-h-screen bg-background">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <Link to="/" aria-label="Payrail home"><PayrailBrand /></Link>
      <Button asChild variant="ghost" size="sm"><Link to="/wallet">Agent wallet <ArrowUpRight /></Link></Button>
    </header>
    <div className="public-workspace mx-auto grid max-w-6xl gap-6 px-5 sm:px-8 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden rounded-2xl bg-ink p-10 text-ink-foreground lg:flex lg:flex-col">
        <span className="font-mono text-[11px] opacity-60">THE AGENT ECONOMY · YOUR RULES</span>
        <h2 className="mt-5 max-w-sm text-5xl font-bold leading-[0.98]">A little autonomy.<br /><span className="text-highlight">A lot of control.</span></h2>
        <svg viewBox="0 0 400 200" className="mt-auto w-full" aria-hidden>
          <path className="rail-draw" d="M0 150 H140 C200 150 210 60 270 60 H400" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
          <path className="rail-draw" d="M0 150 H400" fill="none" stroke="var(--highlight)" strokeWidth="3" style={{ animationDelay: "500ms" }} />
          <circle cx="140" cy="150" r="6" fill="var(--highlight)" />
        </svg>
        <ul className="mt-6 space-y-2 text-sm opacity-80">{["Tokens with your own limits", "You approve every hold", "Paid only after the work checks out"].map(t => <li key={t} className="flex items-center gap-2"><Check className="size-4 text-highlight" />{t}</li>)}</ul>
      </section>
      <section className="flex items-center justify-center py-12 sm:px-8 lg:px-12"><div className="w-full max-w-sm animate-enter">{children}</div></section>
    </div>
    <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-5 py-6 font-mono text-[11px] text-muted-foreground sm:px-8"><span>payrail · agent payment rails</span><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-signal" /> PayPal Sandbox</span></footer>
  </div>;
}
