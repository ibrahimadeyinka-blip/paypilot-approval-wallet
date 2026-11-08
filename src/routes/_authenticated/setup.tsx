import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, Circle, AlertCircle, ShieldCheck, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkSetup, explainSetup } from "@/lib/setup/setup.functions";

export const Route = createFileRoute("/_authenticated/setup")({
  head: () => ({ meta: [{ title: "Setup checks — Payrail" }, { name: "description", content: "Verify PayPal Sandbox credentials, database readiness, and agent payment safeguards." }, { property: "og:title", content: "Setup checks — Payrail" }, { property: "og:description", content: "Check your payment workspace and get AI-assisted configuration guidance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Setup,
});

function Setup() {
  const check = useServerFn(checkSetup);
  const explain = useServerFn(explainSetup);
  const [report, setReport] = useState<Awaited<ReturnType<typeof checkSetup>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  async function run() {
    setBusy(true); setError(""); setExplanation("");
    try { setReport(await check()); } catch (e) { setError(e instanceof Error ? e.message : "Setup checks could not finish."); }
    finally { setBusy(false); }
  }
  async function askAi() {
    setExplaining(true); setError("");
    try { setExplanation((await explain()).explanation); } catch (e) { setError(e instanceof Error ? e.message : "AI explanation unavailable."); }
    finally { setExplaining(false); }
  }
  return <main className="app-main">
    <div className="eyebrow">Workspace readiness</div><h1 className="page-heading mt-3">Setup checks</h1>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y py-5"><div className="flex items-center gap-3"><ShieldCheck className="size-6 text-signal" /><div><h2 className="font-semibold">PayPal Sandbox</h2><p className="mt-1 text-xs text-muted-foreground">No orders, holds, or payments are created by these checks.</p></div></div><Button onClick={run} disabled={busy || explaining}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}Run checks</Button></div>
    <div className="mt-5 divide-y">{(report?.checks ?? ["PayPal Sandbox credentials", "Database migration readiness", "Blank-payee safeguards", "Account database access", "AI configuration"].map((label) => ({ id: label, label, passed: false, detail: "Not checked" }))).map((c) => <section key={c.id} className="flex gap-4 py-6">{!report ? <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" /> : c.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-signal" /> : <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />}<div className="min-w-0"><h2 className="text-sm font-semibold">{c.label}</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{c.detail}</p></div></section>)}</div>
    {report && <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5"><p className="text-xs text-muted-foreground">Checked {new Date(report.checkedAt).toLocaleString()}</p><Button variant="outline" onClick={askAi} disabled={busy || explaining}>{explaining ? <Loader2 className="animate-spin" /> : <Sparkles />}Explain results with AI</Button></div>}
    {error && <p role="alert" className="mt-6 whitespace-pre-wrap text-sm text-destructive">{error}</p>}
    {explanation && <section className="mt-8 border-t pt-6"><h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-signal" />Configuration guidance</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{explanation}</p></section>}
  </main>;
}