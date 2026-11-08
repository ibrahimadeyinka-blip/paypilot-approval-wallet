import type { DirectiveDraft } from "./directive";

export function canAutoSubmit(enabled: boolean, draft: DirectiveDraft) {
  return enabled && draft.ready && !!draft.merchant_handle.trim() && draft.amount_cents > 0;
}