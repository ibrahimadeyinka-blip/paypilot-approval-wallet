import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkSetup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const checks: { id: string; label: string; passed: boolean; detail: string }[] = [];
  const { verifySandboxCredentials } = await import("@/lib/paypal/client.server");
  try { await verifySandboxCredentials(); checks.push({ id: "paypal", label: "PayPal Sandbox credentials", passed: true, detail: "PayPal accepted the credentials. No order or payment was created." }); }
  catch { checks.push({ id: "paypal", label: "PayPal Sandbox credentials", passed: false, detail: "Sandbox credentials are missing, rejected, or PayPal is unreachable. Update both keys in Project Settings → Secrets and check Sandbox Apps & Credentials." }); }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("payrail_setup_checks");
  const c = data as { schema_ready?: boolean; blank_payees_allowed?: boolean; restricted_payees_blocked?: boolean; cap_enforced?: boolean; submission_blank_guard?: boolean } | null;
  checks.push({ id: "database", label: "Database migration readiness", passed: !error && c?.schema_ready === true, detail: !error && c?.schema_ready ? "Required app tables and the setup-check function are available. This checks the applied schema, not historical migration files." : "Required schema or the setup-check function is unavailable. Ask Lovable to apply the missing setup changes; do not clear existing data." });
  checks.push({ id: "payees", label: "Blank-payee safeguards", passed: !error && c?.blank_payees_allowed === true && c.restricted_payees_blocked === true && c.cap_enforced === true && c.submission_blank_guard === true, detail: !error && c?.blank_payees_allowed && c.restricted_payees_blocked && c.cap_enforced && c.submission_blank_guard ? "Blank lists allow named contractors; restricted lists reject unlisted payees; $10 caps reject $10.01. Submission and approval guards agree." : "Payee regression checks did not pass. Keep requests paused until the payment safeguards are repaired." });
  const { error: profileError } = await context.supabase.from("profiles").select("id").eq("id", context.userId).single();
  checks.push({ id: "account", label: "Account database access", passed: !profileError, detail: profileError ? "Your profile is missing or unreadable. Ask Lovable to check account setup and access policies." : "Your signed-in account can read its own profile." });
  checks.push({ id: "ai", label: "AI configuration", passed: !!process.env["LOVABLE_API_KEY"], detail: process.env["LOVABLE_API_KEY"] ? "AI key is configured. Explain results performs a live AI check." : "Lovable AI is not configured. Ask Lovable to provision the managed AI key." });
  return { checks, checkedAt: new Date().toISOString() };
});

export const explainSetup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  // Build the report on the server; never let a client supply logs, secrets, or diagnostics to the model.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("payrail_setup_checks");
  const { verifySandboxCredentials } = await import("@/lib/paypal/client.server");
  let paypalAccepted = false;
  try { await verifySandboxCredentials(); paypalAccepted = true; } catch { /* report only a safe boolean */ }
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Lovable AI is not configured.");
  const { assertAiAccess, handleAiFailure } = await import("@/lib/ai/access.server");
  await assertAiAccess(context.userId);
  const { createResponsesCall } = await import("@/lib/ai/responses.server");
  try {
    const { result } = createResponsesCall(new Request("https://payrail.local/setup"), { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" }, [{ role: "user", content: JSON.stringify({ paypalAccepted, databaseReachable: !error, checks: error ? null : data }) }], "Explain Payrail setup check results in short plain-language bullets. Recommend concrete safe fixes, not changes to payment safeguards. PayPal is Sandbox only. Keys belong in Project Settings → Secrets, never chat. Missing schema must be applied by Lovable; no deleting tables, disabling RLS, or claiming migration history was verified. Do not invent tests. This report contains booleans only and no credentials. State that accepted credentials do not prove a full checkout, hold, or capture.");
    const text = await result.text;
    if (!text.trim()) throw new Error("The AI returned no explanation.");
    return { explanation: text };
  } catch (err) { return handleAiFailure(context.userId, err); }
});