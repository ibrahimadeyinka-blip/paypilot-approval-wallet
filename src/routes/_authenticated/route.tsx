import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { KeyRound, LogOut, ShieldCheck, History, ReceiptText, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PayrailBrand } from "@/components/payrail-brand";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const links = [
  { to: "/wallet", label: "Agent Wallet", icon: KeyRound },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck },
  { to: "/history", label: "History", icon: History },
  { to: "/ledger", label: "Ledger", icon: ReceiptText },
] as const;
function AuthedLayout() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  return <div className="min-h-screen bg-background lg:grid lg:grid-cols-[232px_1fr]">
    <aside className="flex flex-col border-b bg-card lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-5 py-6 lg:px-7 lg:py-9"><Link to="/"><PayrailBrand /></Link><span className="rounded border px-2 py-1 font-mono text-[9px] text-muted-foreground lg:hidden">SANDBOX</span></div>
      <div className="hidden px-7 pb-4 font-mono text-[10px] text-muted-foreground lg:block">WORKSPACE</div>
      <nav aria-label="Workspace navigation" className="grid grid-cols-4 gap-1 px-3 pb-4 lg:grid-cols-1 lg:px-4">{links.map(({to,label,icon: Icon}) => <Link key={to} to={to} className="flex flex-col items-center gap-2 rounded-md px-2 py-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex-row lg:gap-3 lg:px-3 lg:text-sm" activeProps={{className:"bg-accent text-primary"}}><Icon className="size-[18px]" />{label}</Link>)}</nav>
      <div className="mt-auto hidden space-y-5 px-6 pb-6 lg:block"><div className="border-t pt-5"><div className="flex items-center gap-2 text-xs font-medium"><span className="size-1.5 rounded-full bg-primary" /> PayPal Sandbox</div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Authorization holds.<br />Conditional payment capture.</p></div><Link to="/" className="flex items-center justify-between text-xs text-muted-foreground">About Payrail <ArrowUpRight className="size-3.5" /></Link></div>
    </aside>
    <div className="min-w-0"><header className="flex h-16 items-center justify-between gap-3 border-b px-5 lg:px-9"><span className="font-mono text-[10px] text-muted-foreground">PAYRAIL / CONSOLE</span><div className="flex min-w-0 items-center gap-3"><span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:block">{user.email}</span><Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}><LogOut className="size-4" /><span className="hidden sm:inline">Sign out</span></Button></div></header><div className="animate-enter"><Outlet /></div></div>
  </div>;
}
