import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isTestnetPayee } from "@/lib/near/units";
import { base64ToBytes, isFreshLink, LINK_RECIPIENT, parseLinkMessage } from "./link-message";

/**
 * Links the caller's NEAR testnet payout account after their wallet signs a NEP-413
 * message naming this Vigil user. The key must be a full-access key of the account.
 */
export const linkContractorAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      accountId: z.string().trim().toLowerCase().max(64),
      publicKey: z.string().max(120),
      signature: z.string().max(200),
      nonce: z.string().max(64),
      message: z.string().max(400),
      callbackUrl: z.string().url().max(500).nullable(),
      displayName: z.string().trim().max(80),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const parsed = parseLinkMessage(data.message);
    if (!parsed || parsed.userId !== context.userId || parsed.accountId !== data.accountId) throw new Error("The signed message doesn't match this account. Try again.");
    if (!isFreshLink(parsed.issuedAt)) throw new Error("That signature expired. Sign again.");
    if (!isTestnetPayee(data.accountId) || !data.accountId.endsWith(".testnet")) throw new Error("Use a named NEAR testnet account, like yourname.testnet.");
    const nonce = base64ToBytes(data.nonce);
    const { verifyNep413, isFullAccessKey } = await import("./verify.server");
    const valid = await verifyNep413({ message: data.message, nonce, recipient: LINK_RECIPIENT, callbackUrl: data.callbackUrl, publicKey: data.publicKey, signature: data.signature });
    if (!valid) throw new Error("The wallet signature couldn't be verified.");
    if (!(await isFullAccessKey(data.accountId, data.publicKey))) throw new Error(`That key doesn't control ${data.accountId} on NEAR testnet.`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("link_contractor_account", {
      p_user_id: context.userId, p_account: data.accountId, p_public_key: data.publicKey, p_display_name: data.displayName,
    });
    if (error) throw new Error("Couldn't save your payout account.");
    return { accountId: data.accountId };
  });

const CLAIM_ERRORS: Record<string, string> = {
  no_account: "Link your NEAR payout account first.",
  not_found: "This job isn't addressed to your payout account.",
  closed: "This job is no longer waiting for a delivery.",
  busy: "Your last file is still being reviewed. Try again in a minute.",
  limit: "This job already has 5 deliveries. Ask the client to review them.",
};

/** Verified contractor uploads work for a funded job. Same storage, AI review and conditional payout as upload links. */
export const submitContractorDeliverable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Choose a file to upload.");
    const requestId = z.string().uuid().parse(d.get("requestId"));
    const file = d.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");
    return { requestId, file };
  })
  .handler(async ({ data, context }) => {
    const { checkDeliverable, safeFilename } = await import("@/lib/delivery/files");
    const bytes = new Uint8Array(await data.file.arrayBuffer());
    const check = checkDeliverable(bytes);
    if (!check.ok) throw new Error(check.error);
    const [{ getServerDeps }, { storeAndReview }] = await Promise.all([
      import("@/lib/server-deps.server"),
      import("@/lib/delivery/intake.server"),
    ]);
    const claim = (await getServerDeps().rpc("claim_contractor_delivery", { p_user_id: context.userId, p_request_id: data.requestId })) as {
      outcome: string; link_id: null; request_id: string; owner_id: string;
      vendor_name?: string; description?: string; requirements?: string | null; amount_cents?: number; currency?: string;
    };
    if (claim.outcome !== "claimed") throw new Error(CLAIM_ERRORS[claim.outcome] ?? "This job can't take a delivery right now.");
    const result = await storeAndReview(claim, { bytes, mime: check.mime, filename: safeFilename(data.file.name) });
    if (!result.ok) throw new Error(result.error);
    return { verdict: result.verdict, summary: result.summary, payment: result.payment };
  });
