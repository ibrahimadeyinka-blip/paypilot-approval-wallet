import { createFileRoute } from "@tanstack/react-router";
import { LedgerView } from "@/components/ledger-view";
import { ledgerQuery } from "@/lib/ledger";
export const Route = createFileRoute("/_authenticated/ledger")({
  head: () => ({ meta: [{ title: "Ledger — Vigil" }, { name: "description", content: "Reconcile authorization holds, confirmed captures, and released holds with a downloadable ledger." }, { property: "og:title", content: "Ledger — Vigil" }, { property: "og:description", content: "Payment accounting and PayPal Sandbox references." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ledgerQuery),
  component: () => <LedgerView mode="ledger" />,
});