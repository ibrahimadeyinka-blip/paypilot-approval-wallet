/**
 * Shared delivery intake for one-time merchant links and verified contractor accounts:
 * stores the already-validated file privately, records it, runs the AI review and
 * captures only on an "approved" verdict (see settlement-flow.server).
 */
export interface DeliveryClaim {
  link_id: string | null;
  request_id: string;
  owner_id: string;
  vendor_name?: string;
  description?: string;
  requirements?: string | null;
  amount_cents?: number;
  currency?: string;
}

export type IntakeResult =
  | { ok: true; verdict: string; summary: string; payment: string }
  | { ok: false; error: string };

export async function storeAndReview(claim: DeliveryClaim, file: { bytes: Uint8Array; mime: string; filename: string }): Promise<IntakeResult> {
  const [{ getServerDeps }, { runReviewAndSettle }, { reviewWithVision, REVIEW_MODEL }] = await Promise.all([
    import("@/lib/server-deps.server"),
    import("./settlement-flow.server"),
    import("./vision.server"),
  ]);
  const deps = getServerDeps();
  const deliverableId = crypto.randomUUID();
  const path = `${claim.owner_id}/${claim.request_id}/${deliverableId}-${file.filename}`;
  try {
    const { error } = await deps.admin.storage.from("deliverables").upload(path, file.bytes, { contentType: file.mime, upsert: false });
    if (error) throw error;
    await deps.rpc("record_deliverable", {
      p_link_id: claim.link_id,
      p_request_id: claim.request_id,
      p_deliverable_id: deliverableId,
      p_storage_path: path,
      p_filename: file.filename,
      p_mime: file.mime,
      p_size: file.bytes.byteLength,
    });
  } catch (err) {
    console.error("deliverable upload failed", err);
    await deps.admin.storage.from("deliverables").remove([path]).catch(() => undefined);
    if (claim.link_id) await deps.rpc("release_delivery_link", { p_link_id: claim.link_id }).catch(() => undefined);
    return { ok: false, error: "We couldn't store your file. Please try again." };
  }

  const result = await runReviewAndSettle(
    {
      rpc: deps.rpc,
      paypal: deps.paypal,
      model: REVIEW_MODEL,
      review: () =>
        reviewWithVision({
          bytes: file.bytes,
          mime: file.mime as never,
          filename: file.filename,
          vendorName: claim.vendor_name ?? "",
          description: claim.description ?? "",
          requirements: claim.requirements ?? null,
          amountCents: claim.amount_cents ?? 0,
          currency: claim.currency ?? "NEAR",
        }),
    },
    { requestId: claim.request_id, deliverableId },
  );
  return { ok: true, verdict: result.verdict, summary: result.summary, payment: result.payment?.status ?? "held" };
}
