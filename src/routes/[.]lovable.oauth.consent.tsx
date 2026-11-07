import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type AuthorizationDetails = { client?: { name?: string }; redirect_uri?: string; scope?: string; scopes?: string[]; redirect_url?: string; redirect_to?: string };
export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({ meta: [{ title: "Connect your account — Payrail" }, { name: "description", content: "Review and approve an external assistant's access to your Payrail account." }, { property: "og:title", content: "Connect your account — Payrail" }, { property: "og:description", content: "Secure account connection consent." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "" }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing its authorization request.");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { redirect: location.pathname + location.searchStr + location.hash } });
    return { accountEmail: data.user.email };
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!id) throw new Error("This connection link is invalid.");
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error) throw new Error("This connection request is invalid, expired, or unavailable. Start the connection again.");
    const details = data as AuthorizationDetails | null;
    const target = details?.redirect_url ?? details?.redirect_to;
    if (target && !details?.client) throw redirect({ href: target });
    if (!details?.client) throw new Error("The connection request could not be loaded.");
    return details;
  },
  errorComponent: ({ error }) => <main className="mx-auto max-w-lg px-6 py-16"><h1 className="text-xl font-semibold">Connection unavailable</h1><p role="alert" className="mt-3 text-muted-foreground">{error.message}</p></main>,
  component: Consent,
});
function Consent() {
  const details = Route.useLoaderData();
  const { accountEmail } = Route.useRouteContext();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = details.client?.name ?? "External assistant";
  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    try {
      const { data, error } = approve ? await supabase.auth.oauth.approveAuthorization(authorization_id) : await supabase.auth.oauth.denyAuthorization(authorization_id);
      if (error) throw error;
      const result = data as { redirect_url?: string; redirect_to?: string } | null;
      const target = result?.redirect_url ?? result?.redirect_to;
      if (!target) throw new Error("The connection service did not return a destination.");
      window.location.href = target;
    } catch {
      setError(approve ? "Could not approve the connection. Please try again." : "Could not cancel the connection. Please try again."); setBusy(false);
    }
  }
  const scopes = details.scopes ?? (details.scope ?? "").split(" ").filter(Boolean);
  return <main className="mx-auto max-w-lg space-y-6 px-6 py-16"><p className="font-semibold text-primary">Payrail</p><h1 className="text-2xl font-bold">Connect {client} to Payrail</h1><p className="break-all text-sm text-muted-foreground">{accountEmail}</p>
    <p>This lets {client} use this app as you.</p>
    <dl className="space-y-3 border-y py-4 text-sm"><div><dt className="text-muted-foreground">Client</dt><dd>{client}</dd></div>{details.redirect_uri && <div><dt className="text-muted-foreground">Return address</dt><dd className="break-all">{details.redirect_uri}</dd></div>}</dl>
    <ul className="space-y-2 text-sm"><li>Read your payment requests and history.</li><li>No approval, capture, or hold-release tools.</li>{scopes.map(scope => <li key={scope}>{({ openid: "Identify your account", email: "Share your email address", profile: "Share your basic profile" } as Record<string, string>)[scope] ?? `Additional permission requested: ${scope}`}</li>)}</ul>
    <p className="text-sm text-muted-foreground">This does not bypass your account's permissions or access rules.</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex gap-3"><Button disabled={busy} onClick={() => decide(true)}>Approve connection</Button><Button variant="outline" disabled={busy} onClick={() => decide(false)}>Cancel connection</Button></div>
  </main>;
}