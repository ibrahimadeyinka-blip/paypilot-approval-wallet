import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useWebMCP } from "use-webmcp-tool";
import { Download, Search, ChevronRight, X, History, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ledgerQuery, ledgerTotals, money, csvCell } from "@/lib/ledger";
import { statusMeta } from "@/lib/agent/status";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";

export function LedgerView({ mode }: { mode: "history" | "ledger" }) {
  const { data: rows } = useSuspenseQuery(ledgerQuery);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = rows.filter(r => (status === "all" || r.status === status) && `${r.vendor_name} ${r.merchant_handle} ${r.description} ${r.id}`.toLowerCase().includes(search.toLowerCase()));
  const selected = visible.find(r => r.id === selectedId);
  const totals = ledgerTotals(visible);
  useWebMCP({
    name: "read_payment_history",
    description: "Read the payments in the currently visible history or ledger view.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => runWebMCPTool("read_payment_history", () => visible.length ? visible.map(r => `${r.id}: ${r.vendor_name}, ${money(r.amount_cents, r.currency)}, ${statusMeta(r.status).label}`).join("\n") : "No payments in the current view."),
  });
  function exportRows() {
    const header = ["Request ID", "Created", "Merchant", "Amount cents", "Currency", "Status", "PayPal order", "Authorization", "Capture", "Capture status"];
    const lines = visible.map(r => [r.id, r.created_at, r.vendor_name, r.amount_cents, r.currency, r.status, r.paypal_order_id, r.paypal_authorization_id, r.paypal_capture_id, r.paypal_capture_status]);
    const url = URL.createObjectURL(new Blob(["\uFEFF" + [header, ...lines].map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "payrail-ledger.csv"; a.click(); URL.revokeObjectURL(url);
  }
  const timeline = selected ? [
    ...selected.agent_history.map(e => ({ id: e.id, created_at: e.created_at, actor: e.actor, title: e.event === "imported_snapshot" ? "Existing payment snapshot" : `${statusMeta(e.to_status).label}`, detail: e.detail, metadata: e.metadata })),
    ...(selected.transactions?.audit_timeline ?? []).map(e => ({ id: e.id, created_at: e.created_at, actor: e.actor, title: e.title, detail: e.detail, metadata: e.metadata })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) : [];
  const Icon = mode === "history" ? History : ReceiptText;
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><Icon className="size-6 text-primary" /><h1 className="text-2xl font-bold">{mode === "history" ? "Payment history" : "Ledger"}</h1></div>
      <Button variant="outline" size="sm" onClick={exportRows} disabled={!visible.length}><Download className="size-4" />Export CSV</Button>
    </div>
    {mode === "ledger" && <div className="grid grid-cols-2 gap-5 border-y py-5 sm:grid-cols-4">
      {[ ["On hold", totals.held], ["Confirmed payments", totals.paid], ["Holds released", totals.released], ["Capture unconfirmed", totals.unconfirmed] ].map(([label, amount]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-xl font-semibold">{money(Number(amount))}</p></div>)}
    </div>}
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search payments" placeholder="Search merchant or request" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <select aria-label="Payment status" className="h-9 max-w-full rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="all">All statuses</option>{[...new Set(rows.map(r => r.status))].map(s => <option key={s} value={s}>{statusMeta(s).label}</option>)}
      </select>
      {(search || status !== "all") && <Button variant="ghost" size="icon" aria-label="Clear filters" onClick={() => { setSearch(""); setStatus("all"); }}><X className="size-4" /></Button>}
    </div>
    <div className="flex justify-between text-xs text-muted-foreground"><span>{visible.length} payments</span>{rows.length === 500 && <span>Latest 500 requests</span>}<Badge variant="outline">PayPal Sandbox</Badge></div>
    {!visible.length ? <div className="border-y py-14 text-center text-muted-foreground"><Icon className="mx-auto mb-3 size-8" /><p>{rows.length ? "No payments match your filters." : "No payment requests yet."}</p></div> : <div className="overflow-x-auto border-y">
      <table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-3">Created</th><th className="px-3 py-3">Merchant</th><th className="px-3 py-3 text-right">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"><span className="sr-only">Details</span></th></tr></thead>
        <tbody>{visible.map(r => <tr key={r.id} className="border-t"><td className="whitespace-nowrap px-3 py-4 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td><td className="min-w-40 px-3 py-4"><p className="font-medium">{r.vendor_name}</p><p className="mt-1 max-w-64 truncate text-xs text-muted-foreground">{r.description}</p></td><td className="whitespace-nowrap px-3 py-4 text-right font-mono">{money(r.amount_cents, r.currency)}</td><td className="px-3 py-4"><Badge variant={statusMeta(r.status).tone}>{statusMeta(r.status).label}</Badge></td><td className="px-3 py-4"><Button variant="ghost" size="icon" aria-label={`View ${r.vendor_name} history`} onClick={() => setSelectedId(r.id)}><ChevronRight className="size-4" /></Button></td></tr>)}</tbody>
      </table>
    </div>}
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.vendor_name} — payment history</DialogTitle></DialogHeader>
      {selected && <><div className="flex items-center gap-3"><span className="font-mono text-xl">{money(selected.amount_cents, selected.currency)}</span><Badge variant={statusMeta(selected.status).tone}>{statusMeta(selected.status).label}</Badge></div>
        <p className="break-words text-sm">{selected.description}</p>
        <dl className="grid gap-2 border-y py-3 text-xs">{[["Request", selected.id], ["PayPal order", selected.paypal_order_id], ["Authorization", selected.paypal_authorization_id], ["Capture", selected.paypal_capture_id], ["Capture status", selected.paypal_capture_status]].filter(([, v]) => v).map(([k, v]) => <div key={k} className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="break-all font-mono">{v}</dd></div>)}</dl>
        <div><p className="mb-2 text-xs font-medium text-muted-foreground">Agent-provided source</p><blockquote className="break-words border-l-2 pl-3 text-sm">{selected.source_context}</blockquote></div>
        <ol className="space-y-5 border-l pl-4">{timeline.map(e => <li key={e.id}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{e.title}</p><Badge variant="outline">{e.actor}</Badge></div><time className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</time>{e.detail && <p className="mt-2 break-words text-sm text-muted-foreground">{e.detail}</p>}<details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Event metadata</summary><pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-muted p-3">{JSON.stringify(e.metadata, null, 2)}</pre></details></li>)}</ol>
      </>}
    </DialogContent></Dialog>
  </main>;
}