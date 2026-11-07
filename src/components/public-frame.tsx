import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { PayrailBrand } from "@/components/payrail-brand";
import { Button } from "@/components/ui/button";
import infrastructure from "@/assets/payrail-infrastructure.jpg";

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return <div className="public-frame min-h-screen bg-background">
    <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-6 lg:px-10">
      <Link to="/" aria-label="Payrail home"><PayrailBrand /></Link>
      <Button asChild variant="ghost" size="sm"><Link to="/wallet">Agent Wallet <ArrowUpRight /></Link></Button>
    </header>
    <div className="public-workspace mx-auto grid max-w-7xl lg:grid-cols-2">
      <section className="public-art relative hidden overflow-hidden lg:block">
        <img src={infrastructure} alt="Polished payment rails with an emerald glass channel" width={1920} height={1024} className="absolute inset-0 h-full w-full object-cover object-right" />
        <div className="relative z-10 px-10 pt-12"><span className="eyebrow">THE AGENT ECONOMY. YOUR RULES.</span><h2 className="mt-5 max-w-sm font-display text-5xl font-medium leading-[1.1]">A little autonomy.<br />A lot of control.</h2></div>
        <div className="absolute bottom-8 left-10 flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-primary" /> Guarded from request to delivery.</div>
      </section>
      <section className="flex items-center justify-center px-6 py-12 sm:px-12 lg:px-16"><div className="w-full max-w-sm animate-enter">{children}</div></section>
    </div>
    <footer className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-6 py-6 text-xs text-muted-foreground lg:px-10"><span>Payrail · Agent payment infrastructure</span><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary" /> PayPal Sandbox environment</span></footer>
  </div>;
}