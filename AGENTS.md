<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Agent payment guardrails (single cap, rolling 24h budget, merchant allowlist, token expiry/revocation, idempotency) are enforced only inside the `submit_agent_payment` database function, called by `/api/public/agent-gateway`; the function locks the token row so concurrent requests serialize. Why: one atomic, server-side source of truth that cannot be bypassed or raced.
- Requests that are pending, waiting on PayPal, or holding funds all count toward the 24h budget (`agent_budget_statuses()`); failed, declined and blocked ones don't. Why: open requests reserve budget so approval can't exceed the limit.
- Agent tokens are stored only as SHA-256 hashes; the plaintext is shown once at issue time. Why: a database leak must not leak usable tokens.
- Owner approval and PayPal holds run through `begin_/check_/attach_/fail_/record_agent_authorization` database functions (service_role only) orchestrated by `src/lib/agent/approval-flow.server.ts`; each re-checks token, expiry, merchant, amount, budget and status under row locks. Why: the hold can't be placed after a token is revoked or a request is declined.
- Every PayPal call sends a PayPal-Request-Id derived from `request id + attempt + step`, and the PayPal client is hard-wired to the Sandbox API. Why: retries and double clicks can't create duplicate orders or holds, and live money can't be touched.
- Payments are described as an authorization hold followed by conditional capture, never "escrow". Why: PayPal Orders AUTHORIZE is not an escrow product.
- `/paypal/return` is public and completes by PayPal order id. Why: PayPal may return the owner in a new tab without the app session; the order id is unguessable and the database re-checks safeguards.
