import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { nearEscrow } from "@/lib/near/client.server";

/** Privileged database RPC caller + NEAR testnet escrow client. Only load after verifying the caller. */
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
  return { rpc, paypal: nearEscrow, admin: supabaseAdmin };
}
