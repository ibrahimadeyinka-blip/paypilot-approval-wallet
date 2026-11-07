import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sandboxPaypal } from "@/lib/paypal/client.server";

/** Privileged database RPC caller + Sandbox PayPal client. Only load after verifying the caller. */
export function getServerDeps() {
  const callRpc = supabaseAdmin.rpc.bind(supabaseAdmin) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await callRpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  return { rpc, paypal: sandboxPaypal, admin: supabaseAdmin };
}
