import { ToolLoopAgent, tool, isStepCount, hasToolCall, jsonSchema } from "ai";
import { normalizeDraft, type DirectiveDraft } from "./directive";
import { createResponsesCall } from "@/lib/ai/responses.server";
import { createOpenAI } from "@ai-sdk/openai";
import { createLovableAiGatewayRunIdFetch } from "@/lib/ai/gateway-run-id.server";
import type { ModelMessage } from "ai";

export async function runPurchasingAgent(apiKey: string, messages: ModelMessage[], token: { merchant_whitelist: string[]; single_cap_cents: number }, instructions: string) {
  const run = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: run.fetch });
  let proposal: DirectiveDraft | null = null;
  const activity: string[] = [];
  const agent = new ToolLoopAgent({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: `${instructions}\nRead spending_policy, then call propose_request with the extracted draft (even if incomplete). These tools only read policy and propose requests. You cannot move funds, approve PayPal, discover contractors, or claim a payment is complete.`,
    maxRetries: 0,
    stopWhen: [isStepCount(50), hasToolCall("propose_request")],
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
    tools: {
      spending_policy: tool({ description: "Read the selected token's spending and payee rules.", inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {}, required: [], additionalProperties: false }), execute: async () => { activity.push("Read token safeguards"); return { single_cap_cents: token.single_cap_cents, allowed_payees: token.merchant_whitelist, owner_approval_required: true }; } }),
      propose_request: tool({ description: "Prepare one payment proposal or a clarification question. Does not submit or move money.", inputSchema: jsonSchema<DirectiveDraft>({ type: "object", additionalProperties: false, required: ["ready", "question", "vendor_name", "merchant_handle", "amount_cents", "description", "delivery_requirements"], properties: { ready: { type: "boolean" }, question: { type: "string" }, vendor_name: { type: "string" }, merchant_handle: { type: "string" }, amount_cents: { type: "integer" }, description: { type: "string" }, delivery_requirements: { type: "string" } } }), execute: async (input) => { proposal = normalizeDraft(input, token.merchant_whitelist); activity.push(proposal.ready ? "Prepared contractor request" : "Requested missing details"); return { ready: proposal.ready }; } }),
    },
  });
  const result = await agent.stream({ messages });
  await result.consumeStream();
  if (!proposal) throw new Error("The agent did not prepare a proposal. No request was submitted.");
  return { draft: proposal as DirectiveDraft, activity };
}