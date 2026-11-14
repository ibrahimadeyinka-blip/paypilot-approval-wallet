import { z } from "zod";
import { isTestnetPayee } from "@/lib/near/units";

/** What the AI drafts from the owner's chat directive. The owner confirms before anything is sent. */
export const directiveDraftSchema = z.object({
  ready: z.boolean(),
  question: z.string().max(500),
  vendor_name: z.string().max(120),
  merchant_handle: z.string().max(120),
  amount_cents: z.number().int().min(0).max(100_000_000),
  description: z.string().max(2000),
  delivery_requirements: z.string().max(2000),
});
export type DirectiveDraft = z.infer<typeof directiveDraftSchema>;

/** Conservative cleanup: any missing piece or unknown merchant turns the draft into a question. */
export function normalizeDraft(raw: unknown, allowlist: string[]): DirectiveDraft {
  const parsed = directiveDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ready: false, question: "I couldn't understand that. Who should do the work, and what's the budget?", vendor_name: "", merchant_handle: "", amount_cents: 0, description: "", delivery_requirements: "" };
  }
  const d = { ...parsed.data, merchant_handle: parsed.data.merchant_handle.trim().toLowerCase() };
  const allowed = allowlist.length === 0 || allowlist.includes(d.merchant_handle);
  if (d.merchant_handle && !isTestnetPayee(d.merchant_handle)) {
    return { ...d, ready: false, question: `"${d.merchant_handle}" isn't a NEAR account. What is the contractor's NEAR testnet account (for example designer.testnet)?` };
  }
  if (!d.merchant_handle || !allowed) {
    return {
      ...d,
      ready: false,
      question: allowlist.length
        ? `Which approved contractor should I hire? This token allows: ${allowlist.join(", ")}.`
        : "Which contractor should I hire? Give their NEAR testnet account, like designer.testnet.",
    };
  }
  const question = d.question.trim();
  if (d.amount_cents <= 0 || !d.description.trim() || !d.vendor_name.trim()) {
    const missing = [d.amount_cents <= 0 && "the budget in NEAR", !d.description.trim() && "what should be delivered", !d.vendor_name.trim() && "the contractor's name"].filter(Boolean).join(" and ");
    return { ...d, ready: false, question: question || `I still need ${missing}.` };
  }
  // Every field passed validation. Keep a real clarifying question, otherwise the draft is ready
  // (a "not ready" flag with no question used to produce an empty reply).
  if (!d.ready && question) return { ...d, question };
  return { ...d, ready: true, question: "" };
}
