import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { analyticsQuery, daily, funnel, type BlockKind } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [
    { title: "Agent analytics — Payrail" },
    { name: "description", content: "See how many agent requests were drafted, sent for approval, blocked by token limits and approved." },
    { property: "og:title", content: "Agent analytics — Payrail" },
    { property: "og:description", content: "Drafted, sent, blocked and approved agent requests at a glance." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(analyticsQuery),
  component: Analytics,
});

const REASONS: Record<BlockKind, string> = { single_cap: "Over per-payment cap", daily_budget: "Over 24h budget", merchant: "Merchant not approved", token: "Token expired or revoked", other: "Other" };

function Analytics() {
  const { data } = useSuspenseQuery(analyticsQuery);
  const f = funnel(data.drafts, data.history);
  const days = daily(data.drafts, data.history);
  const max = Math.max(1, ...days.map((d) => d.drafted + d.sent + d.blocked));
  const steps = [
    { label: "Drafted in chat", value: f.drafted, note: `${f.readyDrafts} ready to send` },
    { label: "Sent for approval", value: f.sent, note: "Passed every limit" },
    { label: "Blocked by limits", value: f.blocked, note: "Stopped before any hold", bad: true },
    { label: "Approved", value: f.approved, note: `${Math.round(f.approvalRate * 100)}% of sent` },
  ];
  const top = Math.max(1, ...steps.map((s) => s.value));
  const totalBlocked = Math.max(1, f.blocked);

  return <main className="app-main space-y-10">
    <div><span className="eyebrow">Live · refreshes every 20s</span><h1 className="page-heading mt-3">Agent analytics</h1><p className="mt-3 max-w-lg text-sm text-muted-foreground">Every request your agents make, from the first draft to your approval.</p></div>

    <section className="stagger grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => <div key={s.label} className="bg-card p-6">
        <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground"><span>0{i + 1}</span>{i > 0 && <span>→</span>}</div>
        <p className="mt-8 text-sm text-muted-foreground">{s.label}</p>
        <p className={`mt-1 text-5xl font-bold tabular-nums tracking-[-0.04em] ${s.bad ? "text-destructive" : ""}`}>{s.value}</p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all duration-1000 ${s.bad ? "bg-destructive" : i === 3 ? "bg-signal" : "bg-foreground"}`} style={{ width: `${(s.value / top) * 100}%` }} /></div>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">{s.note}</p>
      </div>)}
    </section>

    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <section className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="section-heading">Last 14 days</h2><div className="flex gap-4 font-mono text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-highlight" />Drafted</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground" />Sent</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-destructive" />Blocked</span></div></div>
        <div className="mt-8 flex h-44 items-end gap-1.5" role="img" aria-label="Requests per day for the last 14 days">
          {days.map((d, i) => <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.drafted} drafted, ${d.sent} sent, ${d.blocked} blocked`}>
            <div className="bar-grow flex flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${((d.drafted + d.sent + d.blocked) / max) * 100}%`, animationDelay: `${i * 35}ms` }}>
              <div className="bg-destructive" style={{ flex: d.blocked }} /><div className="bg-foreground" style={{ flex: d.sent }} /><div className="bg-highlight" style={{ flex: d.drafted }} />
            </div>
            <div className="mt-2 h-px bg-border" />
          </div>)}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground"><span>{days[0]?.day.slice(5)}</span><span>Today</span></div>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="section-heading">Why requests were blocked</h2>
        {f.blocked === 0 ? <div className="empty-state mt-6">Nothing blocked yet.</div> :
          <ul className="mt-6 space-y-4">{(Object.keys(REASONS) as BlockKind[]).filter((k) => f.reasons[k] > 0).map((k) => <li key={k}>
            <div className="flex justify-between text-sm"><span>{REASONS[k]}</span><span className="font-mono">{f.reasons[k]}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-destructive" style={{ width: `${(f.reasons[k] / totalBlocked) * 100}%` }} /></div>
          </li>)}</ul>}
      </section>
    </div>
  </main>;
}
