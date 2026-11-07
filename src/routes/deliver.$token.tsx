import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Clock, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDeliveryLinkInfo } from "@/lib/delivery/delivery.functions";
import { ACCEPT_ATTR, checkDeliverable, formatBytes, MAX_DELIVERABLE_BYTES } from "@/lib/delivery/files";

const linkQuery = (token: string) =>
  queryOptions({ queryKey: ["delivery_link", token], queryFn: () => getDeliveryLinkInfo({ data: { token } }) });

export const Route = createFileRoute("/deliver/$token")({
  head: () => ({
    meta: [
      { title: "Deliver your work — Payrail" },
      { name: "description", content: "Upload the finished work for a payment that is on hold." },
      { property: "og:title", content: "Deliver your work — Payrail" },
      { property: "og:description", content: "Upload the finished work for a payment that is on hold." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(linkQuery(params.token)),
  component: DeliverPage,
});

const STATE_COPY: Record<string, string> = {
  not_found: "This upload link isn't valid. Check you copied the whole link.",
  used: "A file was already uploaded with this link. Ask the buyer for a new link to send another.",
  expired: "This upload link has expired. Ask the buyer for a new one.",
  revoked: "This upload link was replaced or cancelled. Ask the buyer for the newest link.",
  closed: "This payment is no longer waiting for a delivery.",
};

type Result = { verdict: string; summary: string; payment: string };

function DeliverPage() {
  const { token } = Route.useParams();
  const { data: info } = useSuspenseQuery(linkQuery(token));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    const local = checkDeliverable(new Uint8Array(await file.arrayBuffer()));
    if (!local.ok) return setError(local.error);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("file", file);
      const res = await fetch("/api/public/deliver", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok) setError(body.error ?? "Upload failed. Please try again.");
      else setResult(body as Result);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-6 py-16">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-sm font-semibold tracking-tight text-muted-foreground">Payrail · delivery</div>

        {info.state !== "active" && !result ? (
          <div className="rounded-xl border bg-card p-6">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <p className="text-sm">{STATE_COPY[info.state] ?? STATE_COPY["not_found"]}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 rounded-xl border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">{info.vendorName}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
                </div>
                {info.amountCents != null && (
                  <div className="font-mono text-xl font-semibold tabular-nums">
                    {info.currency === "USD" ? "$" : `${info.currency} `}
                    {(info.amountCents / 100).toFixed(2)}
                  </div>
                )}
              </div>
              {info.requirements && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What the buyer needs</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{info.requirements}</p>
                </div>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" /> The payment is on hold. It's released once your file is reviewed and accepted.
                {info.expiresAt ? ` Link valid until ${new Date(info.expiresAt).toLocaleDateString()}.` : ""}
              </p>
            </div>

            {result ? (
              <ResultCard result={result} />
            ) : (
              <form onSubmit={onSubmit} className="space-y-4 rounded-xl border bg-card p-6">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center hover:bg-muted/50">
                  <Upload className="size-6 text-muted-foreground" />
                  <span className="text-sm font-medium">{file ? file.name : "Choose your file"}</span>
                  <span className="text-xs text-muted-foreground">
                    {file ? formatBytes(file.size) : `PNG, JPEG, WebP or PDF · up to ${MAX_DELIVERABLE_BYTES / 1024 / 1024} MB · one upload per link`}
                  </span>
                  <input
                    type="file"
                    accept={ACCEPT_ATTR}
                    className="sr-only"
                    aria-label="Deliverable file"
                    onChange={(e) => {
                      setError(null);
                      setFile(e.target.files?.[0] ?? null);
                    }}
                  />
                </label>
                {error && (
                  <p className="flex items-start gap-2 text-sm text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={!file || busy}>
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Uploading and reviewing…
                    </>
                  ) : (
                    "Submit delivery"
                  )}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function ResultCard({ result }: { result: Result }) {
  const paid = result.payment === "captured";
  const accepted = result.verdict === "approved";
  const rejected = result.verdict === "rejected";
  const title = paid
    ? "Accepted — payment released"
    : accepted
      ? "Accepted — payment is being released"
      : rejected
        ? "Received, but it doesn't seem to match"
        : "Received — the buyer will review it";
  const body = paid
    ? "Your file met the requirements and the held payment was released."
    : accepted
      ? "Your file met the requirements. The buyer will finish releasing the payment."
      : rejected
        ? "The buyer has been told. They may send you a new link to try again."
        : "The automatic check couldn't decide, so the buyer will look at it themselves.";
  return (
    <div className="space-y-2 rounded-xl border bg-card p-6">
      <div className="flex items-center gap-2 font-semibold">
        {accepted ? <CheckCircle2 className="size-5 text-primary" /> : rejected ? <XCircle className="size-5 text-destructive" /> : <Clock className="size-5 text-muted-foreground" />}
        {title}
      </div>
      <p className="text-sm text-muted-foreground">{body}</p>
      {result.summary && <p className="rounded-md bg-muted px-3 py-2 text-sm">{result.summary}</p>}
    </div>
  );
}
