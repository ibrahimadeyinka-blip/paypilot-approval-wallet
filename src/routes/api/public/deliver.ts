import { createFileRoute } from "@tanstack/react-router";
import { sha256Hex } from "@/lib/agent/gateway-input";
import { checkDeliverable, MAX_DELIVERABLE_BYTES, safeFilename } from "@/lib/delivery/files";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const LINK_ERRORS: Record<string, [string, number]> = {
  not_found: ["This upload link isn't valid.", 404],
  revoked: ["This upload link was replaced or cancelled. Ask the buyer for a new one.", 410],
  used: ["A file was already uploaded with this link. Ask the buyer for a new link to send another.", 410],
  expired: ["This upload link has expired. Ask the buyer for a new one.", 410],
  closed: ["This payment is no longer waiting for a delivery.", 410],
};

/**
 * Merchant upload. Public on purpose (merchants have no account): the caller is
 * authorized by a one-time link token, stored only as a hash and locked when claimed.
 */
export const Route = createFileRoute("/api/public/deliver")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > MAX_DELIVERABLE_BYTES + 64 * 1024) return json({ error: "The file is larger than 10 MB." }, 413);

        const form = await request.formData().catch(() => null);
        const token = form?.get("token");
        const file = form?.get("file");
        if (typeof token !== "string" || !/^[a-f0-9]{48}$/.test(token)) return json({ error: "This upload link isn't valid." }, 400);
        if (!(file instanceof File)) return json({ error: "Choose a file to upload." }, 400);

        const bytes = new Uint8Array(await file.arrayBuffer());
        const check = checkDeliverable(bytes);
        if (!check.ok) return json({ error: check.error }, 400);
        const filename = safeFilename(file.name);

        const [{ getServerDeps }, { storeAndReview }] = await Promise.all([
          import("@/lib/server-deps.server"),
          import("@/lib/delivery/intake.server"),
        ]);
        const claim = (await getServerDeps().rpc("claim_delivery_link", { p_token_hash: await sha256Hex(token) })) as {
          outcome: string;
          link_id: string;
          request_id: string;
          owner_id: string;
          vendor_name?: string;
          description?: string;
          requirements?: string | null;
          amount_cents?: number;
          currency?: string;
        };
        if (claim.outcome !== "claimed") {
          const [msg, status] = LINK_ERRORS[claim.outcome] ?? ["This upload link can't be used.", 400];
          return json({ error: msg }, status);
        }

        const result = await storeAndReview(claim, { bytes, mime: check.mime, filename });
        if (!result.ok) return json({ error: result.error }, 500);
        return json({ received: true, verdict: result.verdict, summary: result.summary, payment: result.payment }, 200);
      },
    },
  },
});
