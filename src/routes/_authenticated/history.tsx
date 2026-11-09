import { createFileRoute } from "@tanstack/react-router";
import { LedgerView } from "@/components/ledger-view";
import { ledgerQuery } from "@/lib/ledger";
export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Payment history — Vigil" }, { name: "description", content: "Review your agent payment decisions, delivery reviews, and NEAR escrow events." }, { property: "og:title", content: "Payment history — Vigil" }, { property: "og:description", content: "Your payment activity and audit trail." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(ledgerQuery),
  component: () => <LedgerView mode="history" />,
});