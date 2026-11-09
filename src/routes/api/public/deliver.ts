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

        const [{ getServerDeps }, { runReviewAndSettle }, { reviewWithVision, REVIEW_MODEL }] = await Promise.all([
          import("@/lib/server-deps.server"),
          import("@/lib/delivery/settlement-flow.server"),
          import("@/lib/delivery/vision.server"),
        ]);
        const deps = getServerDeps();

        const claim = (await deps.rpc("claim_delivery_link", { p_token_hash: await sha256Hex(token) })) as {
          outcome: string;
          link_id?: string;
          request_id?: string;
          owner_id?: string;
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

        const deliverableId = crypto.randomUUID();
        const path = `${claim.owner_id}/${claim.request_id}/${deliverableId}-${filename}`;
        try {
          const { error } = await deps.admin.storage.from("deliverables").upload(path, bytes, { contentType: check.mime, upsert: false });
          if (error) throw error;
          await deps.rpc("record_deliverable", {
            p_link_id: claim.link_id,
            p_request_id: claim.request_id,
            p_deliverable_id: deliverableId,
            p_storage_path: path,
            p_filename: filename,
            p_mime: check.mime,
            p_size: bytes.byteLength,
          });
        } catch (err) {
          console.error("deliverable upload failed", err);
          await deps.admin.storage.from("deliverables").remove([path]).catch(() => undefined);
          await deps.rpc("release_delivery_link", { p_link_id: claim.link_id }).catch(() => undefined);
          return json({ error: "We couldn't store your file. Please try again." }, 500);
        }

        const result = await runReviewAndSettle(
          {
            rpc: deps.rpc,
            paypal: deps.paypal,
            model: REVIEW_MODEL,
            review: () =>
              reviewWithVision({
                bytes,
                mime: check.mime,
                filename,
                vendorName: claim.vendor_name ?? "",
                description: claim.description ?? "",
                requirements: claim.requirements ?? null,
                amountCents: claim.amount_cents ?? 0,
                currency: claim.currency ?? "NEAR",
              }),
          },
          { requestId: claim.request_id as string, deliverableId },
        );

        return json(
          { received: true, verdict: result.verdict, summary: result.summary, payment: result.payment?.status ?? "held" },
          200,
        );
      },
    },
  },
});
