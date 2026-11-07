import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Copy, FileText, Link2, RotateCcw, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes } from "@/lib/delivery/files";
import { verdictMeta } from "@/lib/agent/status";
import { captureHeldPayment, createDeliveryLink, releaseHeldPayment } from "@/lib/delivery/delivery.functions";

interface Deliverable {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_verdict: string;
  ai_notes: string | null;
  ai_confidence: number | null;
  uploaded_at: string;
  reviewed_at: string | null;
}

interface LinkRow {
  id: string;
  expires_at: string;
  used_at: string | null;
  revoked: boolean;
  created_at: string;
}

export interface DeliveryRequest {
  id: string;
  status: string;
  description: string;
  delivery_requirements: string | null;
  paypal_capture_id: string | null;
  paypal_capture_status: string | null;
  captured_at: string | null;
  captured_by: string | null;
  voided_at: string | null;
  settlement_error: string | null;
  deliverables: Deliverable[];
  delivery_links: LinkRow[];
}

const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

export function DeliveryPanel({ r }: { r: DeliveryRequest }) {
  const qc = useQueryClient();
  const createLink = useServerFn(createDeliveryLink);
  const capture = useServerFn(captureHeldPayment);
  const release = useServerFn(releaseHeldPayment);
  const [busy, setBusy] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [requirements, setRequirements] = useState(r.delivery_requirements ?? r.description);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const deliverables = [...r.deliverables].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const latest = deliverables[0];
  const now = Date.now();
  const activeLink = r.delivery_links.find((l) => !l.used_at && !l.revoked && new Date(l.expires_at).getTime() > now);
  const onHold = r.status === "authorized";
  const refresh = () => qc.invalidateQueries({ queryKey: ["agent_payment_requests"] });

  async function run(label: string, fn: () => Promise<{ status: string; message: string }>) {
    setBusy(label);
    try {
      const res = await fn();
      if (res.status === "captured" || res.status === "voided") toast.success(res.message);
      else if (["capture_failed", "authorized", "not_found"].includes(res.status)) toast.error(res.message);
      else toast(res.message);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function onCreateLink() {
    setBusy("link");
    try {
      const res = await createLink({ data: { requestId: r.id, requirements: requirements.trim(), days: 7 } });
      setNewLink(`${window.location.origin}${res.path}`);
      setShowLinkForm(false);
      toast.success("Upload link created. Send it to the merchant.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the link.");
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function viewFile(d: Deliverable) {
    const { data, error } = await supabase.storage.from("deliverables").createSignedUrl(d.storage_path, 300);
    if (error || !data) {
      toast.error("Could not open the file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const canOwnerCapture = onHold && latest && (latest.ai_verdict === "uncertain" || latest.ai_verdict === "approved");
  const needsNewUpload = onHold && (!latest || latest.ai_verdict === "rejected");

  return (
    <div className="space-y-4 border-t pt-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <FileText className="size-3.5" /> Delivery
      </div>

      {r.delivery_requirements && (
        <p className="text-sm">
          <span className="text-muted-foreground">Requirements: </span>
          {r.delivery_requirements}
        </p>
      )}

      {r.status === "captured" && (
        <Callout tone="success">
          Paid {when(r.captured_at)} — {r.captured_by === "owner" ? "you accepted the work" : "the AI review approved the work"}.
          {r.paypal_capture_id && (
            <>
              {" "}PayPal capture <span className="font-mono">{r.paypal_capture_id}</span>.
            </>
          )}
        </Callout>
      )}
      {r.status === "voided" && <Callout tone="muted">Hold released {when(r.voided_at)}. No funds were taken.</Callout>}
      {r.status === "capturing" && <Callout tone="muted">Releasing payment with PayPal… If this doesn't finish, press "Check again".</Callout>}
      {r.status === "voiding" && <Callout tone="muted">Releasing the hold with PayPal… If this doesn't finish, press "Retry".</Callout>}
      {r.settlement_error && r.status !== "captured" && r.status !== "voided" && (
        <Callout tone="destructive">{r.settlement_error}</Callout>
      )}

      {deliverables.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {activeLink ? `Waiting for the merchant to upload (link valid until ${when(activeLink.expires_at)}).` : "No file delivered yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {deliverables.map((d, i) => {
            const v = verdictMeta(d.ai_verdict);
            return (
              <li key={d.id} className={`rounded-md border p-3 ${i > 0 ? "opacity-70" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{d.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(d.size_bytes)} · uploaded {when(d.uploaded_at)}
                      {i > 0 ? " · earlier upload" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={v.tone}>{v.label}</Badge>
                    <Button variant="outline" size="sm" onClick={() => viewFile(d)}>
                      View file
                    </Button>
                  </div>
                </div>
                {d.ai_notes && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {d.ai_notes}
                    {d.ai_confidence != null ? ` (confidence ${Math.round(Number(d.ai_confidence) * 100)}%)` : ""}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {newLink && (
        <div className="space-y-2 rounded-md border border-primary/40 bg-accent p-3">
          <div className="text-sm font-medium text-accent-foreground">Send this link to the merchant. It's shown only once and works for one upload.</div>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded bg-card px-2 py-1.5 font-mono text-xs">{newLink}</code>
            <Button
              variant="outline"
              size="sm"
              aria-label="Copy delivery link" title="Copy delivery link"
              onClick={async () => {
                await navigator.clipboard.writeText(newLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </div>
      )}

      {showLinkForm && (
        <div className="space-y-2">
          <Label htmlFor={`req-${r.id}`}>What must the delivery contain?</Label>
          <Textarea id={`req-${r.id}`} value={requirements} onChange={(e) => setRequirements(e.target.value)} maxLength={2000} rows={3} />
          <p className="text-xs text-muted-foreground">The AI review checks the file against this. Payment is released automatically only if it clearly matches.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onCreateLink} disabled={busy !== null || requirements.trim().length < 5}>
              <Link2 className="size-4" /> Create upload link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowLinkForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canOwnerCapture && (
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm("Release the held payment to the merchant? This can't be undone.")) {
                void run("capture", () => capture({ data: { requestId: r.id } }));
              }
            }}
          >
            <Wallet className="size-4" /> {latest?.ai_verdict === "approved" ? "Retry releasing payment" : "Accept work & release payment"}
          </Button>
        )}
        {r.status === "capturing" && (
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("capture", () => capture({ data: { requestId: r.id } }))}>
            <RotateCcw className="size-4" /> Check again
          </Button>
        )}
        {onHold && !showLinkForm && (needsNewUpload || latest?.ai_verdict === "uncertain") && (
          <Button size="sm" variant={needsNewUpload ? "default" : "outline"} disabled={busy !== null} onClick={() => setShowLinkForm(true)}>
            <Link2 className="size-4" /> {activeLink || deliverables.length > 0 ? "Send a new upload link" : "Create upload link for merchant"}
          </Button>
        )}
        {(onHold || r.status === "voiding") && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => {
              if (r.status === "voiding" || window.confirm("Release the hold? The merchant won't be paid and the agent's request ends.")) {
                void run("void", () => release({ data: { requestId: r.id } }));
              }
            }}
          >
            <Undo2 className="size-4" /> {r.status === "voiding" ? "Retry releasing hold" : latest?.ai_verdict === "uncertain" ? "Reject & release hold" : "Release hold"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Callout({ tone, children }: { tone: "success" | "destructive" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "success"
      ? "border-primary/40 bg-accent text-accent-foreground"
      : tone === "destructive"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-foreground";
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
