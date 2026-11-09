import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkSetup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const checks: { id: string; label: string; passed: boolean; detail: string }[] = [];
  const { verifyEscrowAccount } = await import("@/lib/near/client.server");
  const { yoctoToNear } = await import("@/lib/near/units");
  try { const { balanceYocto } = await verifyEscrowAccount(); checks.push({ id: "near", label: "NEAR testnet escrow account", passed: true, detail: `Escrow account is reachable on NEAR testnet with ${yoctoToNear(balanceYocto)} NEAR available. Nothing was sent.` }); }
  catch (err) { checks.push({ id: "near", label: "NEAR testnet escrow account", passed: false, detail: `${err instanceof Error ? err.message : "Escrow check failed."} Set NEAR_ESCROW_ACCOUNT_ID and NEAR_ESCROW_PRIVATE_KEY in Project Settings → Secrets and fund the account from the testnet faucet.` }); }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("payrail_setup_checks");
  const c = data as { schema_ready?: boolean; blank_payees_allowed?: boolean; restricted_payees_blocked?: boolean; cap_enforced?: boolean; submission_blank_guard?: boolean } | null;
  checks.push({ id: "database", label: "Database migration readiness", passed: !error && c?.schema_ready === true, detail: !error && c?.schema_ready ? "Required app tables and the setup-check function are available. This checks the applied schema, not historical migration files." : "Required schema or the setup-check function is unavailable. Ask Lovable to apply the missing setup changes; do not clear existing data." });
  checks.push({ id: "payees", label: "Blank-payee safeguards", passed: !error && c?.blank_payees_allowed === true && c.restricted_payees_blocked === true && c.cap_enforced === true && c.submission_blank_guard === true, detail: !error && c?.blank_payees_allowed && c.restricted_payees_blocked && c.cap_enforced && c.submission_blank_guard ? "Blank lists allow named contractors; restricted lists reject unlisted payees; 10 NEAR caps reject 10.01 NEAR. Submission and approval guards agree." : "Payee regression checks did not pass. Keep requests paused until the payment safeguards are repaired." });
  const { error: profileError } = await context.supabase.from("profiles").select("id").eq("id", context.userId).single();
  checks.push({ id: "account", label: "Account database access", passed: !profileError, detail: profileError ? "Your profile is missing or unreadable. Ask Lovable to check account setup and access policies." : "Your signed-in account can read its own profile." });
  checks.push({ id: "ai", label: "AI configuration", passed: !!process.env["LOVABLE_API_KEY"], detail: process.env["LOVABLE_API_KEY"] ? "AI key is configured. Explain results performs a live AI check." : "Lovable AI is not configured. Ask Lovable to provision the managed AI key." });
  return { checks, checkedAt: new Date().toISOString() };
});

export const explainSetup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  // Build the report on the server; never let a client supply logs, secrets, or diagnostics to the model.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("payrail_setup_checks");
  const { verifyEscrowAccount } = await import("@/lib/near/client.server");
  let escrowReachable = false;
  try { await verifyEscrowAccount(); escrowReachable = true; } catch { /* report only a safe boolean */ }
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Lovable AI is not configured.");
  const { assertAiAccess, handleAiFailure } = await import("@/lib/ai/access.server");
  await assertAiAccess(context.userId);
  const { createResponsesCall } = await import("@/lib/ai/responses.server");
  try {
    const { result } = createResponsesCall(new Request("https://payrail.local/setup"), { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" }, [{ role: "user", content: JSON.stringify({ escrowReachable, databaseReachable: !error, checks: error ? null : data }) }], "Explain Payrail setup check results in short plain-language bullets. Recommend concrete safe fixes, not changes to payment safeguards. Settlement uses a NEAR testnet escrow account only. Keys belong in Project Settings → Secrets, never chat. Missing schema must be applied by Lovable; no deleting tables, disabling RLS, or claiming migration history was verified. Do not invent tests. This report contains booleans only and no credentials. State that a reachable escrow account does not prove a full hold and on-chain release.");
    const text = await result.text;
    if (!text.trim()) throw new Error("The AI returned no explanation.");
    return { explanation: text };
  } catch (err) { return handleAiFailure(context.userId, err); }
});