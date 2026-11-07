import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { KeyRound, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const navLink =
  "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

function AuthedLayout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <Link to="/wallet" className="flex items-center gap-2 font-semibold">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <KeyRound className="size-4" />
              </span>
              Payrail
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              <Link to="/wallet" className={navLink} activeProps={{ className: "bg-muted text-foreground" }}>
                Agent Wallet
              </Link>
              <Link to="/approvals" className={navLink} activeProps={{ className: "bg-muted text-foreground" }}>
                Approvals
              </Link>
              <Link to="/history" className={navLink} activeProps={{ className: "bg-muted text-foreground" }}>History</Link>
              <Link to="/ledger" className={navLink} activeProps={{ className: "bg-muted text-foreground" }}>Ledger</Link>
            </nav>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
