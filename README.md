# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Slice 4 release checks

- History and Ledger show up to 500 current-account requests, searchable by merchant or request ID. Details combine pre-authorization state changes with delivery and PayPal audit events; CSV exports retain integer cents and neutralize spreadsheet formulas.
- `/mcp` exposes `list_payments` and `payment_history` through OAuth. It has no payment, token, or delivery-link mutations. OAuth consent uses `/.lovable/oauth/consent` and preserves its return path through login and email confirmation.
- Lovable Cloud was already connected; its OAuth authorization server was enabled for this slice. The remix's inherited migration files were reset to the verified empty baseline before applying the new history changes.
- 54 regression tests passed. Public browser probes verified sign-in redirects for History/Ledger, consent return preservation, a readable missing-consent error, and 401 responses for unauthenticated MCP/gateway requests.
- Full signed-in and external OAuth checks remain pending: this remix has no auth users. Create and confirm an account, then verify token issuance → gateway request → Approvals → History/Ledger details → CSV download; repeat from another account to verify isolation.
- Real payment checks require securely configured `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` for a Sandbox application. Run an authorization, merchant upload, approved review and capture; then a second request with a rejected/uncertain review and owner hold release. Confirm matching PayPal references and history events, retry each step, and verify no duplicate payment. Never use fabricated PayPal references as release evidence.
- External OAuth checks: connect a client, approve and deny consent, verify expired requests and failed decisions, reject app-session JWTs without an OAuth client claim, and ensure tools only return the connected user's rows.
- Importing old Bolt users and records still requires their exports; this release does not contain that data.
