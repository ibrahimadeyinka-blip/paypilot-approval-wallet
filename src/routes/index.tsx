import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRound, Lock, ShieldCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Payrail — guarded payments for AI agents" },
      { name: "description", content: "Issue revocable agent tokens with server-enforced caps, daily budgets, and merchant allowlists." },
      { property: "og:title", content: "Payrail — guarded payments for AI agents" },
      { property: "og:description", content: "Issue revocable agent tokens with server-enforced caps, daily budgets, and merchant allowlists." },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Timer, title: "Short-lived tokens", body: "1, 7, or 30 days. Revoke any time — it stops working instantly." },
  { icon: Lock, title: "Hard limits", body: "$100 per payment and $500 per rolling day, checked on the server." },
  { icon: ShieldCheck, title: "Approved merchants only", body: "Requests to anyone not on your list are blocked and logged." },
];

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-20">
        <div className="mb-6 flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyRound className="size-4" />
          </span>
          Payrail
        </div>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight md:text-5xl">
          Let your AI agent pay — inside limits you set.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Every request your agent makes is checked against your budget and merchant list before it reaches you for approval.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/wallet">Open Agent Wallet</Link></Button>
          <Button asChild size="lg" variant="outline"><Link to="/auth">Sign in</Link></Button>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
